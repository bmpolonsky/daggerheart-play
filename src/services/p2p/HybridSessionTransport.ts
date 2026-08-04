import type {
  P2PTransportAdapter,
  P2PTransportFactoryContext,
  P2PTransportMessageContext,
  P2PTransportRosterEntry,
  P2PTransportRouteSwitchEvent,
  P2PWireEnvelope,
  P2PTargetPeer
} from './P2PTransportAdapter';
import { ServerRelayTransport } from '../ServerRelayTransport';

const DIRECT_RETRY_MS = 5_000;
const SERVER_FALLBACK_DELAY_MS = 350;
const MAX_SEEN_ENVELOPES = 1_000;

/**
 * The server owns room lifecycle, roster and the initial cloud snapshot.
 * Live data prefers direct WebRTC and falls back to the server per participant.
 */
export class HybridSessionTransport implements P2PTransportAdapter {
  readonly id = 'hybrid-session';
  readonly label = 'Hybrid session';
  readonly sessionMode = 'hybrid' as const;
  peerId: string;

  private server: ServerRelayTransport;
  private roster = new Map<string, P2PTransportRosterEntry>();
  private directPeers = new Set<string>();
  private visiblePeers = new Set<string>();
  private seenEnvelopeIds = new Set<string>();
  private seenEnvelopeOrder: string[] = [];
  private listeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private joinListeners = new Set<(peerId: string) => void>();
  private leaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private diagnosticsListeners = new Set<() => void>();
  private rosterListeners = new Set<(roster: P2PTransportRosterEntry[]) => void>();
  private routeSwitchListeners = new Set<(event: P2PTransportRouteSwitchEvent) => void>();
  private unsubscriptions: Array<() => void> = [];
  private roomId = '';
  private retryTimer: number | undefined;
  private connected = false;

  constructor(private direct: P2PTransportAdapter, context: P2PTransportFactoryContext) {
    this.peerId = context.participantId;
    this.direct.peerId = this.peerId;
    this.server = new ServerRelayTransport(context);
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    this.connected = true;
    this.roomId = roomId;
    this.bind();
    await this.server.connect(roomId);
    void this.connectDirect();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.roomId = '';
    globalThis.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    await Promise.allSettled([this.direct.disconnect(), this.server.disconnect()]);
    this.roster.clear();
    this.directPeers.clear();
    this.visiblePeers.clear();
    this.seenEnvelopeIds.clear();
    this.seenEnvelopeOrder = [];
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    const controlType = envelope.channel === 'control' && envelope.payload && typeof envelope.payload === 'object'
      ? (envelope.payload as { type?: unknown }).type
      : null;
    if (controlType === 'hello') {
      await Promise.allSettled([this.direct.send(envelope, targetPeer), this.server.send(envelope, targetPeer)]);
      return;
    } else if (controlType === 'goodbye') {
      await Promise.allSettled([this.direct.send(envelope, targetPeer), this.server.send(envelope, targetPeer)]);
      return;
    }
    if (envelope.channel === 'control') {
      await this.direct.send(envelope, targetPeer).catch(() => undefined);
      return;
    }
    if (targetPeer) {
      await this.sendToPeer(envelope, targetPeer);
      return;
    }
    const recipients = new Set([...this.roster.keys(), ...this.directPeers]);
    if (recipients.size === 0) {
      await this.server.send(envelope);
      return;
    }
    await Promise.all(Array.from(recipients, (peerId) => this.sendToPeer(envelope, peerId)));
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPeerJoin(listener: (peerId: string) => void): () => void {
    this.joinListeners.add(listener);
    return () => this.joinListeners.delete(listener);
  }

  onPeerLeave(listener: (peerId: string) => void): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onDiagnosticsChange(listener: () => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  onRosterChange(listener: (roster: P2PTransportRosterEntry[]) => void): () => void {
    this.rosterListeners.add(listener);
    return () => this.rosterListeners.delete(listener);
  }

  onRouteSwitch(listener: (event: P2PTransportRouteSwitchEvent) => void): () => void {
    this.routeSwitchListeners.add(listener);
    return () => this.routeSwitchListeners.delete(listener);
  }

  getRoster(): P2PTransportRosterEntry[] {
    return Array.from(this.roster.values());
  }

  getDirectPeerIds(): string[] {
    return Array.from(this.directPeers);
  }

  getRouteDiagnostics = () => this.direct.getRouteDiagnostics?.() ?? [];
  getPeerDiagnostics = () => this.direct.getPeerDiagnostics?.() ?? [];
  getMediaDiagnostics = () => this.direct.getMediaDiagnostics?.() ?? Promise.resolve([]);

  private async connectDirect(): Promise<void> {
    if (!this.connected || !this.roomId) return;
    try {
      await this.direct.connect(this.roomId);
      this.emitDiagnostics();
    } catch {
      if (!this.connected) return;
      globalThis.clearTimeout(this.retryTimer);
      this.retryTimer = globalThis.setTimeout(() => void this.connectDirect(), DIRECT_RETRY_MS) as unknown as number;
      this.emitDiagnostics();
    }
  }

  private bind(): void {
    this.unsubscriptions.push(
      this.direct.subscribe((envelope, context) => this.deliver(envelope, context)),
      this.server.subscribe((envelope, context) => this.handleServerEnvelope(envelope, context)),
      this.direct.onPeerJoin((peerId) => {
        this.directPeers.add(peerId);
        this.addVisiblePeer(peerId);
        this.emitDiagnostics();
      }),
      this.direct.onPeerLeave((peerId) => {
        this.directPeers.delete(peerId);
        if (!this.roster.has(peerId)) this.removeVisiblePeer(peerId);
        this.emitDiagnostics();
      }),
      this.server.onRosterChange?.((roster) => this.updateRoster(roster)) ?? (() => undefined),
      this.server.onPeerJoin((peerId) => this.addVisiblePeer(peerId)),
      this.server.onPeerLeave((peerId) => {
        this.roster.delete(peerId);
        if (!this.directPeers.has(peerId)) this.removeVisiblePeer(peerId);
      }),
      this.direct.onError(() => this.emitDiagnostics()),
      this.server.onError(() => this.emitDiagnostics()),
      this.direct.onDiagnosticsChange?.(() => this.emitDiagnostics()) ?? (() => undefined),
      this.direct.onRouteSwitch?.((event) => this.routeSwitchListeners.forEach((listener) => listener(event))) ?? (() => undefined)
    );
  }

  private updateRoster(entries: P2PTransportRosterEntry[]): void {
    this.roster = new Map(entries.filter((entry) => entry.peerId !== this.peerId).map((entry) => [entry.peerId, entry]));
    this.roster.forEach((_entry, peerId) => this.addVisiblePeer(peerId));
    Array.from(this.visiblePeers).forEach((peerId) => {
      if (!this.roster.has(peerId) && !this.directPeers.has(peerId)) this.removeVisiblePeer(peerId);
    });
    const roster = this.getRoster();
    this.rosterListeners.forEach((listener) => listener(roster));
    this.emitDiagnostics();
  }

  private handleServerEnvelope(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext): void {
    if (envelope.channel === 'data') this.deliver(envelope, context);
  }

  private async sendToPeer(envelope: P2PWireEnvelope, peerId: string): Promise<void> {
    if (!this.directPeers.has(peerId)) {
      await this.server.send(envelope, peerId);
      return;
    }
    let fallbackTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const delayedServerFallback = new Promise<void>((resolve, reject) => {
      fallbackTimer = globalThis.setTimeout(() => {
        void this.server.send(envelope, peerId).then(resolve, reject);
      }, SERVER_FALLBACK_DELAY_MS);
    });
    try {
      await Promise.any([this.direct.send(envelope, peerId), delayedServerFallback]);
    } finally {
      globalThis.clearTimeout(fallbackTimer);
    }
  }

  private addVisiblePeer(peerId: string): void {
    if (!peerId || peerId === this.peerId || this.visiblePeers.has(peerId)) return;
    this.visiblePeers.add(peerId);
    this.joinListeners.forEach((listener) => listener(peerId));
  }

  private removeVisiblePeer(peerId: string): void {
    if (!this.visiblePeers.delete(peerId)) return;
    this.leaveListeners.forEach((listener) => listener(peerId));
  }

  private deliver(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext): void {
    if (this.seenEnvelopeIds.has(envelope.id)) return;
    this.seenEnvelopeIds.add(envelope.id);
    this.seenEnvelopeOrder.push(envelope.id);
    if (this.seenEnvelopeOrder.length > MAX_SEEN_ENVELOPES) {
      const oldest = this.seenEnvelopeOrder.shift();
      if (oldest) this.seenEnvelopeIds.delete(oldest);
    }
    this.listeners.forEach((listener) => listener(envelope, {
      ...context,
      sourcePeerId: envelope.sender.peerId,
      verifiedSourcePeerId: `hybrid:${envelope.sender.peerId}`
    }));
  }

  private emitDiagnostics(): void {
    this.diagnosticsListeners.forEach((listener) => listener());
  }
}
