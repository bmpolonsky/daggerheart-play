import assert from 'node:assert/strict';
import { test } from 'vitest';
import { gameStore } from '../../src/stores/gameStores';
import type { CloudBackupService } from '../../src/services/CloudBackupService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork, waitFor } from './helpers';

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

test('hybrid GM snapshots local changes without connected players', async () => {
  const restoreWindow = installTimerWindow();
  const gameNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const mediaNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  let saves = 0;
  const cloudBackupService = {
    save: async () => { saves += 1; },
    saveAssets: async () => undefined
  } as unknown as CloudBackupService;
  const session = createTestP2PSession(gameNetwork, { mediaNetwork, cloudBackupService });

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

test('player server fallback keeps media on the resulting P2P room', async () => {
  const restoreWindow = installTimerWindow();
  const gameNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const mediaNetwork = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const session = createTestP2PSession(gameNetwork, {
    mediaNetwork,
    transportFactory: (options) => {
      const transport = gameNetwork.createTransport(options) as ReturnType<ScriptedP2PNetwork['createTransport']> & { sessionMode: 'p2p' | 'hybrid' };
      Object.defineProperty(transport, 'sessionMode', { configurable: true, writable: true, value: 'hybrid' });
      const connect = transport.connect.bind(transport);
      transport.connect = async (roomId) => {
        await connect(roomId);
        transport.sessionMode = 'p2p';
      };
      return transport;
    }
  });

  try {
    await session.startPlayerRoom({ roomId: 'ABC123', participantName: 'Игрок' });
    assert.equal(session.session$.get().transportMode, 'p2p');
    assert.equal(mediaNetwork.connects, 0);
  } finally {
    await session.stop();
    restoreWindow();
  }
});
