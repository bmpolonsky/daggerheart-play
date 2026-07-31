import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/date';
import type { SyncEvent, SyncEventContext, SyncTargetPeer, SyncTransport, TableParticipant } from '../../domain/tabletop/types';
import type { P2PBinaryPayload, P2PBinaryProgressHandler, P2PMediaConnectionDiagnostic, P2PTargetPeer, P2PTransportAdapter, P2PTransportMessageContext, P2PTransportPeerDiagnostic, P2PTransportRouteDiagnostic, P2PTransportRouteSwitchEvent, P2PWireEnvelope, P2PWireRole } from './P2PTransportAdapter';

export type P2PRoomConnectionStatus = 'connected' | 'degraded';

export type P2PRoomConnectionEvent =
  | { type: 'ready'; role: P2PWireRole; roomId: string; peerId: string; peers: string[] }
  | { type: 'peer-joined'; peerId: string; role: P2PWireRole | null; peers: string[] }
  | { type: 'peer-left'; peerId: string; role: P2PWireRole | null; peers: string[] }
  | { type: 'gm-lost'; peers: string[] }
  | { type: 'gm-restored'; peerId: string; peers: string[] }
  | { type: 'diagnostics-updated'; peers: string[] }
  | { type: 'route-switched'; peers: string[]; switch: P2PTransportRouteSwitchEvent }
  | { type: 'error'; message: string };

export interface P2PRoomConnectionConfig {
  heartbeatMs?: number;
  gmTimeoutMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_GM_TIMEOUT_MS = 15_000;

export class P2PRoomConnection implements SyncTransport {
  readonly id: string;
  readonly label: string;

  private roomId = '';
  private role: P2PWireRole | null = null;
  private peerIds = new Set<string>();
  private peerSignals = new Map<string, number>();
  private peerRoles = new Map<string, P2PWireRole>();
  private dataListeners = new Set<(event: SyncEvent, context?: SyncEventContext) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: unknown) => void>();
  private binaryProgressListeners = new Set<P2PBinaryProgressHandler>();
  private mediaStreamListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();
  private roomEventListeners = new Set<(event: P2PRoomConnectionEvent) => void>();
  private unsubscribeAdapter: Array<() => void> = [];
  private heartbeatTimer: number | undefined;
  private lastGmSignalAt = 0;
  private startedAt = 0;
  private ready = false;
  private hasGmSignal = false;
  private status: P2PRoomConnectionStatus = 'connected';

  constructor(
    private adapter: P2PTransportAdapter,
    private config: P2PRoomConnectionConfig = {}
  ) {
    this.id = adapter.id;
    this.label = adapter.label;
  }

  get peerId(): string {
    return this.adapter.peerId;
  }

  peers(): string[] {
    return Array.from(this.peerIds);
  }

  gmPeerId(): string | null {
    for (const [peerId, role] of this.peerRoles.entries()) {
      if (role === 'gm') {
        return peerId;
      }
    }
    return null;
  }

  routeDiagnostics(): P2PTransportRouteDiagnostic[] {
    return this.adapter.getRouteDiagnostics?.() ?? [];
  }

  peerDiagnostics(): P2PTransportPeerDiagnostic[] {
    return this.adapter.getPeerDiagnostics?.() ?? [];
  }

  async mediaDiagnostics(): Promise<P2PMediaConnectionDiagnostic[]> {
    return await this.adapter.getMediaDiagnostics?.() ?? [];
  }

  subscribeRoomEvents(listener: (event: P2PRoomConnectionEvent) => void): () => void {
    this.roomEventListeners.add(listener);
    return () => this.roomEventListeners.delete(listener);
  }

  async connect(roomId: string, participant: TableParticipant): Promise<void> {
    await this.disconnect();
    this.roomId = roomId;
    this.role = participant.role === 'gm' ? 'gm' : 'player';
    this.status = 'connected';
    const now = Date.now();
    this.startedAt = now;
    this.lastGmSignalAt = 0;
    this.hasGmSignal = false;
    this.ready = false;
    this.bindAdapterEvents();
    await this.adapter.connect(roomId);
    await this.sendControl({ type: 'hello' });
    if (this.role === 'player') {
      await this.sendControl({ type: 'player-ping' });
    }
    this.startHeartbeat();
    this.ready = true;
    this.emitRoomEvent({ type: 'ready', role: this.role, roomId, peerId: this.peerId, peers: this.peers() });
  }

  async disconnect(): Promise<void> {
    await this.sendControl({ type: 'goodbye' }).catch(() => undefined);
    this.stopHeartbeat();
    this.unsubscribeAdapter.splice(0).forEach((unsubscribe) => unsubscribe());
    await this.adapter.disconnect();
    this.peerIds.clear();
    this.peerSignals.clear();
    this.peerRoles.clear();
    this.roomId = '';
    this.role = null;
    this.lastGmSignalAt = 0;
    this.startedAt = 0;
    this.ready = false;
    this.hasGmSignal = false;
    this.status = 'connected';
  }

  async publish(event: SyncEvent, targetPeer?: SyncTargetPeer): Promise<void> {
    await this.sendEnvelope('data', event, targetPeer);
  }

  subscribe(listener: (event: SyncEvent, context?: SyncEventContext) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  async sendBinary(data: P2PBinaryPayload, metadata?: unknown, targetPeer?: P2PTargetPeer, progress?: P2PBinaryProgressHandler): Promise<void> {
    if (!this.adapter.sendBinary) {
      throw new Error('P2P transport does not support binary payloads.');
    }
    if (!this.role || !this.roomId || !this.peerId) {
      return;
    }
    await this.adapter.sendBinary(data, targetPeer, metadata, progress);
  }

  subscribeBinary(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void): () => void {
    this.binaryListeners.add(listener);
    return () => this.binaryListeners.delete(listener);
  }

  subscribeBinaryProgress(listener: P2PBinaryProgressHandler): () => void {
    this.binaryProgressListeners.add(listener);
    return () => this.binaryProgressListeners.delete(listener);
  }

  async publishMediaStream(stream: MediaStream, metadata?: unknown): Promise<void> {
    if (!this.adapter.publishMediaStream) {
      throw new Error('P2P transport does not support media streams.');
    }
    await this.adapter.publishMediaStream(stream, metadata);
  }

  removeMediaStream(stream: MediaStream): void {
    this.adapter.removeMediaStream?.(stream);
  }

  async addMediaTrack(track: MediaStreamTrack, stream: MediaStream, metadata?: unknown): Promise<void> {
    if (!this.adapter.addMediaTrack) {
      throw new Error('P2P transport does not support adding media tracks.');
    }
    await this.adapter.addMediaTrack(track, stream, metadata);
  }

  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void {
    this.mediaStreamListeners.add(listener);
    return () => this.mediaStreamListeners.delete(listener);
  }

  private bindAdapterEvents(): void {
    this.unsubscribeAdapter.push(
      this.adapter.subscribe((envelope, context) => this.handleEnvelope(envelope, context)),
      this.adapter.onPeerJoin((peerId) => this.handlePeerJoin(peerId)),
      this.adapter.onPeerLeave((peerId) => this.removePeer(peerId)),
      this.adapter.onError((message) => this.emitRoomEvent({ type: 'error', message })),
      this.adapter.onDiagnosticsChange?.(() => this.emitRoomEvent({ type: 'diagnostics-updated', peers: this.peers() })) ?? (() => undefined),
      this.adapter.onRouteSwitch?.((routeSwitch) => this.emitRoomEvent({ type: 'route-switched', peers: this.peers(), switch: routeSwitch })) ?? (() => undefined),
      this.adapter.subscribeBinary?.((data, peerId, metadata) => this.handleBinary(peerId, data, metadata)) ?? (() => undefined),
      this.adapter.subscribeBinaryProgress?.((percent, peerId, metadata) => {
        this.binaryProgressListeners.forEach((listener) => listener(percent, peerId, metadata));
      }) ?? (() => undefined),
      this.adapter.subscribeMediaStreams?.((stream, peerId, metadata) => {
        this.mediaStreamListeners.forEach((listener) => listener(stream, peerId, metadata));
      }) ?? (() => undefined)
    );
  }

  private handleEnvelope(envelope: P2PWireEnvelope, transportContext?: P2PTransportMessageContext): void {
    const peerId = transportContext?.sourcePeerId || envelope.sender.peerId;
    const verifiedSourcePeerId = transportContext?.verifiedSourcePeerId || peerId;
    if (!this.role || peerId === this.peerId) {
      return;
    }
    const peerWasAdded = this.rememberPeer(peerId, Date.now(), envelope.sender.role);
    if (peerWasAdded && envelope.sender.role === 'gm' && this.role === 'player') {
      this.markGmSeen(peerId);
    }
    if (envelope.channel === 'control') {
      this.handleControl(envelope, peerId);
      return;
    }
    const event = envelope.payload;
    if (isSyncEvent(event)) {
      if (envelope.sender.role === 'gm' && this.role === 'player') {
        this.markGmSeen(peerId);
      }
      const context: SyncEventContext = { sourcePeerId: peerId, verifiedSourcePeerId };
      this.dataListeners.forEach((listener) => listener(event, context));
    }
  }

  private handleBinary(peerId: string, data: ArrayBuffer, metadata?: unknown): void {
    this.rememberPeer(peerId, Date.now());
    if (this.role === 'player' && this.peerRoles.get(peerId) === 'gm') {
      this.markGmSeen(peerId);
    }
    this.binaryListeners.forEach((listener) => listener(data, peerId, metadata));
  }

  private handleControl(envelope: P2PWireEnvelope, peerId: string): void {
    const payload = envelope.payload;
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const type = (payload as { type?: unknown }).type;
    if (type === 'goodbye') {
      this.removePeer(peerId);
      return;
    }
    if (this.role === 'gm' && envelope.sender.role === 'player' && (type === 'hello' || type === 'player-ping')) {
      void this.sendControl({ type: 'gm-pong' });
      return;
    }
    if (this.role === 'player' && envelope.sender.role === 'gm' && (type === 'hello' || type === 'gm-pong')) {
      this.markGmSeen(peerId);
    }
  }

  private handlePeerJoin(peerId: string): void {
    this.rememberPeer(peerId, Date.now());
    if (this.role === 'gm') {
      void this.sendControl({ type: 'gm-pong' });
    }
    if (this.role === 'player') {
      void this.sendControl({ type: 'hello' });
      void this.sendControl({ type: 'player-ping' });
    }
  }

  private rememberPeer(peerId: string, now: number, role?: P2PWireRole): boolean {
    if (!peerId) {
      return false;
    }
    this.peerSignals.set(peerId, now);
    if (role) {
      this.peerRoles.set(peerId, role);
    }
    if (this.peerIds.has(peerId)) {
      return false;
    }
    this.peerIds.add(peerId);
    this.emitRoomEvent({ type: 'peer-joined', peerId, role: role ?? null, peers: this.peers() });
    return true;
  }

  private removePeer(peerId: string): void {
    const role = this.peerRoles.get(peerId) ?? null;
    if (!this.peerIds.delete(peerId)) {
      return;
    }
    this.peerSignals.delete(peerId);
    this.peerRoles.delete(peerId);
    this.emitRoomEvent({ type: 'peer-left', peerId, role, peers: this.peers() });
    if (this.role === 'player' && (role === 'gm' || this.peerIds.size === 0) && this.status !== 'degraded') {
      this.status = 'degraded';
      this.hasGmSignal = false;
      this.emitRoomEvent({ type: 'gm-lost', peers: this.peers() });
    }
  }

  private markGmSeen(peerId: string): void {
    const wasDegraded = this.status === 'degraded';
    const shouldEmitRestored = wasDegraded || (this.ready && !this.hasGmSignal);
    this.lastGmSignalAt = Date.now();
    this.hasGmSignal = true;
    this.status = 'connected';
    this.replaceStaleGmPeers(peerId);
    this.rememberPeer(peerId, this.lastGmSignalAt, 'gm');
    if (shouldEmitRestored) {
      this.emitRoomEvent({ type: 'gm-restored', peerId, peers: this.peers() });
    }
  }

  private replaceStaleGmPeers(activePeerId: string): void {
    if (this.role !== 'player') {
      return;
    }
    const stalePeerIds = Array.from(this.peerRoles.entries())
      .filter(([peerId, role]) => role === 'gm' && peerId !== activePeerId)
      .map(([peerId]) => peerId);
    stalePeerIds.forEach((peerId) => {
      this.peerIds.delete(peerId);
      this.peerSignals.delete(peerId);
      this.peerRoles.delete(peerId);
      this.emitRoomEvent({ type: 'peer-left', peerId, role: 'gm', peers: this.peers() });
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      void this.tick();
    }, this.config.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private async tick(): Promise<void> {
    if (!this.role) {
      return;
    }
    const now = Date.now();
    if (this.role === 'player') {
      await this.sendControl({ type: 'player-ping' }).catch(() => undefined);
      const lastGmActivityAt = this.lastGmSignalAt || this.startedAt;
      if (this.status !== 'degraded' && lastGmActivityAt > 0 && now - lastGmActivityAt > (this.config.gmTimeoutMs ?? DEFAULT_GM_TIMEOUT_MS)) {
        this.status = 'degraded';
        this.emitRoomEvent({ type: 'gm-lost', peers: this.peers() });
      }
      return;
    }
    const staleAfterMs = this.config.gmTimeoutMs ?? DEFAULT_GM_TIMEOUT_MS;
    this.peerSignals.forEach((lastSeenAt, peerId) => {
      if (now - lastSeenAt > staleAfterMs) {
        this.removePeer(peerId);
      }
    });
  }

  private async sendControl(payload: { type: 'hello' | 'player-ping' | 'gm-pong' | 'goodbye' }): Promise<void> {
    await this.sendEnvelope('control', payload);
  }

  private async sendEnvelope(channel: P2PWireEnvelope['channel'], payload: unknown, targetPeer?: SyncTargetPeer): Promise<void> {
    if (!this.role || !this.roomId || !this.peerId) {
      return;
    }
    await this.adapter.send({
      version: 2,
      id: createId('p2p_wire'),
      channel,
      sender: {
        peerId: this.peerId,
        role: this.role
      },
      sentAt: nowIso(),
      payload
    }, targetPeer);
  }

  private emitRoomEvent(event: P2PRoomConnectionEvent): void {
    this.roomEventListeners.forEach((listener) => listener(event));
  }
}

function isSyncEvent(value: unknown): value is SyncEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as Partial<SyncEvent>;
  return typeof event.id === 'string' && typeof event.createdAt === 'string' && typeof event.authorId === 'string' && typeof event.kind === 'string' && 'value' in event;
}
