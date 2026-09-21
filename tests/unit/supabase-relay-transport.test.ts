import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { SupabaseRelayTransport } from '../../src/services/SupabaseRelayTransport';
import type { P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';
import { encodeWorldState } from '../../src/domain/p2p/worldStateFragments';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { SyncService } from '../../src/services/SyncService';
import { P2PRoomConnection } from '../../src/services/p2p/P2PRoomConnection';
import type { PersistedState } from '../../src/domain/rules/types';
import { createCharacter } from '../../src/domain/rules/factories';

vi.mock('../../src/services/supabaseClient', () => ({
  ensureSupabaseGuestSignedIn: async () => undefined,
  setSupabaseDataRole: async () => undefined
}));

describe('SupabaseRelayTransport', () => {
  it.each([{ errors: ['Error 413: Payload Too Large'] }, { errors: [] }])('recovers a truncated Realtime fragment (errors: $errors) so later table updates reach the player', async ({ errors }) => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setInterval, clearInterval });
    const initial = structuredClone(snapshotPersistedState());
    const character = createCharacter({ id: 'hero', name: 'Before update' });
    initial.characters.entities = { [character.id]: character };
    initial.characters.order = [character.id];
    let rows = Object.entries(encodeWorldState(initial)).map(([key, value]) => ({ key, value, revision: 1 }));
    const handlers = new Map<string, (payload: unknown) => void>();
    const channel = {
      on(_type: string, filter: { table: string }, handler: (payload: unknown) => void) {
        handlers.set(filter.table, handler);
        return this;
      },
      subscribe(callback: (status: string) => void) { callback('SUBSCRIBED'); }
    };
    const stateReads = vi.fn(() => Promise.resolve({ data: structuredClone(rows), error: null }));
    const client = {
      channel: () => channel,
      removeChannel: async () => undefined,
      rpc: async (name: string) => ({ data: name === 'dh_join_room' ? {
        incarnation: 'current-room', cursor: 0, ownerId: 'owner', worldId: 'world', gmPeerId: 'gm-peer',
        roster: [{ peerId: 'gm-peer', displayName: 'GM', role: 'gm' }], stateRows: structuredClone(rows)
      } : null, error: null }),
      from(table: string) {
        const query = {
          select() { return this; }, eq() { return this; }, gt() { return this; }, order() { return this; },
          then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
            return (table === 'dh_world_state' ? stateReads() : Promise.resolve({ data: [], error: null })).then(resolve, reject);
          }
        };
        return query;
      }
    };
    const relay = createTransport(client);
    const sync = new SyncService();
    sync.setTransport(new P2PRoomConnection(relay));
    const received: PersistedState[] = [];
    try {
      await sync.connectReadOnly('ABC123', {
        id: 'player-peer', name: 'Player', role: 'player', actorIds: [], connected: true, updatedAt: new Date().toISOString()
      }, (state) => received.push(state));
      await vi.advanceTimersByTimeAsync(40);
      assert.equal(received.length, 1, 'initial HTTP snapshot arrives');

      // Supabase Realtime omits large column values on Error 413 while keeping
      // the row keys and revision. HTTP still returns the complete JSON.
      const nextCharacters = { ...initial.characters, entities: { hero: { ...character, name: 'After update' } } };
      rows = rows.map((row) => row.key === 'characters' ? { ...row, value: nextCharacters, revision: 2 } : row);
      handlers.get('dh_world_state')!({ eventType: 'UPDATE',
        new: { owner_id: 'owner', world_id: 'world', key: 'characters', revision: 2 },
        old: {}, errors
      });
      await vi.advanceTimersByTimeAsync(40);

      const nextGame = { ...initial.game, name: 'GM changed the table' };
      handlers.get('dh_world_state')!({ eventType: 'UPDATE',
        new: { owner_id: 'owner', world_id: 'world', key: 'game', value: nextGame, revision: 2 },
        old: {}, errors: []
      });
      await vi.advanceTimersByTimeAsync(40);
      assert.equal(received.at(-1)?.game.name, nextGame.name, 'later valid snapshots are not silently rejected');
      assert.deepEqual(JSON.parse(JSON.stringify(received.at(-1)?.characters)), JSON.parse(JSON.stringify(nextCharacters)));
      assert.equal(stateReads.mock.calls.length, 2, 'truncated data is fetched over HTTP');
    } finally {
      await sync.disconnect();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('ignores a recovery response that finishes after disconnect', async () => {
    let finish!: (response: { data: unknown[]; error: null }) => void;
    const pending = new Promise<{ data: unknown[]; error: null }>((resolve) => { finish = resolve; });
    const query = { select() { return this; }, eq() { return this; }, then: pending.then.bind(pending) };
    const transport = createTransport({ from: () => query });
    const relay = transport as unknown as { refreshState(): Promise<boolean>; fragments: Record<string, unknown> };
    const refresh = relay.refreshState();

    await transport.disconnect();
    finish({ data: [{ key: 'game', value: { name: 'Old room' }, revision: 2 }], error: null });

    assert.equal(await refresh, false);
    assert.deepEqual(relay.fragments, {});
  });

  it('delivers only current-room events addressed to this peer', () => {
    const transport = createTransport();
    const received: Array<{ id: string; verifiedSourcePeerId?: string }> = [];
    transport.subscribe((message, context) => received.push({
      id: message.id,
      verifiedSourcePeerId: context?.verifiedSourcePeerId
    }));

    const relay = transport as unknown as {
      incarnation: string;
      handleEventRow(row: unknown): void;
    };
    relay.incarnation = 'current-room';
    relay.handleEventRow(eventRow(1, envelope('gm-peer', 'broadcast')));
    relay.handleEventRow(eventRow(2, envelope('gm-peer', 'other-player'), 'other-player'));
    relay.handleEventRow(eventRow(3, envelope('player-peer', 'own-echo')));
    relay.handleEventRow({ ...eventRow(4, envelope('gm-peer', 'old-room')), incarnation: 'old-room' });
    relay.handleEventRow(eventRow(5, envelope('gm-peer', 'direct'), 'player-peer'));

    assert.deepEqual(received, [
      { id: 'broadcast', verifiedSourcePeerId: 'supabase:gm-peer' },
      { id: 'direct', verifiedSourcePeerId: 'supabase:gm-peer' }
    ]);
  });

  it('serializes snapshot writes and coalesces queued snapshots to the newest state', async () => {
    const transport = createTransport() as unknown as {
      queueSnapshot(state: unknown): Promise<void>;
      saveSnapshot(state: unknown): Promise<void>;
    };
    const started: unknown[] = [];
    const releases: Array<() => void> = [];
    transport.saveSnapshot = async (state) => {
      started.push(state);
      await new Promise<void>((resolve) => releases.push(resolve));
    };

    const first = transport.queueSnapshot('first');
    const second = transport.queueSnapshot('second');
    const third = transport.queueSnapshot('third');
    assert.deepEqual(started, ['first']);

    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(started, ['first', 'third']);
    releases.shift()?.();
    await Promise.all([first, second, third]);
  });

  it('keeps a newer realtime fragment when an older refresh finishes later', () => {
    const transport = createTransport() as unknown as {
      fragments: Record<string, unknown>;
      revisions: Map<string, number>;
      mergeState(rows: Array<{ key: string; value: unknown; revision: number }>): void;
    };
    transport.fragments = { game: { name: 'new' } };
    transport.revisions = new Map([['game', 3]]);

    transport.mergeState([{ key: 'game', value: { name: 'old' }, revision: 2 }]);

    assert.deepEqual(transport.fragments.game, { name: 'new' });
    assert.equal(transport.revisions.get('game'), 3);
  });
});

function createTransport(client: unknown = {}): SupabaseRelayTransport {
  return new SupabaseRelayTransport(
    {
      role: 'player',
      participantId: 'player-peer',
      displayName: 'Игрок',
      worldId: '',
      initialSnapshot: undefined
    },
    { url: 'https://example.supabase.co', publishableKey: 'public-key' },
    client as never
  );
}

function envelope(peerId: string, id: string): P2PWireEnvelope {
  return {
    version: 2,
    id,
    channel: 'data',
    sender: { peerId, role: peerId === 'gm-peer' ? 'gm' : 'player' },
    sentAt: new Date(0).toISOString(),
    payload: { kind: 'notice' }
  };
}

function eventRow(sequence: number, message: P2PWireEnvelope, targetPeerId: string | null = null) {
  return {
    sequence,
    room_id: 'ABC123',
    incarnation: 'current-room',
    author_peer_id: message.sender.peerId,
    target_peer_id: targetPeerId,
    envelope: message
  };
}
