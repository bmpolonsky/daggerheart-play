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
