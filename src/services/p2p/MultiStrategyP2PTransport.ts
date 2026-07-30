import { createId } from '../../core/utils/id';
import { normalizeLogicalRoomId } from '../../domain/p2p/sessionLinks';
import { TrysteroP2PTransport, type TrysteroP2PTransportOptions } from '../TrysteroSyncTransport';
import type {
  P2PBinaryPayload,
  P2PBinaryProgressHandler,
  P2PTargetPeer,
  P2PTransportAdapter,
  P2PMediaConnectionDiagnostic,
  P2PTransportMessageContext,
  P2PTransportMode,
  P2PTransportPeerDiagnostic,
  P2PTransportRouteSwitchEvent,
  P2PTransportRouteDiagnostic,
  P2PTransportStrategy,
  P2PWireEnvelope
} from './P2PTransportAdapter';

export type P2PRouteDiagnostic = P2PTransportRouteDiagnostic;

export interface MultiStrategyP2PTransportOptions {
  appId?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  mode?: P2PTransportMode;
  candidates?: P2PTransportStrategy[];
  ackTimeoutMs?: number;
  createTransport?: (options: TrysteroP2PTransportOptions) => P2PTransportAdapter;
}

interface RouteState {
  strategy: P2PTransportStrategy;
  transport: P2PTransportAdapter;
  status: P2PRouteDiagnostic['status'];
  lastSeenAt: number | null;
  rttMs: number | null;
  error?: string;
  unsubscriptions: Array<() => void>;
  connectAttempt: number;
}

interface PendingAck {
  envelopeId: string;
  peerId: string;
  sentAt: number;
  resolve: (strategy: P2PTransportStrategy | null) => void;
  timeout: number;
}

interface PeerRouteStats {
  status: 'available' | 'lost' | 'failed';
  lastSeenAt: number | null;
  rttMs: number | null;
}

interface MultiRouteAck {
  type: 'multi-route-ack';
  envelopeId: string;
  sentAt: number;
}

const DEFAULT_CANDIDATES: P2PTransportStrategy[] = ['nostr', 'mqtt', 'torrent'];
const SUPABASE_CANDIDATES: P2PTransportStrategy[] = ['supabase', ...DEFAULT_CANDIDATES];
const DEFAULT_ACK_TIMEOUT_MS = 4000;

export class MultiStrategyP2PTransport implements P2PTransportAdapter {
  readonly id = 'trystero-auto';
  readonly label = 'Trystero Auto P2P';
  peerId = createId('p2p_peer');

  private routes = new Map<P2PTransportStrategy, RouteState>();
  private activeRouteByPeer = new Map<string, P2PTransportStrategy>();
  private peerRouteStats = new Map<string, Map<P2PTransportStrategy, PeerRouteStats>>();
  private physicalPeerByLogicalPeer = new Map<string, Map<P2PTransportStrategy, string>>();
  private logicalPeerByPhysicalPeer = new Map<string, string>();
  private envelopeListeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: unknown) => void>();
  private binaryProgressListeners = new Set<P2PBinaryProgressHandler>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private diagnosticsListeners = new Set<() => void>();
  private routeSwitchListeners = new Set<(event: P2PTransportRouteSwitchEvent) => void>();
  private mediaStreamListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();
  private pendingAcks = new Map<string, PendingAck>();
  private seenEnvelopeIds = new Set<string>();
  private seenEnvelopeOrder: string[] = [];
  private seenMediaKeys = new Set<string>();
  private seenMediaOrder: string[] = [];
  private rememberedControlEnvelopes: P2PWireEnvelope[] = [];
  private publishedMediaStreams = new Map<MediaStream, unknown>();
  private connectionEpoch = 0;

  private readonly candidates: P2PTransportStrategy[];
  private readonly ackTimeoutMs: number;
  private readonly createTransport: (options: TrysteroP2PTransportOptions) => P2PTransportAdapter;

  constructor(options: MultiStrategyP2PTransportOptions = {}) {
    this.candidates = resolveTrysteroCandidates(options);
    this.ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
    this.createTransport = options.createTransport ?? ((transportOptions) => new TrysteroP2PTransport(transportOptions));
    for (const strategy of this.candidates) {
      this.routes.set(strategy, {
        strategy,
        transport: this.createTransport({
          appId: options.appId,
          supabaseUrl: options.supabaseUrl,
          supabaseAnonKey: options.supabaseAnonKey,
          strategy
        }),
        status: 'probing',
        lastSeenAt: null,
        rttMs: null,
        unsubscriptions: [],
        connectAttempt: 0
      });
    }
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    const epoch = ++this.connectionEpoch;
    const logicalRoomId = normalizeLogicalRoomId(roomId);
    const routeConnections = Array.from(this.routes.values(), (route) => this.connectRoute(route, logicalRoomId, epoch));
    await this.waitForFirstReadyRoute(routeConnections);
  }

  private async connectRoute(route: RouteState, logicalRoomId: string, epoch: number): Promise<P2PTransportStrategy> {
    const connectAttempt = route.connectAttempt + 1;
    route.connectAttempt = connectAttempt;
    route.status = 'probing';
    route.error = undefined;
    this.bindRoute(route);
    this.emitDiagnosticsChange();
    try {
      await route.transport.connect(logicalRoomId);
      if (this.connectionEpoch !== epoch) {
        await this.disconnectStaleRoute(route, connectAttempt);
        throw new Error('Stale P2P route connection.');
      }
      route.status = 'ready';
      this.emitDiagnosticsChange();
      return route.strategy;
    } catch (error) {
      if (this.connectionEpoch !== epoch) {
        throw error;
      }
      route.status = 'failed';
      route.error = error instanceof Error ? error.message : 'Unable to connect route.';
      this.emitDiagnosticsChange();
      throw error;
    }
  }

  private async waitForFirstReadyRoute(routeConnections: Array<Promise<P2PTransportStrategy>>): Promise<void> {
    if (routeConnections.length === 0) {
      throw new Error('No P2P signaling routes are available.');
    }
    await new Promise<void>((resolve, reject) => {
      let pending = routeConnections.length;
      let settled = false;
      routeConnections.forEach((connection) => {
        connection.then(() => {
          if (settled) return;
          settled = true;
          resolve();
        }).catch(() => {
          pending -= 1;
          if (!settled && pending === 0) {
            reject(new Error('No P2P signaling routes are available.'));
          }
        });
      });
    });
  }

  private async disconnectStaleRoute(route: RouteState, connectAttempt: number): Promise<void> {
    if (route.connectAttempt !== connectAttempt) {
      return;
    }
    route.unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    await route.transport.disconnect().catch(() => undefined);
    route.status = 'probing';
    route.lastSeenAt = null;
    route.rttMs = null;
    route.error = undefined;
  }

  async disconnect(): Promise<void> {
    this.connectionEpoch += 1;
    this.pendingAcks.forEach((pending) => {
      window.clearTimeout(pending.timeout);
      pending.resolve(null);
    });
    this.pendingAcks.clear();
    await Promise.allSettled(Array.from(this.routes.values(), async (route) => {
      route.unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
      await route.transport.disconnect();
      route.status = 'probing';
      route.lastSeenAt = null;
      route.rttMs = null;
      route.error = undefined;
    }));
    this.activeRouteByPeer.clear();
    this.peerRouteStats.clear();
    this.physicalPeerByLogicalPeer.clear();
    this.logicalPeerByPhysicalPeer.clear();
    this.seenEnvelopeIds.clear();
    this.seenEnvelopeOrder = [];
    this.seenMediaKeys.clear();
    this.seenMediaOrder = [];
    this.rememberedControlEnvelopes = [];
    this.publishedMediaStreams.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    if (envelope.channel === 'control') {
      this.rememberControlEnvelope(envelope);
      await this.sendControlEnvelope(envelope, targetPeer);
      return;
    }
    if (targetPeer) {
      await this.sendDataWithFailover(envelope, targetPeer);
      return;
    }
    const peers = Array.from(this.activeRouteByPeer.keys());
    if (peers.length === 0) {
      await Promise.allSettled(this.readyRoutes().map((route) => route.transport.send(envelope)));
      return;
    }
    await Promise.allSettled(peers.map((peerId) => this.sendDataWithFailover(envelope, peerId)));
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.envelopeListeners.add(listener);
    return () => this.envelopeListeners.delete(listener);
  }

  async sendBinary(data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown, progress?: P2PBinaryProgressHandler): Promise<void> {
    const activeRoute = targetPeer ? this.activeRouteForPeer(targetPeer) : null;
    const routes = activeRoute ? [activeRoute] : targetPeer ? this.routesForPeer(targetPeer) : this.activeRoutesForBroadcast();
    const targets = routes.filter(({ route }) => route.transport.sendBinary);
    if (targets.length === 0) {
      throw new Error('No active binary route is available.');
    }
    const results = await Promise.allSettled(targets.map(({ route, physicalPeerId }) => route.transport.sendBinary?.(data, physicalPeerId, metadata, progress)));
    if (!results.some((result) => result.status === 'fulfilled')) {
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      throw rejected?.reason instanceof Error ? rejected.reason : new Error('Binary transfer failed.');
    }
  }

  subscribeBinary(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void): () => void {
    this.binaryListeners.add(listener);
    return () => this.binaryListeners.delete(listener);
  }

  subscribeBinaryProgress(listener: P2PBinaryProgressHandler): () => void {
    this.binaryProgressListeners.add(listener);
    return () => this.binaryProgressListeners.delete(listener);
  }

  onPeerJoin(listener: (peerId: string) => void): () => void {
    this.peerJoinListeners.add(listener);
    return () => this.peerJoinListeners.delete(listener);
  }

  onPeerLeave(listener: (peerId: string) => void): () => void {
    this.peerLeaveListeners.add(listener);
    return () => this.peerLeaveListeners.delete(listener);
  }

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onDiagnosticsChange(listener: () => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  onRouteSwitch(listener: (event: P2PTransportRouteSwitchEvent) => void): () => void {
    this.routeSwitchListeners.add(listener);
    return () => this.routeSwitchListeners.delete(listener);
  }

  async publishMediaStream(stream: MediaStream, metadata?: unknown): Promise<void> {
    this.publishedMediaStreams.set(stream, metadata);
    await this.syncPublishedMediaRoutes();
  }

  removeMediaStream(stream: MediaStream): void {
    this.publishedMediaStreams.delete(stream);
    this.routes.forEach((route) => route.transport.removeMediaStream?.(stream));
  }

  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void {
    this.mediaStreamListeners.add(listener);
    return () => this.mediaStreamListeners.delete(listener);
  }

  getRouteDiagnostics(): P2PRouteDiagnostic[] {
    return Array.from(this.routes.values(), (route) => ({
      strategy: route.strategy,
      status: route.status,
      activePeers: Array.from(this.activeRouteByPeer.entries())
        .filter(([, strategy]) => strategy === route.strategy)
        .map(([peerId]) => peerId),
      lastSeenAt: route.lastSeenAt,
      rttMs: route.rttMs,
      error: route.error
    }));
  }

  getPeerDiagnostics(): P2PTransportPeerDiagnostic[] {
    const peerIds = new Set<string>([
      ...this.physicalPeerByLogicalPeer.keys(),
      ...this.peerRouteStats.keys(),
      ...this.activeRouteByPeer.keys()
    ]);
    return Array.from(peerIds, (peerId) => {
      const activeStrategy = this.activeRouteByPeer.get(peerId) ?? null;
      const physicalPeers = this.physicalPeerByLogicalPeer.get(peerId) ?? new Map<P2PTransportStrategy, string>();
      const routeStats = this.peerRouteStats.get(peerId) ?? new Map<P2PTransportStrategy, PeerRouteStats>();
      return {
        peerId,
        activeStrategy,
        routes: this.candidates.map((strategy) => {
          const route = this.routes.get(strategy);
          const stats = routeStats.get(strategy);
          return {
            strategy,
            status: activeStrategy === strategy ? 'active' : stats?.status ?? (route?.status === 'failed' ? 'failed' : 'unknown'),
            physicalPeerId: physicalPeers.get(strategy),
            lastSeenAt: stats?.lastSeenAt ?? null,
            rttMs: stats?.rttMs ?? route?.rttMs ?? null,
            error: route?.error
          };
        })
      };
    });
  }

  async getMediaDiagnostics(): Promise<P2PMediaConnectionDiagnostic[]> {
    const routeDiagnostics = await Promise.all(Array.from(this.routes.values(), async (route) => {
      const diagnostics = await route.transport.getMediaDiagnostics?.().catch(() => []) ?? [];
      return diagnostics.map((diagnostic) => ({
        ...diagnostic,
        peerId: this.logicalForPhysical(route.strategy, diagnostic.physicalPeerId),
        strategy: route.strategy
      }));
    }));
    return routeDiagnostics.flat();
  }

  private bindRoute(route: RouteState): void {
    route.unsubscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    route.unsubscriptions.push(
      route.transport.subscribe((envelope, context) => this.handleEnvelope(route, envelope, context?.sourcePeerId)),
      route.transport.onPeerJoin((physicalPeerId) => {
        route.status = 'ready';
        this.emitDiagnosticsChange();
        void this.sendRememberedControlEnvelopes(route, physicalPeerId);
      }),
      route.transport.onPeerLeave((physicalPeerId) => this.handlePhysicalPeerLeave(route, physicalPeerId)),
      route.transport.onError((message) => {
        route.status = 'degraded';
        route.error = message;
        this.emitDiagnosticsChange();
        if (this.candidates.length === 1) {
          this.emitError(`${route.strategy}: ${message}`);
        }
      }),
      route.transport.subscribeBinary?.((data, physicalPeerId, metadata) => {
        const logicalPeerId = this.logicalForPhysical(route.strategy, physicalPeerId);
        this.binaryListeners.forEach((listener) => listener(data, logicalPeerId, metadata));
      }) ?? (() => undefined),
      route.transport.subscribeBinaryProgress?.((percent, physicalPeerId, metadata) => {
        const logicalPeerId = this.logicalForPhysical(route.strategy, physicalPeerId);
        this.binaryProgressListeners.forEach((listener) => listener(percent, logicalPeerId, metadata));
      }) ?? (() => undefined),
      route.transport.subscribeMediaStreams?.((stream, physicalPeerId, metadata) => {
        const logicalPeerId = this.logicalForPhysical(route.strategy, physicalPeerId);
        const activeStrategy = this.activeRouteByPeer.get(logicalPeerId);
        if (activeStrategy && activeStrategy !== route.strategy) {
          return;
        }
        if (this.wasMediaSeen(logicalPeerId, stream, metadata)) {
          return;
        }
        this.mediaStreamListeners.forEach((listener) => listener(stream, logicalPeerId, metadata));
      }) ?? (() => undefined)
    );
  }

  private handleEnvelope(route: RouteState, envelope: P2PWireEnvelope, physicalPeerId?: string): void {
    route.status = 'ready';
    route.lastSeenAt = Date.now();
    const logicalPeerId = envelope.sender.peerId;
    if (physicalPeerId && !this.rememberRoutePeer(route.strategy, logicalPeerId, physicalPeerId)) {
      return;
    }
    if (isRouteAck(envelope.payload)) {
      this.handleAck(route, logicalPeerId, envelope.payload);
      return;
    }
    this.updatePeerRouteStats(logicalPeerId, route.strategy, {
      status: this.peerRouteStatus(logicalPeerId, route.strategy) === 'lost' ? 'lost' : 'available',
      lastSeenAt: route.lastSeenAt
    });
    void this.sendAck(route, logicalPeerId, envelope.id);
    if (this.wasEnvelopeSeen(envelope.id)) {
      return;
    }
    this.activateRoute(logicalPeerId, route.strategy, { force: envelope.channel === 'data' });
    const verifiedSourcePeerId = physicalPeerId ? routePeerKey(route.strategy, physicalPeerId) : logicalPeerId;
    this.envelopeListeners.forEach((listener) => listener(envelope, { sourcePeerId: logicalPeerId, verifiedSourcePeerId }));
  }

  private rememberRoutePeer(strategy: P2PTransportStrategy, logicalPeerId: string, physicalPeerId: string): boolean {
    const key = routePeerKey(strategy, physicalPeerId);
    const knownLogicalPeerId = this.logicalPeerByPhysicalPeer.get(key);
    if (knownLogicalPeerId && knownLogicalPeerId !== logicalPeerId) {
      return false;
    }
    const wasKnown = Boolean(knownLogicalPeerId);
    this.logicalPeerByPhysicalPeer.set(key, logicalPeerId);
    const peersByRoute = this.physicalPeerByLogicalPeer.get(logicalPeerId) ?? new Map<P2PTransportStrategy, string>();
    peersByRoute.set(strategy, physicalPeerId);
    this.physicalPeerByLogicalPeer.set(logicalPeerId, peersByRoute);
    if (!wasKnown && !this.activeRouteByPeer.has(logicalPeerId)) {
      this.peerJoinListeners.forEach((listener) => listener(logicalPeerId));
    }
    return true;
  }

  private activateRoute(logicalPeerId: string, strategy: P2PTransportStrategy, options: { force?: boolean } = {}): void {
    const current = this.activeRouteByPeer.get(logicalPeerId);
    const next = options.force ? strategy : this.preferredAvailableStrategy(logicalPeerId) ?? strategy;
    if (current === next) {
      return;
    }
    if (current) {
      this.clearSeenMediaForPeer(logicalPeerId);
    }
    this.activeRouteByPeer.set(logicalPeerId, next);
    void this.publishMediaStreamsForPeer(logicalPeerId);
    this.emitDiagnosticsChange();
  }

  private async sendControlEnvelope(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    const routeTargets = targetPeer ? this.routesForPeer(targetPeer) : this.readyRoutes().map((route) => ({ route, physicalPeerId: undefined }));
    await Promise.allSettled(routeTargets.map(({ route, physicalPeerId }) => route.transport.send(envelope, physicalPeerId)));
  }

  private async sendDataWithFailover(envelope: P2PWireEnvelope, targetPeer: string): Promise<void> {
    const active = this.activeRouteForPeer(targetPeer);
    let failedStrategy: P2PTransportStrategy | null = null;
    let failoverReason: P2PTransportRouteSwitchEvent['reason'] = 'ack-timeout';
    if (active) {
      const ack = this.waitForAck(envelope.id, targetPeer);
      try {
        await active.route.transport.send(envelope, active.physicalPeerId);
        if (await ack) {
          return;
        }
      } catch (error) {
        this.cancelPendingAck(envelope.id, targetPeer);
        active.route.error = error instanceof Error ? error.message : 'Route send failed.';
        failoverReason = 'send-failed';
      }
      failedStrategy = active.route.strategy;
      active.route.status = 'degraded';
      this.updatePeerRouteStats(targetPeer, active.route.strategy, { status: 'lost' });
    }
    const allFallbacks = this.routesForPeer(targetPeer);
    const fallbacks = failedStrategy
      ? allFallbacks.filter(({ route }) => route.strategy !== failedStrategy)
      : allFallbacks;
    const targets = fallbacks.length > 0 ? fallbacks : allFallbacks;
    const ack = this.waitForAck(envelope.id, targetPeer);
    await Promise.allSettled(targets.map(({ route, physicalPeerId }) => route.transport.send(envelope, physicalPeerId)));
    const acknowledgedStrategy = await ack;
    if (failedStrategy && acknowledgedStrategy && acknowledgedStrategy !== failedStrategy) {
      this.emitRouteSwitch({
        peerId: targetPeer,
        from: failedStrategy,
        to: acknowledgedStrategy,
        reason: failoverReason,
        envelopeId: envelope.id
      });
    }
  }

  private waitForAck(envelopeId: string, peerId: string): Promise<P2PTransportStrategy | null> {
    return new Promise((resolve) => {
      const pendingKey = ackKey(peerId, envelopeId);
      const timeout = window.setTimeout(() => {
        this.pendingAcks.delete(pendingKey);
        resolve(null);
      }, this.ackTimeoutMs);
      this.pendingAcks.set(pendingKey, {
        envelopeId,
        peerId,
        sentAt: Date.now(),
        resolve,
        timeout
      });
    });
  }

  private cancelPendingAck(envelopeId: string, peerId: string): void {
    const pendingKey = ackKey(peerId, envelopeId);
    const pending = this.pendingAcks.get(pendingKey);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeout);
    this.pendingAcks.delete(pendingKey);
    pending.resolve(null);
  }

  private handleAck(route: RouteState, logicalPeerId: string, ack: MultiRouteAck): void {
    const pendingKey = ackKey(logicalPeerId, ack.envelopeId);
    const pending = this.pendingAcks.get(pendingKey);
    if (!pending) {
      return;
    }
    route.rttMs = Math.max(0, Date.now() - (pending?.sentAt ?? ack.sentAt));
    this.updatePeerRouteStats(logicalPeerId, route.strategy, {
      status: 'available',
      lastSeenAt: route.lastSeenAt ?? Date.now(),
      rttMs: route.rttMs
    });
    this.activateRoute(logicalPeerId, route.strategy, { force: true });
    window.clearTimeout(pending.timeout);
    this.pendingAcks.delete(pendingKey);
    pending.resolve(route.strategy);
  }

  private async sendAck(route: RouteState, logicalPeerId: string, envelopeId: string): Promise<void> {
    const physicalPeerId = this.physicalPeerByLogicalPeer.get(logicalPeerId)?.get(route.strategy);
    await route.transport.send({
      version: 2,
      id: createId('p2p_ack'),
      channel: 'control',
      sender: {
        peerId: this.peerId,
        role: 'player'
      },
      sentAt: new Date().toISOString(),
      payload: {
        type: 'multi-route-ack',
        envelopeId,
        sentAt: Date.now()
      } satisfies MultiRouteAck
    }, physicalPeerId).catch(() => undefined);
  }

  private activeRouteForPeer(peerId: string): { route: RouteState; physicalPeerId?: string } | null {
    const strategy = this.activeRouteByPeer.get(peerId);
    const route = strategy ? this.routes.get(strategy) : null;
    if (!route || route.status === 'failed') {
      return null;
    }
    return {
      route,
      physicalPeerId: this.physicalPeerByLogicalPeer.get(peerId)?.get(route.strategy)
    };
  }

  private routesForPeer(peerId: string): Array<{ route: RouteState; physicalPeerId?: string }> {
    const physicalPeers = this.physicalPeerByLogicalPeer.get(peerId);
    if (!physicalPeers || physicalPeers.size === 0) {
      return this.readyRoutes().map((route) => ({ route, physicalPeerId: undefined }));
    }
    return Array.from(physicalPeers.entries())
      .flatMap(([strategy, physicalPeerId]) => {
        const route = this.routes.get(strategy);
        return route && route.status !== 'failed' ? [{ route, physicalPeerId }] : [];
      });
  }

  private activeRoutesForBroadcast(): Array<{ route: RouteState; physicalPeerId?: string }> {
    const routeTargets = Array.from(this.activeRouteByPeer.keys()).flatMap((peerId) => this.activeRouteForPeer(peerId) ?? []);
    if (routeTargets.length === 0) {
      return this.readyRoutes().map((route) => ({ route, physicalPeerId: undefined }));
    }
    return routeTargets;
  }

  private readyRoutes(): RouteState[] {
    return Array.from(this.routes.values()).filter((route) => route.status !== 'failed');
  }

  private rememberControlEnvelope(envelope: P2PWireEnvelope): void {
    this.rememberedControlEnvelopes = [
      ...this.rememberedControlEnvelopes.filter((item) => item.payload !== envelope.payload),
      envelope
    ].slice(-4);
  }

  private async sendRememberedControlEnvelopes(route: RouteState, physicalPeerId: string): Promise<void> {
    await Promise.allSettled(this.rememberedControlEnvelopes.map((envelope) => route.transport.send(envelope, physicalPeerId)));
  }

  private handlePhysicalPeerLeave(route: RouteState, physicalPeerId: string): void {
    const key = routePeerKey(route.strategy, physicalPeerId);
    const logicalPeerId = this.logicalPeerByPhysicalPeer.get(key);
    if (!logicalPeerId) {
      return;
    }
    this.logicalPeerByPhysicalPeer.delete(key);
    const physicalPeers = this.physicalPeerByLogicalPeer.get(logicalPeerId);
    physicalPeers?.delete(route.strategy);
    this.updatePeerRouteStats(logicalPeerId, route.strategy, { status: 'lost' });
    if (physicalPeers && physicalPeers.size > 0) {
      const nextStrategy = this.preferredAvailableStrategy(logicalPeerId) ?? Array.from(physicalPeers.keys())[0];
      this.activateRoute(logicalPeerId, nextStrategy, { force: true });
      return;
    }
    this.physicalPeerByLogicalPeer.delete(logicalPeerId);
    this.activeRouteByPeer.delete(logicalPeerId);
    this.clearSeenMediaForPeer(logicalPeerId);
    this.peerLeaveListeners.forEach((listener) => listener(logicalPeerId));
  }

  private logicalForPhysical(strategy: P2PTransportStrategy, physicalPeerId: string): string {
    return this.logicalPeerByPhysicalPeer.get(routePeerKey(strategy, physicalPeerId)) ?? physicalPeerId;
  }

  private updatePeerRouteStats(peerId: string, strategy: P2PTransportStrategy, patch: Partial<PeerRouteStats>): void {
    const statsByRoute = this.peerRouteStats.get(peerId) ?? new Map<P2PTransportStrategy, PeerRouteStats>();
    const current = statsByRoute.get(strategy) ?? {
      status: 'available',
      lastSeenAt: null,
      rttMs: null
    } satisfies PeerRouteStats;
    statsByRoute.set(strategy, { ...current, ...patch });
    this.peerRouteStats.set(peerId, statsByRoute);
    this.emitDiagnosticsChange();
  }

  private peerRouteStatus(peerId: string, strategy: P2PTransportStrategy): PeerRouteStats['status'] | null {
    return this.peerRouteStats.get(peerId)?.get(strategy)?.status ?? null;
  }

  private preferredAvailableStrategy(peerId: string): P2PTransportStrategy | null {
    const physicalPeers = this.physicalPeerByLogicalPeer.get(peerId);
    const statsByRoute = this.peerRouteStats.get(peerId);
    for (const strategy of this.candidates) {
      const route = this.routes.get(strategy);
      const stats = statsByRoute?.get(strategy);
      if (!route || route.status === 'failed' || route.status === 'degraded' || stats?.status === 'lost' || stats?.status === 'failed') {
        continue;
      }
      if (physicalPeers?.has(strategy) || stats?.status === 'available') {
        return strategy;
      }
    }
    return null;
  }

  private wasEnvelopeSeen(envelopeId: string): boolean {
    if (this.seenEnvelopeIds.has(envelopeId)) {
      return true;
    }
    this.seenEnvelopeIds.add(envelopeId);
    this.seenEnvelopeOrder.push(envelopeId);
    while (this.seenEnvelopeOrder.length > 1000) {
      const removed = this.seenEnvelopeOrder.shift();
      if (removed) this.seenEnvelopeIds.delete(removed);
    }
    return false;
  }

  private wasMediaSeen(peerId: string, stream: MediaStream, metadata: unknown): boolean {
    const key = `${peerId}:${stream.id}:${safeMetadataKey(metadata)}`;
    if (this.seenMediaKeys.has(key)) {
      return true;
    }
    this.seenMediaKeys.add(key);
    this.seenMediaOrder.push(key);
    while (this.seenMediaOrder.length > 500) {
      const removed = this.seenMediaOrder.shift();
      if (removed) this.seenMediaKeys.delete(removed);
    }
    return false;
  }

  private clearSeenMediaForPeer(peerId: string): void {
    const prefix = `${peerId}:`;
    this.seenMediaOrder = this.seenMediaOrder.filter((key) => {
      if (!key.startsWith(prefix)) {
        return true;
      }
      this.seenMediaKeys.delete(key);
      return false;
    });
  }

  private async republishMediaStreams(route: RouteState): Promise<void> {
    await Promise.allSettled(Array.from(this.publishedMediaStreams.entries(), ([stream, metadata]) => route.transport.publishMediaStream?.(stream, metadata)));
  }

  private async publishMediaStreamsForPeer(logicalPeerId: string): Promise<void> {
    const active = this.activeRouteForPeer(logicalPeerId);
    if (!active) {
      return;
    }
    await this.republishMediaStreams(active.route);
    this.removeMediaStreamsFromInactiveRoutes();
  }

  private async syncPublishedMediaRoutes(): Promise<void> {
    const activeStrategies = new Set(this.activeRouteByPeer.values());
    await Promise.allSettled(Array.from(activeStrategies, (strategy) => {
      const route = this.routes.get(strategy);
      return route && route.status !== 'failed' ? this.republishMediaStreams(route) : Promise.resolve();
    }));
    this.removeMediaStreamsFromInactiveRoutes();
  }

  private removeMediaStreamsFromInactiveRoutes(): void {
    const activeStrategies = new Set(this.activeRouteByPeer.values());
    for (const route of this.routes.values()) {
      if (activeStrategies.has(route.strategy)) {
        continue;
      }
      this.publishedMediaStreams.forEach((_metadata, stream) => route.transport.removeMediaStream?.(stream));
    }
  }

  private emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }

  private emitDiagnosticsChange(): void {
    this.diagnosticsListeners.forEach((listener) => listener());
  }

  private emitRouteSwitch(event: P2PTransportRouteSwitchEvent): void {
    this.routeSwitchListeners.forEach((listener) => listener(event));
  }
}

export function createConfiguredP2PTransport(options: TrysteroP2PTransportOptions = {}): P2PTransportAdapter {
  if (!options.strategy || options.strategy === 'auto') {
    return new MultiStrategyP2PTransport({
      appId: options.appId,
      supabaseUrl: options.supabaseUrl,
      supabaseAnonKey: options.supabaseAnonKey,
      candidates: options.candidates,
      mode: 'auto'
    });
  }
  return new TrysteroP2PTransport(options);
}

export function resolveTrysteroCandidates(options: Pick<MultiStrategyP2PTransportOptions, 'candidates' | 'mode' | 'supabaseAnonKey' | 'supabaseUrl'> = {}): P2PTransportStrategy[] {
  if (options.mode && options.mode !== 'auto') {
    return [options.mode];
  }
  if (options.candidates) {
    return options.candidates;
  }
  return options.supabaseUrl && options.supabaseAnonKey ? SUPABASE_CANDIDATES : DEFAULT_CANDIDATES;
}

function routePeerKey(strategy: P2PTransportStrategy, peerId: string): string {
  return `${strategy}:${peerId}`;
}

function ackKey(peerId: string, envelopeId: string): string {
  return `${peerId}:${envelopeId}`;
}

function isRouteAck(value: unknown): value is MultiRouteAck {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'multi-route-ack' &&
    typeof (value as { envelopeId?: unknown }).envelopeId === 'string'
  );
}

function safeMetadataKey(metadata: unknown): string {
  try {
    return JSON.stringify(metadata) ?? '';
  } catch {
    return String(metadata);
  }
}
