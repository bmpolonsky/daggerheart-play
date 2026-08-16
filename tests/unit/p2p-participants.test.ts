import { test } from "vitest";
import assert from "node:assert/strict";
import { MediaCallService } from "../../src/services/MediaCallService";
import { SceneTableService } from "../../src/services/SceneTableService";
import { SyncService } from "../../src/services/SyncService";
import { resetAllStores } from "../../src/stores/gameStores";
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork, waitFor } from "./helpers";

test('P2P call presence creates unified participants with call display names', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmSceneTable = new SceneTableService();
  const gmSync = new SyncService();
  const playerSync = new SyncService();
  const gmCall = new MediaCallService(gmSync);
  const playerCall = new MediaCallService(playerSync);
  const gm = createTestP2PSession(network, {
    dice: true,
    sceneTableService: gmSceneTable,
    syncService: gmSync,
    mediaCallService: gmCall
  });
  const player = createTestP2PSession(network, {
    syncService: playerSync,
    mediaCallService: playerCall
  });
  const seat = gmSceneTable.createPlayerSeat({ name: 'Анна' });

  try {
    await gm.startGmRoom({ roomId: 'call-names-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'call-names-room', participantId: seat.id, participantName: 'Анна' });
    playerCall.setRoom({ roomId: player.session$.get().roomId, displayName: 'Анна', role: 'player', active: true });

    await waitFor(() => {
      const participant = Object.values(gmSceneTable.sceneTable$.get().participants).find((item) => item.name === 'Анна');
      assert.ok(participant);
      assert.equal(participant?.role, 'player');
      assert.equal(participant?.connected, true);
      assert.equal(participant?.peerId, player.session$.get().peerId);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
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
