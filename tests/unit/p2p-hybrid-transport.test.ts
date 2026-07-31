import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

test('hybrid sessions keep game state and WebRTC media in separate rooms', async () => {
  const restoreWindow = installTimerWindow();
  const gameNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const mediaNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const session = createTestP2PSession(gameNetwork, { mediaNetwork });

  try {
    await session.startGmRoom({ roomId: 'ABC123', participantName: 'Мастер' });

    assert.ok(gameNetwork.connectedRoomIds.length > 0);
    assert.ok(gameNetwork.connectedRoomIds.every((roomId) => roomId === 'ABC123'));
    assert.ok(mediaNetwork.connectedRoomIds.length > 0);
    assert.ok(mediaNetwork.connectedRoomIds.every((roomId) => roomId === 'MEDIA-ABC123'));
  } finally {
    await session.stop();
    restoreWindow();
  }
});
