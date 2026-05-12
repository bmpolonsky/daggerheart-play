import { test } from "vitest";
import assert from "node:assert/strict";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { SyncService } from "../../src/services/SyncService";
import { P2PRoomConnection } from "../../src/services/p2p/P2PRoomConnection";
import { installTimerWindow, ScriptedP2PNetwork, waitFor } from "./helpers";

test('readonly sync catches snapshots published during transport connect', async () => {
  const snapshot = snapshotPersistedState();
  const event = {
    id: 'sync-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    authorId: 'gm',
    kind: 'snapshot' as const,
    value: snapshot
  };
  const transport = {
    id: 'connect-snapshot',
    label: 'Connect snapshot',
    listeners: new Set<(next: typeof event) => void>(),
    async connect() {
      this.listeners.forEach((listener) => listener(event));
    },
    async disconnect() {
      this.listeners.clear();
    },
    async publish() {},
    subscribe(listener: (next: typeof event) => void) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
  };
  const sync = new SyncService();
  sync.setTransport(transport);
  let receivedSchemaVersion: number | null = null;
  await sync.connectReadOnly('room', {
    id: 'player-1',
    name: 'Игрок',
    role: 'observer',
    actorIds: [],
    connected: true,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }, (state) => {
    receivedSchemaVersion = state.schemaVersion;
  });

  assert.equal(receivedSchemaVersion, snapshot.schemaVersion);
});

test('P2P room connection tracks peers and heartbeats independently from product snapshots', async () => {
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 80 });
  const playerRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 80 });
  const gmEvents: string[] = [];
  const playerEvents: string[] = [];
  gmRoom.subscribeRoomEvents((event) => gmEvents.push(event.type));
  playerRoom.subscribeRoomEvents((event) => playerEvents.push(event.type));

  try {
    await gmRoom.connect('room-connection', {
      id: 'gm',
      name: 'GM',
      role: 'gm',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await playerRoom.connect('room-connection', {
      id: 'player',
      name: 'Player',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });

    await waitFor(() => {
      assert.equal(gmRoom.peers().length, 1);
      assert.equal(playerRoom.peers().length, 1);
      assert.equal(network.controlMessages['player-ping'] > 0, true);
      assert.equal(network.controlMessages['gm-pong'] > 0, true);
      assert.equal(playerEvents.includes('gm-restored'), false);
    }, 1000);

    const gmPeerId = gmRoom.peerId;
    assert.equal(network.disconnectPeer(gmPeerId, { notify: false }), true);
    await waitFor(() => {
      assert.equal(playerEvents.includes('gm-lost'), true);
    }, 1000);

    const reopenedGm = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 80 });
    try {
      await reopenedGm.connect('room-connection', {
        id: 'gm-2',
        name: 'GM',
        role: 'gm',
        actorIds: [],
        connected: true,
        updatedAt: '2026-05-26T00:00:01.000Z'
      });
      await waitFor(() => {
        assert.equal(playerEvents.includes('gm-restored'), true);
      }, 1000);
    } finally {
      await reopenedGm.disconnect().catch(() => undefined);
    }
  } finally {
    await playerRoom.disconnect().catch(() => undefined);
    await gmRoom.disconnect().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P room connection forwards media streams through the adapter', async () => {
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 80 });
  const playerRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 80 });
  const received: Array<{ stream: MediaStream; peerId: string; metadata?: unknown }> = [];
  playerRoom.subscribeMediaStreams((stream, peerId, metadata) => {
    received.push({ stream, peerId, metadata });
  });

  try {
    await gmRoom.connect('media-room', {
      id: 'gm',
      name: 'GM',
      role: 'gm',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await playerRoom.connect('media-room', {
      id: 'player',
      name: 'Player',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });

    const stream = { id: 'stream-1' } as unknown as MediaStream;
    await gmRoom.publishMediaStream(stream, { kind: 'voice', label: 'GM' });

    await waitFor(() => {
      assert.equal(received.length, 1);
      assert.equal(received[0]?.stream, stream);
      assert.equal(received[0]?.peerId, gmRoom.peerId);
      assert.deepEqual(received[0]?.metadata, { kind: 'voice', label: 'GM' });
      assert.equal(network.mediaMessages.voice, 1);
    }, 1000);
  } finally {
    await playerRoom.disconnect().catch(() => undefined);
    await gmRoom.disconnect().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P room connection marks GM lost even when another player remains connected', async () => {
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gmRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 200 });
  const playerRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 200 });
  const otherPlayerRoom = new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 20, gmTimeoutMs: 200 });
  const playerEvents: string[] = [];
  playerRoom.subscribeRoomEvents((event) => playerEvents.push(event.type));

  try {
    await gmRoom.connect('multi-player-room', {
      id: 'gm',
      name: 'GM',
      role: 'gm',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await playerRoom.connect('multi-player-room', {
      id: 'player',
      name: 'Player',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await otherPlayerRoom.connect('multi-player-room', {
      id: 'player-2',
      name: 'Player 2',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });

    await waitFor(() => {
      assert.equal(playerRoom.peers().length, 2);
      assert.equal(network.controlMessages['gm-pong'] > 0, true);
    }, 1000);

    assert.equal(network.disconnectPeer(gmRoom.peerId), true);

    await waitFor(() => {
      assert.equal(playerEvents.includes('gm-lost'), true);
      assert.equal(playerRoom.peers().length, 1);
    }, 1000);
  } finally {
    await otherPlayerRoom.disconnect().catch(() => undefined);
    await playerRoom.disconnect().catch(() => undefined);
    await gmRoom.disconnect().catch(() => undefined);
    restoreWindow();
  }
});
