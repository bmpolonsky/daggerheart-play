import assert from 'node:assert/strict';
import { test } from 'vitest';
import { gameStore } from '../../src/stores/gameStores';
import type { CloudBackupService } from '../../src/services/CloudBackupService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork, waitFor } from './helpers';

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

test('hybrid GM snapshots local changes without connected players', async () => {
  const restoreWindow = installTimerWindow();
  const gameNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  let saves = 0;
  const cloudBackupService = {
    save: async () => { saves += 1; },
    saveAssets: async () => undefined
  } as unknown as CloudBackupService;
  const session = createTestP2PSession(gameNetwork, { hybrid: true, cloudBackupService });

  try {
    await session.startGmRoom({ roomId: 'ABC123', participantName: 'Мастер' });
    gameStore.update((game) => ({ ...game, updatedAt: new Date().toISOString() }));
    await waitFor(() => assert.ok(session.session$.get().lastSnapshotAt));
    await session.stop();
    assert.ok(saves >= 2);
  } finally {
    await session.stop();
    restoreWindow();
  }
});
