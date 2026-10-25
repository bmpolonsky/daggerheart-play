import { test } from "vitest";
import assert from "node:assert/strict";
import { MediaCallService } from "../../src/services/MediaCallService";
import { SceneTableService } from "../../src/services/SceneTableService";
import { SyncService } from "../../src/services/SyncService";
import { characterService } from "../../src/services/serviceRegistry";
import { P2PRoomConnection } from "../../src/services/p2p/P2PRoomConnection";
import { resetAllStores } from "../../src/stores/gameStores";
import { createTestP2PSession, createTestPlayerSync, installTimerWindow, ScriptedP2PNetwork, waitFor } from "./helpers";

test('P2P call presence is metadata-only until assigned actor presence confirms the transport', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmSceneTable = new SceneTableService();
  const gmSync = new SyncService();
  const playerSync = createTestPlayerSync(network);
  const gmCall = new MediaCallService(gmSync);
  const playerCall = new MediaCallService(playerSync);
  const gm = createTestP2PSession(network, {
    dice: true,
    sceneTableService: gmSceneTable,
    syncService: gmSync,
    mediaCallService: gmCall
  });
  const seat = gmSceneTable.createPlayerSeat({ name: 'Анна' });

  try {
    await gm.startGmRoom({ roomId: 'call-names-room', participantName: 'GM' });
    // A read-only transport represents the isolated player here. Starting a
    // second full P2PSessionService would mutate the same module-global store
    // in this unit fixture, unlike the two browser profiles in the real E2E.
    await playerSync.connectReadOnly('CALL-NAMES-ROOM', { id: seat.id, name: 'Анна', role: 'player', actorIds: [], connected: true, updatedAt: 'now' });
    playerCall.setRoom({ roomId: 'CALL-NAMES-ROOM', participantId: seat.id, displayName: 'Звонок без подтверждения', role: 'player', active: true });
    await playerCall.publishPresence();
    await waitFor(() => assert.equal(gmCall.call$.get().remoteParticipants[seat.id]?.displayName, 'Звонок без подтверждения'));
    assert.equal(gmSceneTable.sceneTable$.get().participants[seat.id].peerId, undefined);
    assert.equal(gmSceneTable.sceneTable$.get().participants[seat.id].connected, false);

    // Intended initial flow: the GM assigns a real actor to the virgin seat,
    // then verified actor presence (not the call) establishes the binding.
    const actor = characterService.createCharacter({ name: 'Герой Анны' });
    gmSceneTable.updatePlayerSeat(seat.id, { characterId: actor.id });
    const peerId = (playerSync.getTransport() as P2PRoomConnection).peerId;
    await playerSync.publishPlayerPresence({ peerId, requesterId: seat.id, actorId: actor.id,
      actorName: actor.name, playerName: 'Анна', connected: true, voiceMuted: true, voiceLive: false, updatedAt: 'now' });
    await waitFor(() => assert.equal(gmSceneTable.sceneTable$.get().participants[seat.id].peerId, peerId));
    playerCall.setRoom({ roomId: 'CALL-NAMES-ROOM', participantId: seat.id, displayName: 'Анна из звонка', role: 'player', active: true });
    await playerCall.publishPresence();
    await waitFor(() => {
      const participant = gmSceneTable.sceneTable$.get().participants[seat.id];
      assert.equal(participant.name, 'Анна из звонка');
      assert.equal(participant.role, 'player');
      assert.equal(participant.connected, true);
      assert.equal(participant.peerId, peerId);
    });
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('transport roster never creates player seats before a player chooses one', () => {
  resetAllStores();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const sceneTable = new SceneTableService();
  const session = createTestP2PSession(network, { sceneTableService: sceneTable });
  const seats = [
    sceneTable.createPlayerSeat({ name: 'Игрок 1' }),
    sceneTable.createPlayerSeat({ name: 'Игрок 2' }),
    sceneTable.createPlayerSeat({ name: 'Игрок 3' })
  ];

  const internals = session as unknown as {
    handleRoomConnectionEvent(event: {
      type: 'roster-updated';
      peers: string[];
      roster: Array<{ peerId: string; displayName: string; role: 'player' }>;
    }): void;
  };
  internals.handleRoomConnectionEvent({
    type: 'roster-updated',
    peers: ['player-1786875054253'],
    roster: [{ peerId: 'player-1786875054253', displayName: 'Игрок', role: 'player' }]
  });

  const participants = Object.values(sceneTable.sceneTable$.get().participants);
  assert.equal(participants.some((participant) => participant.id === 'player-1786875054253'), false);
  assert.deepEqual(
    participants.filter((participant) => participant.role === 'player').map((participant) => participant.id),
    seats.map((seat) => seat.id)
  );
});

test('transport roster does not restore a deleted connected player seat', () => {
  resetAllStores();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const sceneTable = new SceneTableService();
  const session = createTestP2PSession(network, { sceneTableService: sceneTable });
  const seat = sceneTable.createPlayerSeat({ name: 'Игрок' });
  sceneTable.upsertParticipantPresence({
    id: seat.id,
    name: seat.name,
    role: 'player',
    peerId: 'player-connected',
    connected: true
  });
  sceneTable.removePlayerSeat(seat.id);

  const internals = session as unknown as {
    handleRoomConnectionEvent(event: {
      type: 'roster-updated';
      peers: string[];
      roster: Array<{ peerId: string; displayName: string; role: 'player' }>;
    }): void;
  };
  internals.handleRoomConnectionEvent({
    type: 'roster-updated',
    peers: ['player-connected'],
    roster: [{ peerId: 'player-connected', displayName: 'Игрок', role: 'player' }]
  });

  assert.equal(Object.values(sceneTable.sceneTable$.get().participants).some((participant) => participant.role === 'player'), false);
});
