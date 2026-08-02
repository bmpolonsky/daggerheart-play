import type {
  P2PTargetPeer,
  P2PTransportAdapter,
  P2PTransportFactoryContext,
  P2PTransportMessageContext,
  P2PWireEnvelope
} from './p2p/P2PTransportAdapter';
import { isP2PWireEnvelope } from './p2p/P2PTransportAdapter';

const POLL_INTERVAL_MS = 300;

interface RoomConnectionResponse {
  cursor: number;
  peers: string[];
  participantToken?: string;
}

interface EventsResponse {
  cursor: number;
  peers: string[];
  events: Array<{ sequence: number; envelope: P2PWireEnvelope }>;
}

export class ServerRelayTransport implements P2PTransportAdapter {
  readonly id = 'server-relay';
  readonly label = 'Daggerheart server';
  peerId: string;

  private roomId = '';
  private cursor = 0;
  private participantToken = '';
  private connected = false;
  private pollTimer: number | undefined;
  private abortController: AbortController | null = null;
  private peers = new Set<string>();
  private messageListeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();

  constructor(
    private context: P2PTransportFactoryContext,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {
    this.peerId = context.participantId;
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    this.roomId = roomId;
    const response = this.context.role === 'gm'
      ? await this.request<RoomConnectionResponse>(`/api/rooms/${encodeURIComponent(roomId)}`, {
          method: 'PUT',
          body: JSON.stringify({
            peerId: this.peerId,
            displayName: this.context.displayName,
            worldId: this.context.worldId,
            snapshot: this.context.initialSnapshot
          })
        })
      : await this.request<RoomConnectionResponse>(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
          method: 'POST',
          body: JSON.stringify({ peerId: this.peerId, displayName: this.context.displayName })
        });
    this.cursor = response.cursor;
    this.participantToken = response.participantToken ?? '';
    this.connected = true;
    this.updatePeers(response.peers);
    this.schedulePoll(0);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    globalThis.clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.abortController?.abort();
    this.abortController = null;
    this.roomId = '';
    this.cursor = 0;
    this.participantToken = '';
    this.peers.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    if (!this.roomId) return;
    await this.request(`/api/rooms/${encodeURIComponent(this.roomId)}/events`, {
      method: 'POST',
      body: JSON.stringify({ envelope, targetPeer })
    });
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
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

  private schedulePoll(delay = POLL_INTERVAL_MS): void {
    if (!this.connected) return;
    globalThis.clearTimeout(this.pollTimer);
    this.pollTimer = globalThis.setTimeout(() => void this.poll(), delay) as unknown as number;
  }

  private async poll(): Promise<void> {
    if (!this.connected || !this.roomId) return;
    this.abortController = new AbortController();
    try {
      const response = await this.request<EventsResponse>(
        `/api/rooms/${encodeURIComponent(this.roomId)}/events?after=${this.cursor}`,
        { signal: this.abortController.signal }
      );
      this.cursor = Math.max(this.cursor, response.cursor);
      this.updatePeers(response.peers);
      for (const item of response.events) {
        if (!isP2PWireEnvelope(item.envelope)) continue;
        this.messageListeners.forEach((listener) => listener(item.envelope, {
          sourcePeerId: item.envelope.sender.peerId,
          verifiedSourcePeerId: `server:${item.envelope.sender.peerId}`
        }));
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.emitError(error instanceof Error ? error.message : 'Серверная синхронизация временно недоступна.');
      }
    } finally {
      this.abortController = null;
      this.schedulePoll();
    }
  }

  private updatePeers(peerIds: string[]): void {
    const next = new Set(peerIds.filter((peerId) => peerId && peerId !== this.peerId));
    for (const peerId of next) {
      if (!this.peers.has(peerId)) this.peerJoinListeners.forEach((listener) => listener(peerId));
    }
    for (const peerId of this.peers) {
      if (!next.has(peerId)) this.peerLeaveListeners.forEach((listener) => listener(peerId));
    }
    this.peers = next;
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body) headers.set('content-type', 'application/json');
    if (this.context.role === 'player' && this.participantToken) {
      headers.set('authorization', `Bearer ${this.participantToken}`);
      headers.set('x-daggerheart-peer-id', this.peerId);
    }
    const response = await this.fetcher(path, { ...init, credentials: 'same-origin', headers });
    const body = await response.json().catch(() => ({})) as { message?: unknown };
    if (!response.ok) {
      throw new Error(typeof body.message === 'string' ? body.message : response.status === 401
        ? 'Войдите в аккаунт мастера.'
        : 'Серверная синхронизация временно недоступна.');
    }
    return body as T;
  }

  private emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}
