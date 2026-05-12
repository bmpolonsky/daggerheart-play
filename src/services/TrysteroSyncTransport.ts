import type { ActionSender, DataPayload, JsonValue, Room } from 'trystero';
import type { P2PBinaryPayload, P2PBinaryProgressHandler, P2PTargetPeer, P2PTransportAdapter, P2PWireEnvelope } from './p2p/P2PTransportAdapter';
import { isP2PWireEnvelope } from './p2p/P2PTransportAdapter';

export interface TrysteroP2PTransportOptions {
  appId?: string;
  password?: string;
}

export class TrysteroP2PTransport implements P2PTransportAdapter {
  readonly id = 'trystero';
  readonly label = 'Trystero P2P';
  peerId = '';

  private room: Room | null = null;
  private sendEnvelope: ActionSender<DataPayload> | null = null;
  private sendBinaryPayload: ActionSender<DataPayload> | null = null;
  private envelopeListeners = new Set<(envelope: P2PWireEnvelope) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: JsonValue) => void>();
  private binaryProgressListeners = new Set<P2PBinaryProgressHandler>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private mediaStreamListeners = new Set<(stream: MediaStream, peerId: string, metadata?: JsonValue) => void>();
  private publishedMediaStreams = new Map<MediaStream, JsonValue | undefined>();

  constructor(private readonly options: TrysteroP2PTransportOptions = {}) {}

  async connect(roomId: string): Promise<void> {
    this.room?.leave();
    const { joinRoom, selfId } = await import('trystero');
    this.peerId = selfId;
    this.room = joinRoom(
      {
        appId: this.options.appId ?? 'daggerheart-play',
        password: this.options.password?.trim() || undefined
      },
      roomId,
      {
        onJoinError: (details) => this.emitError(details.error)
      }
    );

    const [sendEnvelope, receiveEnvelope] = this.room.makeAction<DataPayload>('daggerheart-p2p-v2');
    this.sendEnvelope = sendEnvelope;
    receiveEnvelope((data) => {
      const envelope = data as unknown;
      if (!isP2PWireEnvelope(envelope)) {
        return;
      }
      this.envelopeListeners.forEach((listener) => listener(envelope));
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

  subscribe(listener: (envelope: P2PWireEnvelope) => void): () => void {
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

  private emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}
