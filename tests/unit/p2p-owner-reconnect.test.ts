import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import { charactersStore, sceneTableStore, resetAllStores } from '../../src/stores/gameStores';
import { CharacterService } from '../../src/services/CharacterService';
import { SceneTableService } from '../../src/services/SceneTableService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import type { PlayerPresence } from '../../src/services/PlayerPresenceService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

interface VerifiedPeer { logicalPeerId?: string; verifiedPeerId?: string }
interface Internals {
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  activeRoomConnection: { peers(): string[] };
  upsertParticipantFromPlayerPresence(presence: PlayerPresence, context?: VerifiedPeer): void;
  receivePlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, context?: { sourcePeerId?: string; verifiedSourcePeerId?: string }): Promise<void>;
}
class OwnerSync extends SyncService {
  acks: PlayerCharacterUpdateAckMessage[] = [];
  override async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage): Promise<boolean> { this.acks.push(message); return true; }
}
function setup(activePeers = ['owner-old', 'owner-new']) {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'owner-hero' });
  charactersStore.update(state => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const owner = createLocalParticipant({ id: 'seat', name: 'Owner', role: 'player', actorIds: [actor.id], peerId: 'owner-old' });
  sceneTableStore.update(state => ({ ...state, participants: { [owner.id]: owner } }));
  const sync = new OwnerSync();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    syncService: sync, characterService: new CharacterService(), sceneTableService: new SceneTableService()
  });
  const internals = session as unknown as Internals;
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'gm', connected: true, status: 'connected', roomId: 'OWNER' });
  const peers = [...activePeers];
  internals.activeRoomConnection = { peers: () => peers };
  const presence: PlayerPresence = { requesterId: owner.id, actorId: actor.id, actorName: actor.name, playerName: owner.name,
    peerId: 'owner-new', connected: true, voiceMuted: false, voiceLive: false, updatedAt: 'now' };
  const context: VerifiedPeer = { logicalPeerId: 'owner-new', verifiedPeerId: 'verified-new' };
  return { actor, sync, session, internals, peers, presence, context, restoreWindow };
}


for (const scenario of ['reload', 'two devices', 'GM restart', 'background reconnect'] as const) {
  test(`trusted room permits ${scenario} without exclusive owner proof`, async () => {
    const { actor, sync, session, internals, presence, context, restoreWindow } = setup(scenario === 'two devices' ? ['owner-old', 'owner-new'] : ['owner-new']);
    try {
      internals.upsertParticipantFromPlayerPresence(presence, context);
      assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-new');
      const update: PlayerCharacterUpdateMessage = { type: 'playerCharacterUpdate', participantId: 'seat', actorId: actor.id,
        revision: 1, updatedAt: 'now', patch: { set: { notes: scenario }, unset: [] } };
      const source = { sourcePeerId: 'owner-new', verifiedSourcePeerId: 'verified-new' };
      await internals.receivePlayerCharacterUpdate(update, source);
      assert.ok(sync.acks.length > 0);
      assert.notEqual(sync.acks.at(-1)?.accepted, false);
      assert.equal(charactersStore.get().entities[actor.id].notes, scenario);
      // A replay is acknowledged without undoing a later master edit.
      charactersStore.update(state => ({ ...state, entities: { ...state.entities, [actor.id]: { ...state.entities[actor.id], notes: 'Later GM edit' } } }));
      await internals.receivePlayerCharacterUpdate(update, source);
      assert.ok(sync.acks.length > 0);
      assert.notEqual(sync.acks.at(-1)?.accepted, false);
      assert.equal(charactersStore.get().entities[actor.id].notes, 'Later GM edit');
      // Same revision from a second device with a different operation cannot overwrite.
      await internals.receivePlayerCharacterUpdate({ ...update, patch: { set: { notes: 'Conflict' }, unset: [] } }, source);
      assert.equal(sync.acks.at(-1)?.accepted, false);
      assert.equal(charactersStore.get().entities[actor.id].notes, 'Later GM edit');
      if (scenario === 'two devices') {
        await internals.receivePlayerCharacterUpdate({ ...update, revision: 2, patch: { set: { notes: 'Old device still active' }, unset: [] } },
          { sourcePeerId: 'owner-old', verifiedSourcePeerId: 'verified-old' });
        assert.ok(sync.acks.length > 0);
      assert.notEqual(sync.acks.at(-1)?.accepted, false);
        assert.equal(charactersStore.get().entities[actor.id].notes, 'Old device still active');
      }
    } finally { await session.stop(); restoreWindow(); }
  });
}

for (const invalid of ['different-source', 'different-seat', 'reassigned-actor', 'unverified', 'outside-room'] as const) {
  test(`presence still rejects ${invalid}`, async () => {
    const { session, internals, presence, context, restoreWindow } = setup(['owner-new']);
    try {
      if (invalid === 'different-source') context.logicalPeerId = 'forged-source';
      if (invalid === 'different-seat') presence.requesterId = 'some-other-seat';
      if (invalid === 'reassigned-actor') sceneTableStore.update(state => ({ ...state,
        participants: { ...state.participants, seat: { ...state.participants.seat, actorIds: ['another-hero'] } } }));
      if (invalid === 'outside-room') { context.logicalPeerId = 'outside'; presence.peerId = 'outside'; }
      internals.upsertParticipantFromPlayerPresence(presence, invalid === 'unverified' ? undefined : context);
      assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    } finally { await session.stop(); restoreWindow(); }
  });
}

test('a departed source cannot send a new operation after reconnect', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup(['owner-new']);
  try {
    await internals.receivePlayerCharacterUpdate({ type: 'playerCharacterUpdate', participantId: 'seat', actorId: actor.id,
      revision: 1, updatedAt: 'now', patch: { set: { notes: 'Stale disconnected source' }, unset: [] } },
      { sourcePeerId: 'owner-old', verifiedSourcePeerId: 'verified-old' });
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.notEqual(charactersStore.get().entities[actor.id].notes, 'Stale disconnected source');
  } finally { await session.stop(); restoreWindow(); }
});
