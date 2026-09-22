import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { P2PTransportFactoryContext, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

vi.mock('../../src/services/supabaseClient', () => ({
  ensureSupabaseGuestSignedIn: async () => undefined,
  setSupabaseDataRole: async () => undefined,
  readSupabaseAccessToken: async () => null,
  getSupabaseClient: () => ({}),
  getSupabaseAuthClient: () => ({ auth: { getSession: async () => ({ data: { session: {} }, error: null }) } })
}));

// The database boundary is simulated; both clients use real, isolated stores,
// CharacterService, P2PSessionService, SyncService and SupabaseRelayTransport.
class RoomDatabase {
  rows = new Map<string, { key: string; value: unknown; revision: number }>();
  members = new Map<string, { peer_id: string; display_name: string; role: string; last_seen_at: string }>();
  events: Array<Record<string, unknown>> = [];
  channels = new Set<Map<string, (payload: unknown) => void>>();
  statuses = new Set<(status: string) => void>();
  dropStateUpdates = false;
  eventLengths: number[] = [];
  holdPlayerUpdates = false;
  heldPlayerUpdates: Array<Record<string, unknown>> = [];
  emit(table: string, payload: unknown) {
    if (table === 'dh_world_state' && this.dropStateUpdates) return;
    for (const channel of this.channels) queueMicrotask(() => channel.get(table)?.(payload));
  }
  client(context: P2PTransportFactoryContext) {
    const db = this;
    return {
      channel() {
        const handlers = new Map<string, (payload: unknown) => void>();
        let statusListener: ((status: string) => void) | undefined;
        return { handlers, cleanup() { if (statusListener) db.statuses.delete(statusListener); },
          on(_type: string, filter: { table: string }, handler: (payload: unknown) => void) { handlers.set(filter.table, handler); return this; },
          subscribe(done: (status: string) => void) { db.channels.add(handlers); statusListener = done; db.statuses.add(done); done('SUBSCRIBED'); }
        };
      },
      removeChannel(channel: { handlers: Map<string, (payload: unknown) => void>; cleanup(): void }) { db.channels.delete(channel.handlers); channel.cleanup(); },
      async rpc(name: string, args: Record<string, any>) {
        if (name === 'dh_open_room' || name === 'dh_join_room') {
          for (const [key, value] of Object.entries(args.p_fragments ?? {})) db.rows.set(key, { key, value, revision: 1 });
          db.members.set(context.participantId, { peer_id: context.participantId, display_name: context.displayName, role: context.role, last_seen_at: new Date().toISOString() });
          db.emit('dh_room_members', {});
          return { data: { incarnation: 'room', cursor: db.events.length, ownerId: 'owner', worldId: 'world', gmPeerId: 'gm',
            roster: [...db.members.values()].map(x => ({ peerId: x.peer_id, displayName: x.display_name, role: x.role })),
            stateRows: structuredClone([...db.rows.values()]) }, error: null };
        }
        if (name === 'dh_save_world_fragments') {
          const saved = Object.entries(args.p_fragments).map(([key, value]) => {
            const row = { key, value: JSON.parse(JSON.stringify(value)), revision: (db.rows.get(key)?.revision ?? 0) + 1 };
            db.rows.set(key, row);
            // Model the real Realtime failure mode for large character fragments.
            const large = JSON.stringify(value).length > 64_000;
            db.emit('dh_world_state', { eventType: 'UPDATE', old: {}, errors: large ? ['Error 413'] : [],
              new: { owner_id: 'owner', world_id: 'world', key, revision: row.revision, ...(large ? {} : { value: row.value }) } });
            return row;
          });
          for (const key of args.p_deletes) db.rows.delete(key);
          return { data: structuredClone(saved), error: null };
        }
        if (name === 'dh_submit_room_event') {
          const message = args.p_envelope as P2PWireEnvelope;
          const length = JSON.stringify(message).length;
          db.eventLengths.push(length);
          if (length > 131072) return { data: null, error: { message: 'invalid_event' } };
          const row = { sequence: db.events.length + 1, room_id: 'SYNCROOM', incarnation: 'room', author_peer_id: context.participantId,
            target_peer_id: args.p_target_peer_id, envelope: JSON.parse(JSON.stringify(message)) };
          db.events.push(row);
          if (db.holdPlayerUpdates && context.role === 'player' && (message.payload as { kind?: string }).kind === 'actor') db.heldPlayerUpdates.push(row);
          else db.emit('dh_room_events', { new: row });
          return { data: row.sequence, error: null };
        }
        return { data: null, error: null };
      },
      from(table: string) {
        let cursor = 0;
        return { select() { return this; }, eq() { return this; }, gt(_key: string, value: number) { cursor = value; return this; }, order() { return this; },
          then(resolve: (value: unknown) => unknown) {
            const data = table === 'dh_world_state' ? [...db.rows.values()] : table === 'dh_room_members' ? [...db.members.values()] : db.events.filter(x => Number(x.sequence) > cursor);
            return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve);
          }
        };
      }
    };
  }
}

async function isolatedClient(db: RoomDatabase) {
  vi.resetModules();
  const helpers = await import('./helpers');
  const { characterService } = await import('../../src/services/serviceRegistry');
  const { SceneTableService } = await import('../../src/services/SceneTableService');
  const { SupabaseRelayTransport } = await import('../../src/services/SupabaseRelayTransport');
  const sceneTable = new SceneTableService();
  const session = helpers.createTestP2PSession(new helpers.ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    characterService, sceneTableService: sceneTable,
    transportFactory: (_options, context) => Object.assign(new SupabaseRelayTransport(context!, { url: 'https://test.supabase.co', publishableKey: 'test' }, db.client(context!) as never), { sessionMode: 'hybrid' as const })
  });
  return { ...helpers, session, characterService, sceneTable };
}

test('Hope synchronizes both ways for a legacy portrait without connection recovery or a stuck pending edit', async () => {
  const db = new RoomDatabase();
  const gm = await isolatedClient(db);
  const restoreWindow = gm.installTimerWindow();
  Object.assign(window.location, { href: 'http://localhost/', origin: 'http://localhost/' });
  const storage = new Map<string, string>();
  Object.assign(window.localStorage, {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  let player = await isolatedClient(db);
  const portrait = `data:image/png;base64,${'x'.repeat(180_000)}`;
  const actor = gm.characterService.createCharacter({ id: 'hero', name: 'Герой', portraitUrl: portrait });
  gm.sceneTable.createPlayerSeat({ id: 'player', name: 'Игрок', characterId: actor.id });
  const statuses: string[] = [];
  let unsubscribe = () => {};
  try {
    await gm.session.startGmRoom({ roomId: 'SYNCROOM', participantName: 'Мастер', participantId: 'gm', connectionMode: 'server' });
    await player.session.startPlayerRoom({ roomId: 'SYNCROOM', participantName: 'Игрок', participantId: 'lobby-peer', connectionMode: 'server' });
    player.session.setPlayerActorContext({ participantId: 'player', actorId: actor.id, actorName: 'Игрок' });
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.portraitUrl, portrait));
    await gm.waitFor(() => assert.equal(player.session.session$.get().status, 'connected'));
    await player.session.publishPresence({ requesterId: 'player', actorId: actor.id, actorName: actor.name,
      playerName: 'Игрок', connected: true, voiceMuted: false, voiceLive: false });
    await gm.waitFor(() => assert.equal(gm.sceneTable.sceneTable$.get().participants.player.peerId, 'lobby-peer'));
    unsubscribe = player.session.session$.subscribe(state => statuses.push(state.status));
    player.characterService.setHope(actor.id, 4);
    await gm.waitFor(() => assert.equal(gm.characterService.getCharacter(actor.id)?.hope.value, 4)).catch(error => {
      console.log('sync diagnostics', JSON.stringify({
        gm: gm.session.session$.get().message, player: player.session.session$.get().message,
        eventCount: db.events.length, statuses
      }));
      throw error;
    });
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.playerSyncRevision?.revision, 1));
    gm.characterService.setHope(actor.id, 2);
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 2));
    player.characterService.setHope(actor.id, 5);
    await gm.waitFor(() => assert.equal(gm.characterService.getCharacter(actor.id)?.hope.value, 5));
    for (let index = 0; index < 12; index += 1) player.characterService.setHope(actor.id, index % 6);
    player.characterService.setHope(actor.id, 6);
    await gm.waitFor(() => assert.equal(gm.characterService.getCharacter(actor.id)?.hope.value, 6));
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.playerSyncRevision?.revision, 15));
    gm.characterService.setHope(actor.id, 1);
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 1));
    // Ordinary resource updates contain only the changed field, even with a large portrait.
    const updates = db.events.map(row => (row.envelope as P2PWireEnvelope).payload as { kind: string; value: any }).filter(event => event.kind === 'actor');
    assert.equal(updates.length, 15);
    for (const event of updates) {
      assert.equal(event.value.character, undefined);
      assert.deepEqual(Object.keys(event.value.patch.set), ['hope']);
      assert.deepEqual(event.value.patch.unset, []);
    }
    assert.ok(db.eventLengths.every(length => length < 2_000));

    // A later revision must retain an earlier unacknowledged edit. Deliver it
    // first, while the GM has independently changed another field.
    db.holdPlayerUpdates = true;
    player.characterService.updateIdentity(actor.id, { notes: 'Заметка игрока' });
    player.characterService.setHope(actor.id, 3);
    await gm.waitFor(() => assert.equal(db.heldPlayerUpdates.length, 2));
    gm.characterService.updateIdentity(actor.id, { name: 'Имя от мастера' });
    db.holdPlayerUpdates = false;
    for (const row of db.heldPlayerUpdates.reverse()) db.emit('dh_room_events', { new: row });
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.playerSyncRevision?.revision, 17));
    assert.equal(gm.characterService.getCharacter(actor.id)?.notes, 'Заметка игрока');
    assert.equal(player.characterService.getCharacter(actor.id)?.notes, 'Заметка игрока');
    assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 3);
    assert.equal(player.characterService.getCharacter(actor.id)?.name, 'Имя от мастера');
    db.dropStateUpdates = true;
    gm.characterService.setHope(actor.id, 2);
    await gm.waitFor(() => assert.equal((db.rows.get('characters')?.value as any)?.entities.hero.hope.value, 2));
    assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 3);
    db.dropStateUpdates = false;
    for (const listener of db.statuses) listener('SUBSCRIBED');
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 2));
    assert.equal(gm.characterService.getCharacter(actor.id)?.portraitUrl, portrait);
    assert.equal(statuses.includes('degraded'), false);
    assert.equal(statuses.includes('error'), false);
    assert.ok(db.eventLengths.every(length => length <= 131072));

    // The lobby connects before a seat is chosen. Reload must keep that network
    // identity: the GM has already bound this actor to the lobby's verified peer.
    await player.session.stop({ forgetSession: false });
    player = await isolatedClient(db);
    await player.session.startPlayerRoom({ roomId: 'SYNCROOM', participantId: 'player', participantName: 'Игрок', actorIds: [actor.id] });
    await gm.waitFor(() => assert.equal(player.session.session$.get().status, 'connected'));
    await player.session.publishPresence({ requesterId: 'player', actorId: actor.id, actorName: actor.name,
      playerName: 'Игрок', connected: true, voiceMuted: false, voiceLive: false });
    player.characterService.setHope(actor.id, 4);
    await gm.waitFor(() => assert.equal(gm.characterService.getCharacter(actor.id)?.hope.value, 4));
    gm.characterService.setHope(actor.id, 1);
    await gm.waitFor(() => assert.equal(player.characterService.getCharacter(actor.id)?.hope.value, 1));
  } finally {
    unsubscribe();
    await player.session.stop(); await gm.session.stop();
    restoreWindow();
  }
}, 15_000);
