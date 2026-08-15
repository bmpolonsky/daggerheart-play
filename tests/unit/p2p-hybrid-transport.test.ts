import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

test('hybrid sessions keep game state and WebRTC media in one room', async () => {
  const restoreWindow = installTimerWindow();
  const gameNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const session = createTestP2PSession(gameNetwork, { hybrid: true });

  try {
    await session.startGmRoom({ roomId: 'ABC123', participantName: 'Мастер' });

    assert.ok(gameNetwork.connectedRoomIds.length > 0);
    assert.ok(gameNetwork.connectedRoomIds.every((roomId) => roomId === 'ABC123'));
  } finally {
    await session.stop();
    restoreWindow();
  }
});
