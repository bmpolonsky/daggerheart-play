import type {
  P2PTargetPeer,
  P2PTransportAdapter,
  P2PTransportFactoryContext,
  P2PTransportMessageContext,
  P2PTransportRosterEntry,
  P2PWireEnvelope
} from './p2p/P2PTransportAdapter';
import { isP2PWireEnvelope } from './p2p/P2PTransportAdapter';

const PRESENCE_POLL_INTERVAL_MS = 3_000;

interface RoomConnectionResponse {
  cursor: number;
  peers: string[];
  roster?: P2PTransportRosterEntry[];
  participantToken?: string;
  initialEvent?: P2PWireEnvelope;
}

interface EventsResponse {
  cursor: number;
  peers: string[];
  roster?: P2PTransportRosterEntry[];
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
  private roster = new Map<string, P2PTransportRosterEntry>();
  private messageListeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private rosterListeners = new Set<(roster: P2PTransportRosterEntry[]) => void>();

  constructor(
    private context: P2PTransportFactoryContext,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {
    this.peerId = context.participantId;
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    this.roomId = roomId;
    if (this.context.role === 'player') {
      this.participantToken = readServerParticipantToken(roomId, this.peerId);
    }
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
    if (this.context.role === 'player' && this.participantToken) {
      writeParticipantToken(roomId, this.peerId, this.participantToken);
    }
    this.connected = true;
    this.updatePeers(response.peers);
    this.updateRoster(response.roster);
    if (response.initialEvent && isP2PWireEnvelope(response.initialEvent)) {
      this.deliver(response.initialEvent);
    }
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
    this.roster.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    if (!this.roomId) return;
    await this.request(`/api/rooms/${encodeURIComponent(this.roomId)}/events`, {
      method: 'POST',
      body: JSON.stringify({ envelope, targetPeer })
    });
    if (this.context.role === 'player' && controlType(envelope) === 'goodbye') {
      removeParticipantToken(this.roomId, this.peerId);
    }
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

  onRosterChange(listener: (roster: P2PTransportRosterEntry[]) => void): () => void {
    this.rosterListeners.add(listener);
    return () => this.rosterListeners.delete(listener);
  }

  getRoster(): P2PTransportRosterEntry[] {
    return Array.from(this.roster.values());
  }

  private schedulePoll(delay = 0): void {
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
      this.updateRoster(response.roster);
      for (const item of response.events) {
        if (!isP2PWireEnvelope(item.envelope)) continue;
        this.deliver(item.envelope);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.emitError(error instanceof Error ? error.message : 'Серверная синхронизация временно недоступна.');
      }
    } finally {
      this.abortController = null;
      this.schedulePoll(PRESENCE_POLL_INTERVAL_MS);
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

  private updateRoster(entries?: P2PTransportRosterEntry[]): void {
    if (!entries) return;
    const next = new Map(entries.filter((entry) => entry.peerId && entry.peerId !== this.peerId).map((entry) => [entry.peerId, entry]));
    const changed = next.size !== this.roster.size || Array.from(next).some(([peerId, entry]) => {
      const current = this.roster.get(peerId);
      return !current || current.displayName !== entry.displayName || current.role !== entry.role;
    });
    this.roster = next;
    if (changed) {
      const roster = this.getRoster();
      this.rosterListeners.forEach((listener) => listener(roster));
    }
  }

  private deliver(envelope: P2PWireEnvelope): void {
    this.messageListeners.forEach((listener) => listener(envelope, {
      sourcePeerId: envelope.sender.peerId,
      verifiedSourcePeerId: `server:${envelope.sender.peerId}`
    }));
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

function participantTokenKey(roomId: string, peerId: string): string {
  return `daggerheart:server-participant:${roomId}:${peerId}`;
}

export function readServerParticipantToken(roomId: string, peerId: string): string {
  try {
    return globalThis.sessionStorage?.getItem(participantTokenKey(roomId, peerId)) ?? '';
  } catch {
    return '';
  }
}

function writeParticipantToken(roomId: string, peerId: string, token: string): void {
  try {
    globalThis.sessionStorage?.setItem(participantTokenKey(roomId, peerId), token);
  } catch {
    // Session storage is optional; the room still works until the page reloads.
  }
}

function removeParticipantToken(roomId: string, peerId: string): void {
  try {
    globalThis.sessionStorage?.removeItem(participantTokenKey(roomId, peerId));
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

function controlType(envelope: P2PWireEnvelope): string | null {
  if (envelope.channel !== 'control' || !envelope.payload || typeof envelope.payload !== 'object') return null;
  return typeof (envelope.payload as { type?: unknown }).type === 'string'
    ? (envelope.payload as { type: string }).type
    : null;
}
