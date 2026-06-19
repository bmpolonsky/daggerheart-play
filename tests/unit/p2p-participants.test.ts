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

  try {
    await gm.startGmRoom({ roomId: 'call-names-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'call-names-room', participantName: 'Анна' });
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
