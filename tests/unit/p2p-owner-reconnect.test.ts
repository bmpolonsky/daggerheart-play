import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import { charactersStore, sceneTableStore, resetAllStores } from '../../src/stores/gameStores';
import { CharacterService } from '../../src/services/CharacterService';
import { SceneTableService } from '../../src/services/SceneTableService';
import type { PlayerPresence } from '../../src/services/PlayerPresenceService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

interface VerifiedPeer { logicalPeerId?: string; verifiedPeerId?: string }
interface Internals {
  activeRoomConnection: { peers(): string[] };
  actorOwnerVerifiedPeers: Map<string, string>;
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
  const peers = [...activePeers];
  internals.activeRoomConnection = { peers: () => peers };
  internals.actorOwnerVerifiedPeers.set(actor.id, 'verified-old');
  const presence: PlayerPresence = { requesterId: owner.id, actorId: actor.id, actorName: actor.name, playerName: owner.name,
    peerId: 'owner-new', connected: true, voiceMuted: false, voiceLive: false, updatedAt: 'now' };
  const context: VerifiedPeer = { logicalPeerId: 'owner-new', verifiedPeerId: 'verified-new' };
  return { actor, sync, session, internals, peers, presence, context, restoreWindow };
}

test('second active device cannot overwrite either assigned owner pointer or verified identity across repeated presence', async () => {
  const { actor, sync, session, internals, presence, context, restoreWindow } = setup();
  try {
    for (let attempt = 0; attempt < 4; attempt++) internals.upsertParticipantFromPlayerPresence(presence, context);
    assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'verified-old');
    await internals.receivePlayerCharacterUpdate({ type: 'playerCharacterUpdate', participantId: 'seat', actorId: actor.id,
      revision: 1, updatedAt: 'now', patch: { set: { notes: 'Second device' }, unset: [] } },
    { sourcePeerId: 'owner-new', verifiedSourcePeerId: 'verified-new' });
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.notEqual(charactersStore.get().entities[actor.id].notes, 'Second device');
  } finally { await session.stop(); restoreWindow(); }
});

test('correct public seat IDs cannot rebind a departed owner to a new unconfirmed transport identity', async () => {
  const { actor, sync, session, internals, presence, context, restoreWindow } = setup(['owner-new']);
  try {
    internals.upsertParticipantFromPlayerPresence(presence, context);
    assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'verified-old');
    await internals.receivePlayerCharacterUpdate({ type: 'playerCharacterUpdate', participantId: 'seat', actorId: actor.id,
      revision: 1, updatedAt: 'now', patch: { set: { notes: 'After reload' }, unset: [] } },
    { sourcePeerId: 'owner-new', verifiedSourcePeerId: 'verified-new' });
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.notEqual(charactersStore.get().entities[actor.id].notes, 'After reload');
  } finally { await session.stop(); restoreWindow(); }
});

test('replayed correct-ID presence remains unconfirmed after the previous logical peer leaves', async () => {
  const { actor, session, internals, peers, presence, context, restoreWindow } = setup();
  try {
    internals.upsertParticipantFromPlayerPresence(presence, context);
    assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    peers.splice(peers.indexOf('owner-old'), 1);
    internals.upsertParticipantFromPlayerPresence(presence, context);
    assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'verified-old');
  } finally { await session.stop(); restoreWindow(); }
});

for (const invalid of ['different-source', 'different-seat', 'reassigned-actor', 'unverified'] as const) {
  test(`a departed peer does not permit a rebind with ${invalid}`, async () => {
    const { actor, session, internals, presence, context, restoreWindow } = setup(['owner-new']);
    try {
      if (invalid === 'different-source') context.logicalPeerId = 'forged-source';
      if (invalid === 'different-seat') presence.requesterId = 'some-other-seat';
      if (invalid === 'reassigned-actor') sceneTableStore.update(state => ({ ...state,
        participants: { ...state.participants, seat: { ...state.participants.seat, actorIds: ['another-hero'] } } }));
      internals.upsertParticipantFromPlayerPresence(presence, invalid === 'unverified' ? undefined : context);
      assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
      assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'verified-old');
    } finally { await session.stop(); restoreWindow(); }
  });
}

test('a forged physical identity cannot rebind ownership by copying the current logical owner ID', async () => {
  const { actor, session, internals, presence, context, restoreWindow } = setup(['owner-old']);
  try {
    presence.peerId = 'owner-old';
    context.logicalPeerId = 'owner-old';
    context.verifiedPeerId = 'another-route-same-owner';
    internals.upsertParticipantFromPlayerPresence(presence, context);
    assert.equal(sceneTableStore.get().participants.seat.peerId, 'owner-old');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'verified-old');
  } finally { await session.stop(); restoreWindow(); }
});
