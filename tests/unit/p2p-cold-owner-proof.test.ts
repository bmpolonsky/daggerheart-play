import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import { charactersStore, sceneTableStore, resetAllStores } from '../../src/stores/gameStores';
import { CharacterService } from '../../src/services/CharacterService';
import { SceneTableService } from '../../src/services/SceneTableService';
import type { PlayerPresence } from '../../src/services/PlayerPresenceService';
import type { CallPresenceMessage } from '../../src/services/MediaCallService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

type Source = { logicalPeerId?: string; verifiedPeerId?: string };
interface Internals {
  activeRoomConnection: { peers(): string[]; gmPeerId(): string };
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  actorOwnerVerifiedPeers: Map<string, string>;
  upsertParticipantFromPlayerPresence(presence: PlayerPresence, source?: Source): void;
  upsertParticipantFromCallPresence(presence: CallPresenceMessage, source?: Source): void;
  authorizePlayerActor(participantId: string, actorId: string, source?: Source): boolean;
  receivePlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, context?: { sourcePeerId?: string; verifiedSourcePeerId?: string }): Promise<void>;
  observeGmSnapshotAuthority(context?: { sourcePeerId?: string; verifiedSourcePeerId?: string }): void;
  capabilitiesRequest: unknown;
}
class ColdSync extends SyncService {
  acks: PlayerCharacterUpdateAckMessage[] = [];
  override async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage): Promise<boolean> { this.acks.push(message); return true; }
}
function setup(virgin = false) {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'cold-hero' });
  charactersStore.update(state => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const seat = createLocalParticipant({ id: 'cold-seat', name: 'Owner', role: 'player', actorIds: [actor.id], peerId: virgin ? undefined : 'owner-logical' });
  sceneTableStore.update(state => ({ ...state, participants: { [seat.id]: seat } }));
  const sync = new ColdSync();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    syncService: sync, characterService: new CharacterService(), sceneTableService: new SceneTableService()
  });
  const internals = session as unknown as Internals;
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'gm', connected: true, status: 'connected', roomId: 'COLD' });
  internals.activeRoomConnection = { peers: () => ['owner-logical', 'forged-logical'], gmPeerId: () => 'gm-peer' };
  const presence: PlayerPresence = { requesterId: seat.id, actorId: actor.id, actorName: actor.name, playerName: 'Owner',
    peerId: 'owner-logical', connected: true, voiceMuted: true, voiceLive: false, updatedAt: 'now' };
  const source: Source = { logicalPeerId: 'owner-logical', verifiedPeerId: 'native-owner' };
  const call: CallPresenceMessage = { type: 'callPresence', participantId: seat.id, displayName: 'Call metadata', role: 'player', connected: true, micMuted: true, cameraOff: true, updatedAt: 'now' };
  return { actor, seat, sync, session, internals, presence, source, call, restoreWindow };
}

test('cold GM cannot recreate an established owner proof from correct public IDs or replayed presence', async () => {
  const { actor, seat, sync, session, internals, presence, source, restoreWindow } = setup();
  try {
    for (let repeat = 0; repeat < 3; repeat++) internals.upsertParticipantFromPlayerPresence(presence, source);
    assert.equal(internals.actorOwnerVerifiedPeers.has(actor.id), false);
    assert.equal(sceneTableStore.get().participants[seat.id].peerId, 'owner-logical');
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, source), false);
    await internals.receivePlayerCharacterUpdate({ type: 'playerCharacterUpdate', participantId: seat.id, actorId: actor.id,
      revision: 1, updatedAt: 'now', patch: { set: { notes: 'Spoofed cold resume' }, unset: [] } },
    { sourcePeerId: 'owner-logical', verifiedSourcePeerId: 'native-owner' });
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.notEqual(charactersStore.get().entities[actor.id].notes, 'Spoofed cold resume');
  } finally { await session.stop(); restoreWindow(); }
});

test('call presence cannot set or replace an established pointer or initialize the missing owner cache', async () => {
  const { actor, seat, session, internals, call, source, restoreWindow } = setup();
  try {
    internals.upsertParticipantFromCallPresence(call, { logicalPeerId: 'forged-logical', verifiedPeerId: 'forged-native' });
    internals.upsertParticipantFromCallPresence(call, source);
    assert.equal(sceneTableStore.get().participants[seat.id].peerId, 'owner-logical');
    assert.equal(sceneTableStore.get().participants[seat.id].name, 'Owner');
    assert.equal(internals.actorOwnerVerifiedPeers.has(actor.id), false);
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, source), false);
  } finally { await session.stop(); restoreWindow(); }
});

test('a virgin assigned seat can first-bind through verified player presence, but not through a call', async () => {
  const { actor, seat, session, internals, call, presence, source, restoreWindow } = setup(true);
  try {
    internals.upsertParticipantFromCallPresence(call, source);
    assert.equal(sceneTableStore.get().participants[seat.id].peerId, undefined);
    assert.equal(internals.actorOwnerVerifiedPeers.has(actor.id), false);
    internals.upsertParticipantFromPlayerPresence(presence, source);
    assert.equal(sceneTableStore.get().participants[seat.id].peerId, 'owner-logical');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'native-owner');
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, source), true);
  } finally { await session.stop(); restoreWindow(); }
});

test('cached exact-source continuity permits metadata refresh and cannot be replaced by another call source', async () => {
  const { actor, seat, session, internals, call, presence, source, restoreWindow } = setup();
  try {
    internals.actorOwnerVerifiedPeers.set(actor.id, 'native-owner');
    internals.upsertParticipantFromPlayerPresence(presence, source);
    internals.upsertParticipantFromCallPresence(call, source);
    assert.equal(sceneTableStore.get().participants[seat.id].name, 'Call metadata');
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, source), true);
    internals.upsertParticipantFromCallPresence({ ...call, displayName: 'Spoofed' }, { logicalPeerId: 'owner-logical', verifiedPeerId: 'another-native' });
    assert.equal(sceneTableStore.get().participants[seat.id].name, 'Call metadata');
    assert.equal(internals.actorOwnerVerifiedPeers.get(actor.id), 'native-owner');
  } finally { await session.stop(); restoreWindow(); }
});

test('network source-only or undefined context never receives the trusted local-authority bypass', async () => {
  const { actor, seat, session, internals, presence, restoreWindow } = setup(true);
  try {
    internals.upsertParticipantFromPlayerPresence(presence, { logicalPeerId: 'owner-logical' });
    assert.equal(sceneTableStore.get().participants[seat.id].peerId, undefined);
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id), false);
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, { logicalPeerId: 'owner-logical' }), false);
  } finally { await session.stop(); restoreWindow(); }
});

test('an ambiguous Hybrid alias cannot advertise support for the new extra-dice feature', async () => {
  const { session, internals, restoreWindow } = setup();
  try {
    internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'player' });
    internals.observeGmSnapshotAuthority({ sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'hybrid:gm-peer' });
    assert.equal(internals.capabilitiesRequest, null);
    assert.equal(session.supportsExtraActionDice(), false);
    assert.match(session.extraActionDiceSupportError() ?? '', /гибридной/);
    await session.stop();
    assert.equal(session.extraActionDiceSupportError(), null);
  } finally { await session.stop(); restoreWindow(); }
});


test('legacy Hybrid cached continuity is retained without treating its public alias as cold-start person proof', async () => {
  const { actor, seat, session, internals, presence, restoreWindow } = setup();
  try {
    const alias = { logicalPeerId: 'owner-logical', verifiedPeerId: 'hybrid:owner-logical' };
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, alias), false);
    internals.actorOwnerVerifiedPeers.set(actor.id, alias.verifiedPeerId);
    internals.upsertParticipantFromPlayerPresence(presence, alias);
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, alias), true);
    internals.actorOwnerVerifiedPeers.clear();
    internals.upsertParticipantFromPlayerPresence(presence, alias);
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id, alias), false);
  } finally { await session.stop(); restoreWindow(); }
});

test('the undefined-context compatibility path is local disconnected authority only, never a room handler', async () => {
  const { actor, seat, session, internals, restoreWindow } = setup();
  try {
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id), false);
    internals.sessionStore.set({ ...internals.sessionStore.get(), connected: false, role: null });
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id), true);
    internals.sessionStore.set({ ...internals.sessionStore.get(), connected: false, role: 'gm' });
    assert.equal(internals.authorizePlayerActor(seat.id, actor.id), false);
  } finally { await session.stop(); restoreWindow(); }
});

test('a missing stale seat hint can use only the already-confirmed owner transport, never another seat or cold cache', async () => {
  const { actor, session, internals, source, restoreWindow } = setup();
  try {
    internals.actorOwnerVerifiedPeers.set(actor.id, 'native-owner');
    assert.equal(internals.authorizePlayerActor('stale-missing-seat', actor.id, source), true);
    assert.equal(internals.authorizePlayerActor('stale-missing-seat', actor.id, { ...source, verifiedPeerId: 'different-native' }), false);
    assert.equal(internals.authorizePlayerActor('stale-missing-seat', actor.id, { ...source, logicalPeerId: 'forged-logical' }), false);
    sceneTableStore.update(state => ({ ...state, participants: { ...state.participants,
      'other-seat': createLocalParticipant({ id: 'other-seat', name: 'Other', role: 'player', actorIds: ['other-hero'], peerId: 'other-peer' }) } }));
    assert.equal(internals.authorizePlayerActor('other-seat', actor.id, source), false);
    internals.actorOwnerVerifiedPeers.clear();
    assert.equal(internals.authorizePlayerActor('stale-missing-seat', actor.id, source), false);
  } finally { await session.stop(); restoreWindow(); }
});
