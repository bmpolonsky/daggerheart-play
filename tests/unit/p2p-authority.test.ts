import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores, charactersStore, feedStore, sceneTableStore } from "../../src/stores/gameStores";
import { characterService, diceService, feedService, rollLogService } from "../../src/services/serviceRegistry";
import { P2PRoomConnection } from "../../src/services/p2p/P2PRoomConnection";
import { AssetService } from "../../src/services/AssetService";
import type { AssetBlobStore } from "../../src/core/persistence/assetBlobStore";
import { createTestP2PSession, createTestPlayerSync, installTimerWindow, ScriptedP2PNetwork, waitFor } from "./helpers";

function createMemoryAssetService(blobs = new Map<string, Blob>()): { assetService: AssetService; blobs: Map<string, Blob> } {
  return {
    assetService: new AssetService({
      get: async (id) => blobs.get(id) ?? null,
      put: async (id, blob) => {
        blobs.set(id, blob);
      },
      delete: async (id) => {
        blobs.delete(id);
      }
    } satisfies AssetBlobStore),
    blobs
  };
}

async function blobBytes(blob: Blob | null): Promise<number[] | null> {
  if (!blob) return null;
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

test('P2P GM does not publish snapshots with no connected peers', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });

  try {
    await gm.startGmRoom({ roomId: 'empty-room', participantName: 'GM' });
    const sessionBeforePublish = gm.session$.get();

    assert.equal(await gm.publishSnapshot(), false);
    assert.equal(network.deliveredSnapshots, 0);
    assert.equal(gm.session$.get().message, sessionBeforePublish.message);

    assert.equal(await gm.publishSnapshot({ requirePeers: true }), false);
    assert.equal(gm.session$.get().message, 'Некому отправлять обновление: подключенных игроков нет.');
  } finally {
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P snapshot publishes asset metadata without pushing asset blobs', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const { assetService } = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService });
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'asset-filter-room', participantName: 'GM' });
    await playerSync.connectReadOnly('ASSET-FILTER-ROOM', {
      id: 'player',
      name: 'Игрок',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 1);
    });
    await assetService.saveFile(new File([new Uint8Array([1, 2, 3])], 'map.png', { type: 'image/png' }));

    assert.equal(await gm.publishSnapshot(), true);

    assert.equal(network.dataMessages.asset ?? 0, 0);
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P player character create is applied by GM and bound to the player seat', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);

  try {
    await gm.startGmRoom({ roomId: 'character-create-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'CHARACTER-CREATE-ROOM', participantId: 'player-seat-create', participantName: 'Игрок' });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 1);
      assert.equal(player.session$.get().connected, true);
    });

    assert.equal(await player.submitPlayerCharacterCreate({
      participantName: 'Игрок',
      draft: { name: 'Новый герой', className: 'Warrior', playerName: 'Игрок' }
    }), true);

    await waitFor(() => {
      const state = charactersStore.get();
      assert.equal(state.order.length, 1);
      const character = state.entities[state.order[0]];
      assert.equal(character?.name, 'Новый герой');
      assert.deepEqual(sceneTableStore.get().participants['player-seat-create']?.actorIds, [character.id]);
    });
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P player lazily requests an existing image asset and stores its blob', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const gmAssets = createMemoryAssetService();
  const playerAssets = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService: gmAssets.assetService });
  const player = createTestP2PSession(network, { assetService: playerAssets.assetService });

  try {
    await gm.startGmRoom({ roomId: 'asset-pull-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'ASSET-PULL-ROOM', participantName: 'Игрок' });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 1);
      assert.equal(player.session$.get().connected, true);
    });
    const asset = await gmAssets.assetService.saveFile(new File([new Uint8Array([1, 2, 3, 4, 5])], 'map.png', { type: 'image/png' }));

    assert.equal(await player.requestAsset(asset.id, 'scene-background'), true);

    assert.deepEqual(await blobBytes(await playerAssets.assetService.getBlob(asset.id)), [1, 2, 3, 4, 5]);
    assert.equal(typeof await playerAssets.assetService.getObjectUrl(asset.id), 'string');
    assert.equal(network.dataMessages.asset, 1);
    assert.equal(network.binaryMessages.asset, 1);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P asset request for missing asset resolves unavailable', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const gmAssets = createMemoryAssetService();
  const playerAssets = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService: gmAssets.assetService });
  const player = createTestP2PSession(network, { assetService: playerAssets.assetService });

  try {
    await gm.startGmRoom({ roomId: 'missing-asset-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'MISSING-ASSET-ROOM', participantName: 'Игрок' });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 1);
      assert.equal(player.session$.get().connected, true);
    });

    assert.equal(await player.requestAsset('missing-asset', 'scene-background'), false);
    assert.equal(await playerAssets.assetService.getBlob('missing-asset'), null);
    assert.equal(network.dataMessages.asset, 2);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P direct asset request transfers audio blobs without mime-specific handling', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const gmAssets = createMemoryAssetService();
  const playerAssets = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService: gmAssets.assetService });
  const player = createTestP2PSession(network, { assetService: playerAssets.assetService });

  try {
    await gm.startGmRoom({ roomId: 'audio-asset-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'AUDIO-ASSET-ROOM', participantName: 'Игрок' });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 1);
      assert.equal(player.session$.get().connected, true);
    });
    const asset = await gmAssets.assetService.saveFile(new File([new Uint8Array([4, 5, 6])], 'music.mp3', { type: 'audio/mpeg' }));

    assert.equal(await player.requestAsset(asset.id, 'scene-background'), true);

    assert.deepEqual(await blobBytes(await playerAssets.assetService.getBlob(asset.id)), [4, 5, 6]);
    assert.equal(network.dataMessages.asset, 1);
    assert.equal(network.binaryMessages.asset, 1);
  } finally {
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P binary assets requested by another peer are ignored', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const gmAssets = createMemoryAssetService();
  const playerAssets = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService: gmAssets.assetService });
  const player = createTestP2PSession(network, { assetService: playerAssets.assetService });
  const rogueSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'wrong-request-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'WRONG-REQUEST-ROOM', participantName: 'Игрок' });
    await rogueSync.connectReadOnly('WRONG-REQUEST-ROOM', {
      id: 'rogue',
      name: 'Другой игрок',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 2);
      assert.equal(player.session$.get().connected, true);
    });
    const asset = await gmAssets.assetService.saveFile(new File([new Uint8Array([7, 8, 9])], 'map.png', { type: 'image/png' }));

    await rogueSync.publishAssetMessage({
      type: 'request',
      requestId: 'wrong-request-id',
      assetId: asset.id,
      reason: 'scene-background',
      requestedAt: '2026-05-26T00:00:01.000Z'
    });

    await waitFor(() => {
      assert.equal(network.binaryMessages.asset, 1);
    });

    assert.equal(await playerAssets.assetService.getBlob(asset.id), null);
    assert.equal(await player.requestAsset(asset.id, 'scene-background'), true);
    assert.deepEqual(await blobBytes(await playerAssets.assetService.getBlob(asset.id)), [7, 8, 9]);
  } finally {
    await rogueSync.disconnect().catch(() => undefined);
    await player.stop().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P GM executes player roll intents authoritatively and rejects tampered actors', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const character = characterService.createCharacter({ name: 'Ари' });
  const other = characterService.createCharacter({ name: 'Чужой герой' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'roll-room', participantName: 'GM' });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(character.id));
    assert.ok(participant);
    await playerSync.connectReadOnly('ROLL-ROOM', {
      id: participant.id,
      name: 'Игрок',
      role: 'player',
      actorIds: [character.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    assert.equal((playerSync.getTransport() as P2PRoomConnection).peerId !== '', true);
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      assert.equal(await playerSync.publishPlayerRollIntent({
        type: 'playerRollIntent',
        intentId: 'intent-1',
        participantId: participant.id,
        actorId: character.id,
        actorName: character.name,
        publication: 'public',
        createdAt: '2026-05-26T00:00:00.000Z',
        intent: {
          type: 'duality',
          rollType: 'action',
          trait: 'agility',
          difficulty: 0,
          advantageCount: 0,
          disadvantageCount: 0,
          experienceIds: [],
          spendHopeForExperiences: true,
          notes: 'Remote roll'
        }
      }), true);
    } finally {
      Math.random = originalRandom;
    }

    assert.equal(network.dataMessages.playerRollIntent, 1);
    const rollLog = rollLogService.rollLog$.get();
    assert.equal(rollLog.length, 1);
    assert.equal(rollLog[0]?.type, 'action');
    assert.equal(rollLog[0]?.actorId, character.id);

    assert.equal(await playerSync.publishPlayerRollIntent({
      type: 'playerRollIntent',
      intentId: 'intent-2',
      participantId: participant.id,
      actorId: other.id,
      actorName: other.name,
      publication: 'public',
      createdAt: '2026-05-26T00:00:01.000Z',
      intent: { type: 'manualDice', formula: '1d20', label: 'Tampered actor' }
    }), true);
    assert.equal(rollLogService.rollLog$.get().length, 1);
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P GM clamps owned resource patches and rejects patches for another actor', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const character = characterService.createCharacter({ name: 'Ари' });
  const other = characterService.createCharacter({ name: 'Чужой герой' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'resource-room', participantName: 'GM' });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(character.id));
    assert.ok(participant);
    await playerSync.connectReadOnly('RESOURCE-ROOM', {
      id: participant.id,
      name: 'Игрок',
      role: 'player',
      actorIds: [character.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });

    assert.equal(await playerSync.publishPlayerCharacterResources({
      type: 'playerCharacterResources',
      participantId: participant.id,
      actorId: character.id,
      actorName: character.name,
      resources: {
        hope: { value: 999 },
        hp: { marked: 999 },
        stress: { marked: 999 },
        armor: { markedSlots: 999 }
      },
      updatedAt: '2026-05-26T00:00:01.000Z'
    }), true);
    const updated = characterService.getCharacter(character.id);
    assert.equal(updated?.hope.value, updated?.hope.max);
    assert.equal(updated?.hp.marked, updated?.hp.max);
    assert.equal(updated?.stress.marked, updated?.stress.max);
    assert.equal(updated?.armor.markedSlots, updated?.armor.score);

    assert.equal(await playerSync.publishPlayerCharacterResources({
      type: 'playerCharacterResources',
      participantId: participant.id,
      actorId: other.id,
      actorName: other.name,
      resources: { hope: { value: 0 } },
      updatedAt: '2026-05-26T00:00:02.000Z'
    }), true);
    assert.equal(characterService.getCharacter(other.id)?.hope.value, other.hope.value);
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P GM accepts player chat feed only and rejects player-generated roll feed entries', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const character = characterService.createCharacter({ name: 'Ари' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network);
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'feed-room', participantName: 'GM' });
    await playerSync.connectReadOnly('FEED-ROOM', {
      id: 'player-1',
      name: 'Игрок',
      role: 'player',
      actorIds: [character.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });
    const roll = diceService.rollManualDice({ actorId: character.id, actorName: character.name, formula: '1d20', label: 'Local roll' });
    feedService.clear();
    rollLogService.clear();

    assert.equal(await playerSync.publishFeedEntry({
      id: 'feed-chat',
      type: 'message',
      createdAt: '2026-05-26T00:00:01.000Z',
      visibility: 'public',
      publication: 'public',
      participantId: 'player-1',
      authorName: 'Ари',
      title: 'Ари',
      body: 'Привет'
    }), true);
    assert.equal(await playerSync.publishFeedEntry({
      id: 'feed-roll',
      type: 'roll',
      createdAt: '2026-05-26T00:00:02.000Z',
      visibility: 'public',
      publication: 'public',
      participantId: 'player-1',
      authorName: 'Ари',
      title: 'Local roll',
      body: '1d20',
      roll
    }), true);

    assert.deepEqual(feedStore.get().map((entry) => entry.id), ['feed-chat']);
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});
