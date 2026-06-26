import { test } from "vitest";
import assert from "node:assert/strict";
import { localAppStorageStore, sessionAppStorageStore } from "../../src/core/persistence/appBrowserStorage";
import { readP2PNetworkSettings, writeP2PNetworkSettings } from "../../src/domain/p2p/networkSettings";
import { createMapAsset } from "../../src/domain/tabletop/factories";
import { AssetService } from "../../src/services/AssetService";
import { readActiveSession } from "../../src/services/p2p/P2PSessionPersistence";
import { resetAllStores } from "../../src/stores/gameStores";
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork, waitFor } from "./helpers";

test('P2P snapshot polling resends requests when early join packets are lost', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const localStorage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => localStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          localStorage.set(key, value);
        },
        removeItem: (key: string) => {
          localStorage.delete(key);
        }
      },
      clearTimeout,
      setTimeout,
      clearInterval,
      setInterval,
      location: { pathname: '/' }
    },
    configurable: true
  });

  const network = new ScriptedP2PNetwork({ dropSnapshots: 1, dropSnapshotRequests: 1 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    await gm.startGmRoom({ roomId: 'sync-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'sync-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().role, 'player');
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(network.deliveredSnapshots >= 1, true);
      assert.equal(network.droppedSnapshots >= 1, true);
      assert.equal(network.droppedSnapshotRequests >= 1, true);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('P2P player polling recovers when player opens room before GM and peer-join notifications are missed', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const localStorage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => localStorage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          localStorage.set(key, value);
        },
        removeItem: (key: string) => {
          localStorage.delete(key);
        }
      },
      clearTimeout,
      setTimeout,
      clearInterval,
      setInterval,
      location: { pathname: '/' }
    },
    configurable: true
  });

  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 1, suppressPeerJoinNotifications: true });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    await player.startPlayerRoom({ roomId: 'early-room', participantName: 'Player' });
    await gm.startGmRoom({ roomId: 'early-room', participantName: 'GM' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().peers.length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    }, 15_000);
    const snapshotRequestsAfterSync = network.snapshotRequests;
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(network.snapshotRequests, snapshotRequestsAfterSync);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('P2P auto bootstrap connects through MQTT when Nostr is unavailable', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0, disabledStrategies: ['nostr'] });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'mqtt-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'mqtt-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().routes.find((route) => route.strategy === 'nostr')?.status, 'failed');
      assert.equal(player.session$.get().routes.find((route) => route.strategy === 'mqtt')?.activePeers.length, 1);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P auto bootstrap connects through Torrent when Nostr and MQTT are unavailable', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0, disabledStrategies: ['nostr', 'mqtt'] });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'torrent-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'torrent-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().routes.find((route) => route.strategy === 'nostr')?.status, 'failed');
      assert.equal(player.session$.get().routes.find((route) => route.strategy === 'mqtt')?.status, 'failed');
      assert.equal(player.session$.get().routes.find((route) => route.strategy === 'torrent')?.activePeers.length, 1);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P auto route retries data through another strategy when the active route stops acknowledging', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'failover-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'failover-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
    }, 15_000);

    const deliveredBeforeFailover = network.deliveredSnapshots;
    network.setStrategyEnabled('nostr', false);
    await gm.publishSnapshot({ requirePeers: true });

    await waitFor(() => {
      assert.equal(network.deliveredSnapshots >= deliveredBeforeFailover + 2, true);
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P auto route keeps a stable preferred active route while probes continue', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'stable-route-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'stable-route-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().routePeers[0]?.activeStrategy, 'nostr');
      assert.equal(gm.session$.get().routePeers[0]?.activeStrategy, 'nostr');
    }, 15_000);

    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.equal(player.session$.get().routePeers[0]?.activeStrategy, 'nostr');
    assert.equal(gm.session$.get().routePeers[0]?.activeStrategy, 'nostr');
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P auto route does not prefer a degraded strategy while probes continue', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'degraded-route-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'degraded-route-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().routePeers[0]?.activeStrategy, 'nostr');
      assert.equal(gm.session$.get().routePeers[0]?.activeStrategy, 'nostr');
    }, 15_000);

    network.emitStrategyError('nostr');
    network.setStrategyEnabled('nostr', false);

    await waitFor(() => {
      assert.equal(player.session$.get().routePeers[0]?.activeStrategy, 'mqtt');
      assert.equal(gm.session$.get().routePeers[0]?.activeStrategy, 'mqtt');
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P auto route retries data through another strategy when active route send rejects', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'send-reject-failover-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'send-reject-failover-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
    }, 15_000);

    const deliveredBeforeFailover = network.deliveredSnapshots;
    network.setStrategySendRejecting('nostr', true);
    await gm.publishSnapshot({ requirePeers: true });

    await waitFor(() => {
      assert.equal(network.deliveredSnapshots >= deliveredBeforeFailover + 2, true);
      assert.equal(gm.session$.get().routes.find((route) => route.strategy === 'mqtt')?.activePeers.length, 1);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P player ACK failover requests a fresh snapshot and republishes pending actions', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'player-failover-room', participantName: 'GM' });
    await player.startPlayerRoom({
      roomId: 'player-failover-room',
      participantId: 'participant-1',
      actorIds: ['actor-1'],
      participantName: 'Player'
    });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
    }, 15_000);

    const snapshotRequestsBeforeFailover = network.snapshotRequests;
    const playerRequestsBeforeFailover = network.dataMessages.playerRequest ?? 0;
    network.setStrategyEnabled('nostr', false);
    await player.submitPlayerRequest({
      requesterId: 'participant-1',
      requesterName: 'Player',
      actorId: 'actor-1',
      actorName: 'Hero',
      kind: 'card',
      title: 'Use card',
      payload: { cardId: 'card-1' }
    });

    await waitFor(() => {
      assert.equal(network.snapshotRequests > snapshotRequestsBeforeFailover, true);
      assert.equal((network.dataMessages.playerRequest ?? 0) >= playerRequestsBeforeFailover + 2, true);
      assert.equal(network.deliveredSnapshots >= 2, true);
    }, 15_000);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P pending asset request survives ACK failover and completes after retry', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmAssetService = createMemoryAssetService();
  const playerAssetService = createMemoryAssetService();
  const gm = createTestP2PSession(network, { dice: true, assetService: gmAssetService });
  const player = createTestP2PSession(network, { assetService: playerAssetService });

  try {
    writeP2PNetworkSettings({ strategy: 'auto' });
    await gm.startGmRoom({ roomId: 'asset-failover-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'asset-failover-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
    }, 15_000);

    const asset = createMapAsset({
      id: 'asset-failover-map',
      name: 'Map',
      mimeType: 'text/plain',
      byteSize: 11,
      storage: 'indexeddb'
    });
    await gmAssetService.putAssetBlob(asset, new Blob(['hello world'], { type: 'text/plain' }));

    network.setStrategyEnabled('nostr', false);
    const ok = await player.requestAsset(asset.id);

    assert.equal(ok, true);
    assert.equal(network.binaryMessages.asset >= 1, true);
    assert.equal((await playerAssetService.getBlob(asset.id)) !== null, true);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P player marks a silent GM disconnect as degraded and recovers when GM reopens room', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);
  const reopenedGm = createTestP2PSession(network);

  try {
    await gm.startGmRoom({ roomId: 'reopen-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'reopen-room', participantName: 'Player' });

    await waitFor(() => {
      assert.equal(player.session$.get().status, 'connected');
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().peers.length > 0, true);
    }, 15_000);

    const gmPeerId = gm.session$.get().peerId;
    assert.ok(gmPeerId);
    assert.equal(network.disconnectPeer(gmPeerId, { notify: false }), true);

    await waitFor(() => {
      assert.equal(player.session$.get().status, 'degraded');
      assert.equal(player.session$.get().message, 'Мастер не отвечает. Пытаемся переподключиться.');
    }, 2_000);

    await reopenedGm.startGmRoom({ roomId: 'reopen-room', participantName: 'GM' });
    await waitFor(() => {
      assert.equal(player.session$.get().status, 'connected');
      assert.equal(player.session$.get().lastSnapshotAt !== null, true);
      assert.equal(player.session$.get().peers.length > 0, true);
    }, 15_000);
  } finally {
    await reopenedGm.stop().catch(() => undefined);
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P session coalesces duplicate same-room starts', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const player = createTestP2PSession(network);

  try {
    await Promise.all([
      player.startPlayerRoom({ roomId: 'duplicate-room', participantName: 'Player' }),
      player.startPlayerRoom({ roomId: 'DUPLICATE-ROOM', participantName: 'Player' })
    ]);

    assert.equal(network.connects, 3);
    assert.equal(player.session$.get().role, 'player');
    assert.equal(player.session$.get().roomId, 'DUPLICATE-ROOM');
    assert.equal(player.session$.get().connected, true);
  } finally {
    await player.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P active session normalizes prefixed room code for restore', async () => {
  resetAllStores();
  const restoreWindow = installPersistentStorageWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const restoredGm = createTestP2PSession(network, { dice: true });

  try {
    writeP2PNetworkSettings({ strategy: 'torrent' as never });
    await gm.startGmRoom({ roomId: '7K2QAB', participantName: 'GM' });

    assert.equal(gm.session$.get().roomId, '7K2QAB');
    assert.equal(readActiveSession()?.roomId, '7K2QAB');

    await gm.stop({ forgetSession: false });
    writeP2PNetworkSettings({ strategy: 'nostr' as never });

    assert.equal(await restoredGm.restoreActiveSession('gm', 'GM'), true);
    assert.equal(restoredGm.session$.get().roomId, '7K2QAB');
    assert.equal(readP2PNetworkSettings().strategy, 'auto');
  } finally {
    await restoredGm.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

test('P2P player stays connected when a fresh GM replaces a stale GM peer', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);
  const reopenedGm = createTestP2PSession(network, { dice: true });

  try {
    await gm.startGmRoom({ roomId: 'gm-replace-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'GM-REPLACE-ROOM', participantName: 'Player' });
    await waitFor(() => {
      assert.equal(player.session$.get().connected, true);
      assert.equal(player.session$.get().peers.length, 1);
    });

    await reopenedGm.startGmRoom({ roomId: 'GM-REPLACE-ROOM', participantName: 'GM' });
    await waitFor(() => {
      assert.equal(player.session$.get().connected, true);
      assert.equal(player.session$.get().status, 'connected');
      assert.equal(player.session$.get().peers.length, 1);
      assert.notEqual(player.session$.get().message, 'Соединение с мастером прервалось.');
    });
  } finally {
    await reopenedGm.stop().catch(() => undefined);
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P player start keeps clean room codes and auto network settings', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'torrent' as never });
    await player.startPlayerRoom({ roomId: '7K2QAB', participantName: 'Player' });

    assert.equal(player.session$.get().roomId, '7K2QAB');
    assert.equal(readP2PNetworkSettings().strategy, 'auto');
  } finally {
    await player.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'auto' });
    restoreWindow();
  }
});

function installPersistentStorageWindow(): () => void {
  const originalWindow = globalThis.window;
  const localStorage = new Map<string, string>();
  const sessionStorage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: mapStorage(localStorage),
      sessionStorage: mapStorage(sessionStorage),
      clearTimeout,
      setTimeout,
      clearInterval,
      setInterval,
      location: { pathname: '/' }
    },
    configurable: true
  });
  localAppStorageStore.reload();
  sessionAppStorageStore.reload();
  return () => {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    localAppStorageStore.reload();
    sessionAppStorageStore.reload();
  };
}

function mapStorage(values: Map<string, string>): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}

function createMemoryAssetService(): AssetService {
  const blobs = new Map<string, Blob>();
  return new AssetService({
    get: async (id: string) => blobs.get(id) ?? null,
    put: async (id: string, blob: Blob) => {
      blobs.set(id, blob);
    },
    delete: async (id: string) => {
      blobs.delete(id);
    }
  });
}
