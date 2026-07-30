import type { ActionSender, DataPayload, JsonValue, Room } from 'trystero';
import { stripPrefixedShortRoomCode } from '../domain/p2p/sessionLinks';
import type { P2PBinaryPayload, P2PBinaryProgressHandler, P2PMediaConnectionDiagnostic, P2PMediaRtpDiagnostic, P2PTargetPeer, P2PTransportAdapter, P2PTransportMessageContext, P2PTransportMode, P2PTransportStrategy, P2PWireEnvelope } from './p2p/P2PTransportAdapter';
import { isP2PWireEnvelope } from './p2p/P2PTransportAdapter';

export interface TrysteroP2PTransportOptions {
  appId?: string;
  strategy?: P2PTransportMode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  candidates?: P2PTransportStrategy[];
}

interface TrysteroJoinConfig {
  appId: string;
  relayConfig?: {
    supabaseKey: string;
  };
}

type TrysteroJoinCallbacks = Parameters<typeof import('trystero').joinRoom>[2];
type TrysteroJoinRoom = (config: TrysteroJoinConfig, roomId: string, callbacks?: TrysteroJoinCallbacks) => Room;

export class TrysteroP2PTransport implements P2PTransportAdapter {
  readonly id = 'trystero';
  readonly label = 'Trystero P2P';
  peerId = '';

  private room: Room | null = null;
  private sendEnvelope: ActionSender<DataPayload> | null = null;
  private sendBinaryPayload: ActionSender<DataPayload> | null = null;
  private envelopeListeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: JsonValue) => void>();
  private binaryProgressListeners = new Set<P2PBinaryProgressHandler>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private mediaStreamListeners = new Set<(stream: MediaStream, peerId: string, metadata?: JsonValue) => void>();
  private publishedMediaStreams = new Map<MediaStream, JsonValue | undefined>();
  private connectedStrategy: P2PTransportStrategy = 'nostr';

  constructor(private options: TrysteroP2PTransportOptions = {}) {}

  async connect(roomId: string): Promise<void> {
    this.room?.leave();
    const strategy = this.options.strategy && this.options.strategy !== 'auto' ? this.options.strategy : 'nostr';
    this.connectedStrategy = strategy;
    const resolvedRoom = resolveTrysteroRoom(roomId, strategy);
    const { joinRoom, selfId } = await importTrysteroStrategy(resolvedRoom.strategy);
    const config = trysteroConfigForStrategy(resolvedRoom.strategy, this.options);
    this.peerId = selfId;
    this.room = joinRoom(
      config,
      resolvedRoom.roomId,
      {
        onJoinError: (details) => this.emitError(details.error)
      }
    );

    const [sendEnvelope, receiveEnvelope] = this.room.makeAction<DataPayload>('daggerheart-p2p-v2');
    this.sendEnvelope = sendEnvelope;
    receiveEnvelope((data, peerId) => {
      const envelope = data as unknown;
      if (!isP2PWireEnvelope(envelope)) {
        return;
      }
      this.envelopeListeners.forEach((listener) => listener(envelope, { sourcePeerId: peerId, verifiedSourcePeerId: peerId }));
    });
    const [sendBinaryPayload, receiveBinaryPayload, onBinaryProgress] = this.room.makeAction<DataPayload>('daggerheart-binary-v1');
    this.sendBinaryPayload = sendBinaryPayload;
    receiveBinaryPayload((data, peerId, metadata) => {
      if (data instanceof ArrayBuffer) {
        this.binaryListeners.forEach((listener) => listener(data, peerId, metadata));
        return;
      }
      if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView;
        const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
        this.binaryListeners.forEach((listener) => listener(buffer, peerId, metadata));
        return;
      }
      if (data instanceof Blob) {
        void data.arrayBuffer().then((buffer) => {
          this.binaryListeners.forEach((listener) => listener(buffer, peerId, metadata));
        });
      }
    });
    onBinaryProgress((percent, peerId, metadata) => {
      this.binaryProgressListeners.forEach((listener) => listener(percent, peerId, metadata));
    });
    this.room.onPeerJoin((peerId) => {
      this.peerJoinListeners.forEach((listener) => listener(peerId));
      this.publishedMediaStreams.forEach((metadata, stream) => {
        void Promise.all(this.room?.addStream(stream, peerId, metadata) ?? []);
      });
    });
    this.room.onPeerLeave((peerId) => {
      this.peerLeaveListeners.forEach((listener) => listener(peerId));
    });
    this.room.onPeerStream((stream, peerId, metadata) => {
      this.mediaStreamListeners.forEach((listener) => listener(stream, peerId, metadata));
    });
  }

  async disconnect(): Promise<void> {
    await this.room?.leave();
    this.room = null;
    this.sendEnvelope = null;
    this.sendBinaryPayload = null;
    this.envelopeListeners.clear();
    this.binaryListeners.clear();
    this.binaryProgressListeners.clear();
    this.peerJoinListeners.clear();
    this.peerLeaveListeners.clear();
    this.errorListeners.clear();
    this.mediaStreamListeners.clear();
    this.publishedMediaStreams.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    if (!this.sendEnvelope) {
      throw new Error('Trystero transport is not connected.');
    }
    await this.sendEnvelope(envelope as unknown as DataPayload, targetPeer);
  }

  async sendBinary(data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown, progress?: P2PBinaryProgressHandler): Promise<void> {
    if (!this.sendBinaryPayload) {
      throw new Error('Trystero transport is not connected.');
    }
    await this.sendBinaryPayload(data, targetPeer, metadata as JsonValue | undefined, progress);
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.envelopeListeners.add(listener);
    return () => this.envelopeListeners.delete(listener);
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

  async publishMediaStream(stream: MediaStream, metadata?: unknown): Promise<void> {
    if (!this.room) {
      throw new Error('Trystero transport is not connected.');
    }
    const mediaMetadata = metadata as JsonValue | undefined;
    this.publishedMediaStreams.set(stream, mediaMetadata);
    await Promise.all(this.room.addStream(stream, undefined, mediaMetadata));
  }

  removeMediaStream(stream: MediaStream): void {
    this.publishedMediaStreams.delete(stream);
    this.room?.removeStream(stream);
  }

  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void {
    this.mediaStreamListeners.add(listener);
    return () => this.mediaStreamListeners.delete(listener);
  }

  async getMediaDiagnostics(): Promise<P2PMediaConnectionDiagnostic[]> {
    const peers = this.room?.getPeers() ?? {};
    return await Promise.all(Object.entries(peers).map(async ([physicalPeerId, connection]) => {
      const report = await connection.getStats();
      const stats = Array.from(report.values(), (item) => item as RTCStats & Record<string, unknown>);
      const selectedPair = selectedCandidatePair(stats);
      const localCandidate = selectedPair
        ? stats.find((item) => item.id === selectedPair.localCandidateId)
        : undefined;
      const remoteCandidate = selectedPair
        ? stats.find((item) => item.id === selectedPair.remoteCandidateId)
        : undefined;
      return {
        peerId: physicalPeerId,
        physicalPeerId,
        strategy: this.connectedStrategy,
        connectionState: connection.connectionState,
        iceConnectionState: connection.iceConnectionState,
        localCandidateType: candidateType(localCandidate),
        remoteCandidateType: candidateType(remoteCandidate),
        protocol: stringValue(selectedPair?.protocol) ?? stringValue(localCandidate?.protocol),
        rtp: extractRtpDiagnostics(connection, stats)
      };
    }));
  }

  private emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}

export function resolveTrysteroRoom(roomId: string, fallbackStrategy: P2PTransportStrategy): { roomId: string; strategy: P2PTransportStrategy } {
  const normalized = roomId.trim().toUpperCase();
  const stripped = stripPrefixedShortRoomCode(normalized);
  return { roomId: stripped === normalized ? roomId : stripped, strategy: fallbackStrategy };
}

export function trysteroConfigForStrategy(strategy: P2PTransportStrategy, options: TrysteroP2PTransportOptions = {}): TrysteroJoinConfig {
  if (strategy === 'supabase') {
    if (!options.supabaseUrl || !options.supabaseAnonKey) {
      throw new Error('Supabase signaling is not configured. Set VITE_TRYSTERO_SUPABASE_URL and VITE_TRYSTERO_SUPABASE_ANON_KEY.');
    }
    return {
      appId: options.supabaseUrl,
      relayConfig: {
        supabaseKey: options.supabaseAnonKey
      }
    };
  }
  return {
    appId: options.appId ?? 'daggerheart-play'
  };
}

async function importTrysteroStrategy(strategy: P2PTransportStrategy): Promise<{ joinRoom: TrysteroJoinRoom; selfId: string }> {
  if (strategy === 'supabase') {
    return await import('@trystero-p2p/supabase') as unknown as { joinRoom: TrysteroJoinRoom; selfId: string };
  }
  if (strategy === 'torrent') {
    return await import('@trystero-p2p/torrent') as unknown as { joinRoom: TrysteroJoinRoom; selfId: string };
  }
  if (strategy === 'mqtt') {
    return await import('@trystero-p2p/mqtt') as unknown as { joinRoom: TrysteroJoinRoom; selfId: string };
  }
  return await import('trystero') as unknown as { joinRoom: TrysteroJoinRoom; selfId: string };
}

function selectedCandidatePair(stats: Array<RTCStats & Record<string, unknown>>): (RTCStats & Record<string, unknown>) | undefined {
  const transport = stats.find((item) => item.type === 'transport' && typeof item.selectedCandidatePairId === 'string');
  if (transport && typeof transport.selectedCandidatePairId === 'string') {
    return stats.find((item) => item.id === transport.selectedCandidatePairId);
  }
  return stats.find((item) =>
    item.type === 'candidate-pair'
    && item.state === 'succeeded'
    && (item.selected === true || item.nominated === true)
  );
}

function candidateType(stat?: RTCStats & Record<string, unknown>): RTCIceCandidateType | null {
  const value = stat?.candidateType;
  return value === 'host' || value === 'srflx' || value === 'prflx' || value === 'relay'
    ? value
    : null;
}

function extractRtpDiagnostics(
  connection: RTCPeerConnection,
  stats: Array<RTCStats & Record<string, unknown>>
): P2PMediaRtpDiagnostic[] {
  const byId = new Map(stats.map((item) => [item.id, item]));
  const diagnostics = new Map<string, P2PMediaRtpDiagnostic>();
  for (const stat of stats) {
    if (stat.type !== 'inbound-rtp' && stat.type !== 'outbound-rtp') continue;
    const kind = stat.kind ?? stat.mediaType;
    if (kind !== 'audio' && kind !== 'video') continue;
    const direction = stat.type === 'inbound-rtp' ? 'inbound' : 'outbound';
    const key = `${direction}:${kind}`;
    const track = direction === 'outbound'
      ? connection.getSenders().find((sender) => sender.track?.kind === kind)?.track
      : connection.getReceivers().find((receiver) => receiver.track?.kind === kind)?.track;
    const mediaSource = direction === 'outbound' && typeof stat.mediaSourceId === 'string'
      ? byId.get(stat.mediaSourceId)
      : undefined;
    const previous = diagnostics.get(key);
    const audioLevel = numberValue(stat.audioLevel) ?? numberValue(mediaSource?.audioLevel);
    const totalAudioEnergy = numberValue(stat.totalAudioEnergy) ?? numberValue(mediaSource?.totalAudioEnergy);
    diagnostics.set(key, {
      direction,
      kind,
      bytes: (previous?.bytes ?? 0) + (numberValue(direction === 'inbound' ? stat.bytesReceived : stat.bytesSent) ?? 0),
      packets: (previous?.packets ?? 0) + (numberValue(direction === 'inbound' ? stat.packetsReceived : stat.packetsSent) ?? 0),
      packetsLost: (previous?.packetsLost ?? 0) + (numberValue(stat.packetsLost) ?? 0),
      jitterMs: maxNullable(previous?.jitterMs ?? null, secondsToMilliseconds(numberValue(stat.jitter))),
      audioLevel: maxNullable(previous?.audioLevel ?? null, audioLevel),
      totalAudioEnergy: (previous?.totalAudioEnergy ?? 0) + (totalAudioEnergy ?? 0),
      trackEnabled: track?.enabled ?? previous?.trackEnabled ?? null,
      trackMuted: track?.muted ?? previous?.trackMuted ?? null,
      trackState: track?.readyState ?? previous?.trackState ?? null
    });
  }
  return Array.from(diagnostics.values());
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function secondsToMilliseconds(value: number | null): number | null {
  return value === null ? null : value * 1000;
}

function maxNullable(first: number | null, second: number | null): number | null {
  if (first === null) return second;
  if (second === null) return first;
  return Math.max(first, second);
}
