import { createId } from '../../core/utils/id';
import type {
  P2PTransportAdapter,
  P2PTransportFactoryContext,
  P2PTransportMessageContext,
  P2PTransportRosterEntry,
  P2PTransportRouteSwitchEvent,
  P2PWireEnvelope,
  P2PTargetPeer
} from './P2PTransportAdapter';
import { isP2PWireEnvelope } from './P2PTransportAdapter';
import { ServerRelayTransport } from '../ServerRelayTransport';

const DIRECT_RETRY_MS = 5_000;
const RTC_RETRY_MS = 2_000;
const RTC_OFFER_TIMEOUT_MS = 8_000;
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
};

type WebRtcSignal =
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit };

interface PeerChannel {
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
}

export class HybridSessionTransport implements P2PTransportAdapter {
  readonly id = 'hybrid-session';
  readonly label = 'Hybrid session';
  readonly sessionMode = 'hybrid' as const;
  peerId: string;

  private server: ServerRelayTransport;
  private roster = new Map<string, P2PTransportRosterEntry>();
  private trysteroPeers = new Set<string>();
  private rtcPeers = new Set<string>();
  private visiblePeers = new Set<string>();
  private peerChannels = new Map<string, PeerChannel>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
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
  private rtcRetryTimers = new Map<string, number>();
  private connected = false;

  constructor(private direct: P2PTransportAdapter, private context: P2PTransportFactoryContext) {
    this.peerId = context.participantId;
    this.direct.peerId = this.peerId;
    this.server = new ServerRelayTransport(context);
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    this.connected = true;
    this.roomId = roomId;
    this.bind();
    void this.connectDirect();
    await this.server.connect(roomId);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.roomId = '';
    globalThis.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.rtcRetryTimers.forEach((timer) => globalThis.clearTimeout(timer));
    this.rtcRetryTimers.clear();
    this.unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.peerChannels.forEach(({ channel, connection }) => {
      channel?.close();
      connection.close();
    });
    this.peerChannels.clear();
    await Promise.allSettled([this.direct.disconnect(), this.server.disconnect()]);
    this.roster.clear();
    this.trysteroPeers.clear();
    this.rtcPeers.clear();
    this.visiblePeers.clear();
    this.pendingCandidates.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    const controlType = envelope.channel === 'control' && envelope.payload && typeof envelope.payload === 'object'
      ? (envelope.payload as { type?: unknown }).type
      : null;
    if (controlType === 'hello') {
      void this.server.send(envelope, targetPeer).catch(() => undefined);
    } else if (controlType === 'goodbye') {
      await Promise.allSettled([this.sendDirect(envelope, targetPeer), this.server.send(envelope, targetPeer)]);
      return;
    }
    await this.sendDirect(envelope, targetPeer);
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
    return Array.from(new Set([...this.rtcPeers, ...this.trysteroPeers]));
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

  private async sendDirect(envelope: P2PWireEnvelope, targetPeer?: string): Promise<void> {
    if (envelope.channel === 'control') {
      await this.direct.send(envelope, targetPeer);
      const targets = targetPeer ? [targetPeer] : Array.from(this.rtcPeers);
      targets.forEach((peerId) => this.sendRtc(peerId, envelope));
      return;
    }
    const targets = targetPeer
      ? [targetPeer]
      : Array.from(new Set([...this.roster.keys(), ...this.rtcPeers, ...this.trysteroPeers]));
    if (targets.length === 0) return;
    await Promise.allSettled(targets.map(async (peerId) => {
      if (this.sendRtc(peerId, envelope)) return;
      if (this.trysteroPeers.has(peerId)) await this.direct.send(envelope, peerId);
    }));
  }

  private sendRtc(peerId: string, envelope: P2PWireEnvelope): boolean {
    const channel = this.peerChannels.get(peerId)?.channel;
    if (!channel || channel.readyState !== 'open') return false;
    channel.send(JSON.stringify(envelope));
    return true;
  }

  private bind(): void {
    this.unsubscriptions.push(
      this.direct.subscribe((envelope, context) => this.deliver(envelope, context)),
      this.server.subscribe((envelope, context) => this.handleServerEnvelope(envelope, context)),
      this.direct.onPeerJoin((peerId) => {
        this.trysteroPeers.add(peerId);
        this.addVisiblePeer(peerId);
        this.emitDiagnostics();
      }),
      this.direct.onPeerLeave((peerId) => {
        this.trysteroPeers.delete(peerId);
        if (!this.roster.has(peerId) && !this.rtcPeers.has(peerId)) this.removeVisiblePeer(peerId);
        this.emitDiagnostics();
      }),
      this.server.onRosterChange?.((roster) => this.updateRoster(roster)) ?? (() => undefined),
      this.server.onPeerJoin((peerId) => this.addVisiblePeer(peerId)),
      this.server.onPeerLeave((peerId) => {
        this.roster.delete(peerId);
        this.closeRtcPeer(peerId);
        if (!this.trysteroPeers.has(peerId)) this.removeVisiblePeer(peerId);
      }),
      this.direct.onError(() => this.emitDiagnostics()),
      this.server.onError(() => this.emitDiagnostics()),
      this.direct.onDiagnosticsChange?.(() => this.emitDiagnostics()) ?? (() => undefined),
      this.direct.onRouteSwitch?.((event) => this.routeSwitchListeners.forEach((listener) => listener(event))) ?? (() => undefined)
    );
  }

  private updateRoster(entries: P2PTransportRosterEntry[]): void {
    this.roster = new Map(entries.filter((entry) => entry.peerId !== this.peerId).map((entry) => [entry.peerId, entry]));
    this.roster.forEach((entry, peerId) => {
      this.addVisiblePeer(peerId);
      if (this.context.role === 'gm' && entry.role === 'player') void this.offerRtcConnection(peerId);
    });
    Array.from(this.visiblePeers).forEach((peerId) => {
      if (!this.roster.has(peerId) && !this.trysteroPeers.has(peerId) && !this.rtcPeers.has(peerId)) this.removeVisiblePeer(peerId);
    });
    const roster = this.getRoster();
    this.rosterListeners.forEach((listener) => listener(roster));
    this.emitDiagnostics();
  }

  private handleServerEnvelope(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext): void {
    const payload = envelope.payload;
    if (envelope.channel === 'control' && payload && typeof payload === 'object' && (payload as { type?: unknown }).type === 'webrtc-signal') {
      const signal = (payload as { signal?: unknown }).signal;
      if (isWebRtcSignal(signal)) void this.handleWebRtcSignal(envelope.sender.peerId, signal);
      return;
    }
    const event = envelope.channel === 'data' && payload && typeof payload === 'object'
      ? payload as { id?: unknown; kind?: unknown }
      : null;
    if (event?.kind === 'snapshot' && typeof event.id === 'string' && event.id.startsWith('server-snapshot-')) {
      this.deliver(envelope, context);
    }
  }

  private async offerRtcConnection(peerId: string): Promise<void> {
    if (!this.connected || typeof RTCPeerConnection === 'undefined' || this.rtcPeers.has(peerId)) return;
    const existing = this.peerChannels.get(peerId);
    if (existing && existing.connection.connectionState !== 'failed' && existing.connection.connectionState !== 'closed') return;
    const peer = this.createRtcPeer(peerId);
    this.attachRtcChannel(peerId, peer.connection.createDataChannel('daggerheart-sync', { ordered: true }));
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    await this.sendSignal(peerId, { kind: 'description', description: offer });
    this.scheduleRtcRetry(peerId, RTC_OFFER_TIMEOUT_MS);
  }

  private async handleWebRtcSignal(peerId: string, signal: WebRtcSignal): Promise<void> {
    if (!this.connected || typeof RTCPeerConnection === 'undefined') return;
    if (signal.kind === 'candidate') {
      const peer = this.peerChannels.get(peerId);
      if (!peer?.connection.remoteDescription) {
        const pending = this.pendingCandidates.get(peerId) ?? [];
        pending.push(signal.candidate);
        this.pendingCandidates.set(peerId, pending);
        return;
      }
      await peer.connection.addIceCandidate(signal.candidate).catch(() => undefined);
      return;
    }
    if (signal.description.type === 'offer') {
      this.closeRtcPeer(peerId);
      const peer = this.createRtcPeer(peerId);
      await peer.connection.setRemoteDescription(signal.description);
      await this.flushPendingCandidates(peerId);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.sendSignal(peerId, { kind: 'description', description: answer });
      return;
    }
    const peer = this.peerChannels.get(peerId);
    if (!peer || signal.description.type !== 'answer') return;
    await peer.connection.setRemoteDescription(signal.description);
    await this.flushPendingCandidates(peerId);
  }

  private createRtcPeer(peerId: string): PeerChannel {
    const connection = new RTCPeerConnection(RTC_CONFIGURATION);
    const peer: PeerChannel = {
      connection,
      channel: null,
      pendingCandidates: this.pendingCandidates.get(peerId) ?? []
    };
    this.pendingCandidates.delete(peerId);
    this.peerChannels.set(peerId, peer);
    connection.onicecandidate = (event) => {
      if (event.candidate) void this.sendSignal(peerId, { kind: 'candidate', candidate: event.candidate.toJSON() });
    };
    connection.ondatachannel = (event) => this.attachRtcChannel(peerId, event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.rtcPeers.delete(peerId);
        this.emitDiagnostics();
        if (connection.connectionState === 'failed' && this.context.role === 'gm' && this.roster.has(peerId)) this.scheduleRtcRetry(peerId);
      }
    };
    return peer;
  }

  private attachRtcChannel(peerId: string, channel: RTCDataChannel): void {
    const peer = this.peerChannels.get(peerId);
    if (!peer) return;
    peer.channel = channel;
    channel.onopen = () => {
      globalThis.clearTimeout(this.rtcRetryTimers.get(peerId));
      this.rtcRetryTimers.delete(peerId);
      this.rtcPeers.add(peerId);
      this.addVisiblePeer(peerId);
      this.emitDiagnostics();
    };
    channel.onclose = () => {
      this.rtcPeers.delete(peerId);
      this.emitDiagnostics();
    };
    channel.onmessage = (event) => {
      try {
        const envelope = JSON.parse(String(event.data)) as unknown;
        if (isP2PWireEnvelope(envelope)) this.deliver(envelope, { sourcePeerId: peerId, verifiedSourcePeerId: `server-signaled:${peerId}` });
      } catch {
        // Ignore malformed data-channel messages.
      }
    };
  }

  private async flushPendingCandidates(peerId: string): Promise<void> {
    const peer = this.peerChannels.get(peerId);
    if (!peer) return;
    const candidates = peer.pendingCandidates.splice(0);
    await Promise.allSettled(candidates.map((candidate) => peer.connection.addIceCandidate(candidate)));
  }

  private async sendSignal(peerId: string, signal: WebRtcSignal): Promise<void> {
    await this.server.send({
      version: 2,
      id: createId('webrtc_signal'),
      channel: 'control',
      sender: { peerId: this.peerId, role: this.context.role },
      sentAt: new Date().toISOString(),
      payload: { type: 'webrtc-signal', signal }
    }, peerId);
  }

  private scheduleRtcRetry(peerId: string, delay = RTC_RETRY_MS): void {
    globalThis.clearTimeout(this.rtcRetryTimers.get(peerId));
    const timer = globalThis.setTimeout(() => {
      this.rtcRetryTimers.delete(peerId);
      this.closeRtcPeer(peerId);
      void this.offerRtcConnection(peerId);
    }, delay) as unknown as number;
    this.rtcRetryTimers.set(peerId, timer);
  }

  private closeRtcPeer(peerId: string): void {
    const peer = this.peerChannels.get(peerId);
    peer?.channel?.close();
    peer?.connection.close();
    this.peerChannels.delete(peerId);
    this.rtcPeers.delete(peerId);
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

function isWebRtcSignal(value: unknown): value is WebRtcSignal {
  if (!value || typeof value !== 'object') return false;
  const signal = value as { kind?: unknown; description?: unknown; candidate?: unknown };
  if (signal.kind === 'candidate') return Boolean(signal.candidate && typeof signal.candidate === 'object');
  if (signal.kind !== 'description' || !signal.description || typeof signal.description !== 'object') return false;
  const type = (signal.description as { type?: unknown }).type;
  return type === 'offer' || type === 'answer';
}
