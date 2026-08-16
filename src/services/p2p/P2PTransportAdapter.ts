export type P2PWireRole = 'gm' | 'player';
export type P2PTargetPeer = string | undefined;
export type P2PTransportStrategy = 'supabase' | 'nostr' | 'torrent';
export type P2PTransportMode = 'auto' | P2PTransportStrategy;
export type P2PSessionTransportMode = 'p2p' | 'hybrid';

export interface P2PTransportRosterEntry {
  peerId: string;
  displayName: string;
  role: P2PWireRole;
}

export interface P2PTransportMessageContext {
  sourcePeerId?: string;
  verifiedSourcePeerId?: string;
}

export interface P2PTransportRouteDiagnostic {
  strategy: P2PTransportStrategy;
  status: 'probing' | 'ready' | 'degraded' | 'failed';
  activePeers: string[];
  lastSeenAt: number | null;
  rttMs: number | null;
  error?: string;
}

export interface P2PTransportPeerRouteDiagnostic {
  strategy: P2PTransportStrategy;
  status: 'active' | 'available' | 'lost' | 'failed' | 'unknown';
  physicalPeerId?: string;
  lastSeenAt: number | null;
  rttMs: number | null;
  error?: string;
}

export interface P2PTransportPeerDiagnostic {
  peerId: string;
  activeStrategy: P2PTransportStrategy | null;
  routes: P2PTransportPeerRouteDiagnostic[];
}

export interface P2PMediaRtpDiagnostic {
  direction: 'inbound' | 'outbound';
  kind: 'audio' | 'video';
  bytes: number;
  packets: number;
  packetsLost: number;
  jitterMs: number | null;
  audioLevel: number | null;
  totalAudioEnergy: number | null;
  trackEnabled: boolean | null;
  trackMuted: boolean | null;
  trackState: MediaStreamTrackState | null;
}

export interface P2PMediaConnectionDiagnostic {
  peerId: string;
  physicalPeerId: string;
  strategy: P2PTransportStrategy;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  localCandidateType: RTCIceCandidateType | null;
  remoteCandidateType: RTCIceCandidateType | null;
  protocol: string | null;
  rtp: P2PMediaRtpDiagnostic[];
}

export interface P2PTransportRouteSwitchEvent {
  peerId: string;
  from: P2PTransportStrategy;
  to: P2PTransportStrategy;
  reason: 'ack-timeout' | 'send-failed';
  envelopeId: string;
}

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

export interface P2PTransportFactoryContext {
  role: P2PWireRole;
  participantId: string;
  displayName: string;
  worldId: string;
  connectionMode?: 'p2p' | 'server';
  initialSnapshot?: unknown;
  readCustomContent?: () => unknown;
  applyCustomContent?: (content: unknown) => void;
}

export type P2PBinaryPayload = Blob | ArrayBuffer | ArrayBufferView;
export type P2PBinaryProgressHandler = (percent: number, peerId: string, metadata?: unknown) => void;

export interface P2PTransportAdapter {
  readonly id: string;
  readonly label: string;
  peerId: string;
  readonly sessionMode?: P2PSessionTransportMode;
  connect(roomId: string): Promise<void>;
  disconnect(): Promise<void>;
  send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void>;
  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void;
  sendBinary?(data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown, progress?: P2PBinaryProgressHandler): Promise<void>;
  subscribeBinary?(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void): () => void;
  subscribeBinaryProgress?(listener: P2PBinaryProgressHandler): () => void;
  onPeerJoin(listener: (peerId: string) => void): () => void;
  onPeerLeave(listener: (peerId: string) => void): () => void;
  onError(listener: (message: string) => void): () => void;
  onDiagnosticsChange?(listener: () => void): () => void;
  onRosterChange?(listener: (roster: P2PTransportRosterEntry[]) => void): () => void;
  onRouteSwitch?(listener: (event: P2PTransportRouteSwitchEvent) => void): () => void;
  publishMediaStream?(stream: MediaStream, metadata?: unknown): Promise<void>;
  removeMediaStream?(stream: MediaStream): void;
  addMediaTrack?(track: MediaStreamTrack, stream: MediaStream, metadata?: unknown): Promise<void>;
  subscribeMediaStreams?(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
  getRouteDiagnostics?(): P2PTransportRouteDiagnostic[];
  getPeerDiagnostics?(): P2PTransportPeerDiagnostic[];
  getRoster?(): P2PTransportRosterEntry[];
  getDirectPeerIds?(): string[];
  getMediaDiagnostics?(): Promise<P2PMediaConnectionDiagnostic[]>;
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
