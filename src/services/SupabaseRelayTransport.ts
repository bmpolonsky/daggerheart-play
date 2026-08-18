import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import type { GameCustomContent } from '../domain/game/gameDocument';
import { emptyCustomContent } from '../domain/game/gameDocument';
import {
  changedWorldStateFragments,
  decodeWorldState,
  encodeWorldState,
  type WorldStateFragments
} from '../domain/p2p/worldStateFragments';
import { isPersistedState } from '../stores/persistedState';
import type { PersistedState } from '../domain/rules/types';
import type {
  P2PTargetPeer,
  P2PTransportAdapter,
  P2PTransportFactoryContext,
  P2PTransportMessageContext,
  P2PTransportRosterEntry,
  P2PWireEnvelope
} from './p2p/P2PTransportAdapter';
import { isP2PWireEnvelope } from './p2p/P2PTransportAdapter';
import { RelayTransportError } from './p2p/RelayTransportError';
import { ensureSupabaseGuestSignedIn, getSupabaseAuthClient, getSupabaseClient, setSupabaseDataRole } from './supabaseClient';
import { reportOperationalError } from '../core/observability/sentry';

const HEARTBEAT_MS = 15_000;
const STATE_DELIVERY_DEBOUNCE_MS = 30;

interface StateRow {
  key: string;
  value: unknown;
  revision: number;
}

interface RoomConnectionResponse {
  incarnation: string;
  cursor: number;
  ownerId: string;
  worldId: string;
  gmPeerId: string;
  roster: P2PTransportRosterEntry[];
  stateRows: StateRow[];
}

interface RoomEventRow {
  sequence: number;
  room_id: string;
  incarnation: string;
  author_peer_id: string;
  target_peer_id: string | null;
  envelope: P2PWireEnvelope;
}

interface WorldStateRow {
  owner_id: string;
  world_id: string;
  key: string;
  value: unknown;
  revision: number;
}

export class SupabaseRelayTransport implements P2PTransportAdapter {
  readonly id = 'supabase-relay';
  readonly label = 'Daggerheart Supabase';
  peerId: string;

  private client: SupabaseClient;
  private roomId = '';
  private incarnation = '';
  private ownerId = '';
  private worldId = '';
  private cursor = 0;
  private connected = false;
  private channels: RealtimeChannel[] = [];
  private fragments: WorldStateFragments = {};
  private revisions = new Map<string, number>();
  private roster = new Map<string, P2PTransportRosterEntry>();
  private heartbeatTimer: number | undefined;
  private stateDeliveryTimer: number | undefined;
  private pendingSnapshot: unknown = null;
  private snapshotSave: Promise<void> | null = null;
  private listeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private peerJoinListeners = new Set<(peerId: string) => void>();
  private peerLeaveListeners = new Set<(peerId: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private rosterListeners = new Set<(roster: P2PTransportRosterEntry[]) => void>();

  constructor(
    private context: P2PTransportFactoryContext,
    private config: { url: string; publishableKey: string },
    client?: SupabaseClient
  ) {
    this.peerId = context.participantId;
    this.client = client ?? getSupabaseClient(config);
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnect();
    this.roomId = roomId;
    await this.ensureAuthenticated();
    const response = this.context.role === 'gm'
      ? await this.rpc<RoomConnectionResponse>('dh_open_room', {
          p_room_id: roomId,
          p_world_id: this.context.worldId,
          p_peer_id: this.peerId,
          p_display_name: this.context.displayName,
          p_fragments: this.initialFragments()
        })
      : await this.rpc<RoomConnectionResponse>('dh_join_room', {
          p_room_id: roomId,
          p_peer_id: this.peerId,
          p_display_name: this.context.displayName
        });

    this.incarnation = response.incarnation;
    this.ownerId = response.ownerId;
    this.worldId = response.worldId;
    this.cursor = response.cursor;
    this.replaceState(response.stateRows);
    this.updateRoster(response.roster);
    await this.subscribeRealtime();
    this.connected = true;
    await Promise.all([this.refreshState(), this.refreshEvents(), this.refreshRoster()]);
    this.startHeartbeat();
    if (this.context.role === 'player') this.scheduleStateDelivery();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    globalThis.clearInterval(this.heartbeatTimer);
    globalThis.clearTimeout(this.stateDeliveryTimer);
    this.heartbeatTimer = undefined;
    this.stateDeliveryTimer = undefined;
    const roomId = this.roomId;
    const incarnation = this.incarnation;
    this.channels.splice(0).forEach((channel) => void this.client.removeChannel(channel));
    if (roomId && incarnation) {
      await this.client.rpc('dh_leave_room', {
        p_room_id: roomId,
        p_incarnation: incarnation,
        p_peer_id: this.peerId
      });
    }
    this.roomId = '';
    this.incarnation = '';
    this.ownerId = '';
    this.worldId = '';
    this.cursor = 0;
    this.fragments = {};
    this.revisions.clear();
    this.updateRoster([]);
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    if (!this.roomId || !this.incarnation) return;
    const snapshot = snapshotValue(envelope);
    if (snapshot && this.context.role === 'gm') {
      await this.queueSnapshot(snapshot);
      return;
    }
    await this.rpc<number>('dh_submit_room_event', {
      p_room_id: this.roomId,
      p_incarnation: this.incarnation,
      p_envelope: envelope,
      p_target_peer_id: targetPeer ?? null
    });
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

  private initialFragments(): WorldStateFragments {
    if (!isPersistedState(this.context.initialSnapshot)) return {};
    return encodeWorldState(
      this.context.initialSnapshot as PersistedState,
      (this.context.readCustomContent?.() as GameCustomContent | undefined) ?? emptyCustomContent()
    );
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.context.role === 'player') {
      await ensureSupabaseGuestSignedIn(this.config);
      await setSupabaseDataRole('player');
      return;
    }

    await setSupabaseDataRole('master');
    const auth = getSupabaseAuthClient(this.config).auth;
    const { data, error } = await auth.getSession();
    if (error) throw new RelayTransportError(error.message, 'auth_failed', 401);
    if (data.session) return;
    if (typeof window === 'undefined') throw new RelayTransportError('auth_required', 'auth_required', 401);
    throw new RelayTransportError('auth_required', 'auth_required', 401);
  }

  private async subscribeRealtime(): Promise<void> {
    const stateChannel = this.client.channel(`dh-state:${this.roomId}:${this.incarnation}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dh_world_state',
        filter: `owner_id=eq.${this.ownerId}`
      }, (payload) => this.handleStateChange(payload as unknown as { eventType: string; new: WorldStateRow; old: WorldStateRow }))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dh_room_events',
        filter: `room_id=eq.${this.roomId}`
      }, (payload) => this.handleEventRow(payload.new as RoomEventRow))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dh_room_members',
        filter: `room_id=eq.${this.roomId}`
      }, () => void this.refreshRoster());
    try {
      await subscribeChannel(stateChannel);
    } catch (error) {
      this.report(error, 'subscribe-realtime');
      throw error;
    }
    this.channels.push(stateChannel);
  }

  private handleStateChange(payload: { eventType: string; new: WorldStateRow; old: WorldStateRow }): void {
    const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
    if (!row || row.owner_id !== this.ownerId || row.world_id !== this.worldId) return;
    if (payload.eventType === 'DELETE') {
      delete this.fragments[row.key];
      this.revisions.delete(row.key);
    } else if ((this.revisions.get(row.key) ?? 0) < row.revision) {
      this.fragments[row.key] = row.value;
      this.revisions.set(row.key, row.revision);
    }
    if (this.context.role === 'player') this.scheduleStateDelivery();
  }

  private handleEventRow(row: RoomEventRow): void {
    if (!row || row.incarnation !== this.incarnation || row.sequence <= this.cursor) return;
    this.cursor = row.sequence;
    if (row.target_peer_id && row.target_peer_id !== this.peerId) return;
    if (row.author_peer_id === this.peerId || !isP2PWireEnvelope(row.envelope)) return;
    this.deliver(row.envelope);
  }

  private async refreshState(): Promise<void> {
    const { data, error } = await this.client.from('dh_world_state')
      .select('key,value,revision')
      .eq('owner_id', this.ownerId)
      .eq('world_id', this.worldId);
    if (error) {
      const failure = this.relayError(error.message);
      this.report(failure, 'refresh-state');
      throw failure;
    }
    this.mergeState((data ?? []) as StateRow[]);
  }

  private async refreshEvents(): Promise<void> {
    const { data, error } = await this.client.from('dh_room_events')
      .select('sequence,room_id,incarnation,author_peer_id,target_peer_id,envelope')
      .eq('room_id', this.roomId)
      .eq('incarnation', this.incarnation)
      .gt('sequence', this.cursor)
      .order('sequence');
    if (error) {
      const failure = this.relayError(error.message);
      this.report(failure, 'refresh-events');
      throw failure;
    }
    (data as unknown as RoomEventRow[] | null)?.forEach((row) => this.handleEventRow(row));
  }

  private async refreshRoster(): Promise<void> {
    const { data, error } = await this.client.from('dh_room_members')
      .select('peer_id,display_name,role,last_seen_at')
      .eq('room_id', this.roomId)
      .eq('incarnation', this.incarnation);
    if (error) {
      this.report(error, 'refresh-roster');
      this.emitError(error.message);
      return;
    }
    const activeAfter = Date.now() - 45_000;
    this.updateRoster((data ?? []).flatMap((row) => (
      Date.parse(row.last_seen_at) > activeAfter
        ? [{ peerId: row.peer_id, displayName: row.display_name, role: row.role as 'gm' | 'player' }]
        : []
    )));
  }

  private replaceState(rows: StateRow[]): void {
    this.fragments = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    this.revisions = new Map(rows.map((row) => [row.key, row.revision]));
  }

  private mergeState(rows: StateRow[]): void {
    rows.forEach((row) => {
      if ((this.revisions.get(row.key) ?? 0) >= row.revision) return;
      this.fragments[row.key] = row.value;
      this.revisions.set(row.key, row.revision);
    });
  }

  private queueSnapshot(state: unknown): Promise<void> {
    this.pendingSnapshot = state;
    if (!this.snapshotSave) {
      this.snapshotSave = this.drainSnapshots().finally(() => {
        this.snapshotSave = null;
      });
    }
    return this.snapshotSave;
  }

  private async drainSnapshots(): Promise<void> {
    while (this.pendingSnapshot) {
      const state = this.pendingSnapshot;
      this.pendingSnapshot = null;
      await this.saveSnapshot(state);
    }
  }

  private async saveSnapshot(state: unknown): Promise<void> {
    if (!isPersistedState(state)) return;
    const next = encodeWorldState(
      state as PersistedState,
      (this.context.readCustomContent?.() as GameCustomContent | undefined) ?? emptyCustomContent()
    );
    const diff = changedWorldStateFragments(this.fragments, next);
    if (Object.keys(diff.upserts).length === 0 && diff.deletes.length === 0) return;
    const rows = await this.rpc<StateRow[]>('dh_save_world_fragments', {
      p_room_id: this.roomId,
      p_incarnation: this.incarnation,
      p_fragments: diff.upserts,
      p_deletes: diff.deletes
    });
    this.replaceState(rows);
  }

  private scheduleStateDelivery(): void {
    globalThis.clearTimeout(this.stateDeliveryTimer);
    this.stateDeliveryTimer = globalThis.setTimeout(() => this.deliverState(), STATE_DELIVERY_DEBOUNCE_MS) as unknown as number;
  }

  private deliverState(): void {
    const decoded = decodeWorldState(this.fragments);
    if (!decoded) return;
    this.context.applyCustomContent?.(decoded.customContent);
    const createdAt = nowIso();
    this.deliver({
      version: 2,
      id: createId('supabase_state'),
      channel: 'data',
      sender: { peerId: this.gmPeerId(), role: 'gm' },
      sentAt: createdAt,
      payload: {
        id: createId('server-snapshot'),
        createdAt,
        authorId: this.gmPeerId(),
        kind: 'snapshot',
        value: decoded.state
      }
    });
  }

  private gmPeerId(): string {
    return this.getRoster().find((entry) => entry.role === 'gm')?.peerId || 'local-gm';
  }

  private deliver(envelope: P2PWireEnvelope): void {
    this.listeners.forEach((listener) => listener(envelope, {
      sourcePeerId: envelope.sender.peerId,
      verifiedSourcePeerId: `supabase:${envelope.sender.peerId}`
    }));
  }

  private updateRoster(entries: P2PTransportRosterEntry[]): void {
    const previous = this.roster;
    this.roster = new Map(entries.filter((entry) => entry.peerId !== this.peerId).map((entry) => [entry.peerId, entry]));
    this.roster.forEach((_entry, peerId) => {
      if (!previous.has(peerId)) this.peerJoinListeners.forEach((listener) => listener(peerId));
    });
    previous.forEach((_entry, peerId) => {
      if (!this.roster.has(peerId)) this.peerLeaveListeners.forEach((listener) => listener(peerId));
    });
    const roster = this.getRoster();
    this.rosterListeners.forEach((listener) => listener(roster));
  }

  private startHeartbeat(): void {
    globalThis.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = globalThis.setInterval(() => {
      void this.rpc('dh_heartbeat', {
        p_room_id: this.roomId,
        p_incarnation: this.incarnation,
        p_peer_id: this.peerId
      })
        .then(() => this.refreshRoster())
        .catch((error) => {
          this.report(error, 'heartbeat');
          this.emitError(error instanceof Error ? error.message : 'Supabase heartbeat failed');
        });
    }, HEARTBEAT_MS) as unknown as number;
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      const failure = this.relayError(error.message);
      if (failure.code !== 'room_not_found' && failure.code !== 'master_offline') this.report(failure, name);
      throw failure;
    }
    return data as T;
  }

  private report(error: unknown, operation: string): void {
    reportOperationalError(error, {
      area: 'network',
      operation,
      tags: {
        provider: 'supabase',
        role: this.context.role,
        errorCode: error instanceof RelayTransportError ? error.code : undefined
      },
      details: {
        roomId: this.roomId || undefined,
        worldId: this.worldId || this.context.worldId,
        participantId: this.peerId,
        incarnation: this.incarnation || undefined
      }
    });
  }

  private relayError(message: string): RelayTransportError {
    const knownCode = ['room_not_found', 'master_offline', 'room_in_use', 'participant_in_use', 'rate_limited']
      .find((code) => message.includes(code));
    return new RelayTransportError(message, knownCode ?? 'server_error', knownCode === 'room_not_found' ? 404 : 500);
  }

  private emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}

function snapshotValue(envelope: P2PWireEnvelope): unknown | null {
  const payload = envelope.payload as { kind?: unknown; value?: unknown } | undefined;
  return envelope.channel === 'data' && payload?.kind === 'snapshot' ? payload.value : null;
}

async function subscribeChannel(channel: RealtimeChannel): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(error ?? new Error(`Realtime ${status}`));
    });
  });
}
