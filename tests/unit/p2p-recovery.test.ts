import { test } from "vitest";
import assert from "node:assert/strict";
import { localAppStorageStore, sessionAppStorageStore } from "../../src/core/persistence/appBrowserStorage";
import { readP2PNetworkSettings, writeP2PNetworkSettings } from "../../src/domain/p2p/networkSettings";
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
      assert.equal(network.deliveredSnapshots, 1);
      assert.equal(network.droppedSnapshots, 1);
      assert.equal(network.droppedSnapshotRequests, 1);
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

    assert.equal(network.connects, 1);
    assert.equal(player.session$.get().role, 'player');
    assert.equal(player.session$.get().roomId, 'DUPLICATE-ROOM');
    assert.equal(player.session$.get().connected, true);
  } finally {
    await player.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P active session keeps prefixed torrent room code for restore', async () => {
  resetAllStores();
  const restoreWindow = installPersistentStorageWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const restoredGm = createTestP2PSession(network, { dice: true });

  try {
    writeP2PNetworkSettings({ strategy: 'torrent' });
    await gm.startGmRoom({ roomId: '7K2QAB', participantName: 'GM' });

    assert.equal(gm.session$.get().roomId, 'T7K2QAB');
    assert.equal(readActiveSession()?.roomId, 'T7K2QAB');

    await gm.stop({ forgetSession: false });
    writeP2PNetworkSettings({ strategy: 'nostr' });

    assert.equal(await restoredGm.restoreActiveSession('gm', 'GM'), true);
    assert.equal(restoredGm.session$.get().roomId, 'T7K2QAB');
    assert.equal(readP2PNetworkSettings().strategy, 'nostr');
  } finally {
    await restoredGm.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'nostr' });
    restoreWindow();
  }
});

test('P2P player start keeps an explicit torrent selection for clean room codes', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const player = createTestP2PSession(network);

  try {
    writeP2PNetworkSettings({ strategy: 'torrent' });
    await player.startPlayerRoom({ roomId: '7K2QAB', participantName: 'Player' });

    assert.equal(player.session$.get().roomId, 'T7K2QAB');
    assert.equal(readP2PNetworkSettings().strategy, 'torrent');
  } finally {
    await player.stop().catch(() => undefined);
    writeP2PNetworkSettings({ strategy: 'nostr' });
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
