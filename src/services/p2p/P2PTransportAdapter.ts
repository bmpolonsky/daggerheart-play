export type P2PWireRole = 'gm' | 'player';
export type P2PTargetPeer = string | undefined;

export interface P2PWireEnvelope {
  version: 2;
  id: string;
  channel: 'control' | 'data';
  sender: {
    peerId: string;
    role: P2PWireRole;
  };
  sentAt: string;
  payload: unknown;
}

export type P2PBinaryPayload = Blob | ArrayBuffer | ArrayBufferView;
export type P2PBinaryProgressHandler = (percent: number, peerId: string, metadata?: unknown) => void;

export interface P2PTransportAdapter {
  readonly id: string;
  readonly label: string;
  peerId: string;
  connect(roomId: string): Promise<void>;
  disconnect(): Promise<void>;
  send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void>;
  subscribe(listener: (envelope: P2PWireEnvelope) => void): () => void;
  sendBinary?(data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown, progress?: P2PBinaryProgressHandler): Promise<void>;
  subscribeBinary?(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void): () => void;
  subscribeBinaryProgress?(listener: P2PBinaryProgressHandler): () => void;
  onPeerJoin(listener: (peerId: string) => void): () => void;
  onPeerLeave(listener: (peerId: string) => void): () => void;
  onError(listener: (message: string) => void): () => void;
  publishMediaStream?(stream: MediaStream, metadata?: unknown): Promise<void>;
  removeMediaStream?(stream: MediaStream): void;
  subscribeMediaStreams?(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
}

export function isP2PWireEnvelope(value: unknown): value is P2PWireEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const envelope = value as Partial<P2PWireEnvelope>;
  const sender = envelope.sender as Partial<P2PWireEnvelope['sender']> | undefined;
  return (
    envelope.version === 2 &&
    (envelope.channel === 'control' || envelope.channel === 'data') &&
    typeof envelope.id === 'string' &&
    typeof envelope.sentAt === 'string' &&
    Boolean(sender) &&
    typeof sender?.peerId === 'string' &&
    (sender?.role === 'gm' || sender?.role === 'player') &&
    'payload' in envelope
  );
}
