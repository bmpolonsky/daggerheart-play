import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores, charactersStore, feedStore, sceneTableStore } from "../../src/stores/gameStores";
import { characterService, diceService, feedService, rollLogService } from "../../src/services/serviceRegistry";
import { P2PRoomConnection } from "../../src/services/p2p/P2PRoomConnection";
import { AssetService } from "../../src/services/AssetService";
import type { AssetBlobStore } from "../../src/core/persistence/assetBlobStore";
import type { CharacterChangeRecord } from "../../src/domain/rules/types";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";
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

test('hybrid player falls back to the direct GM when the server asset is unavailable', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const gmAssets = createMemoryAssetService();
  const playerAssets = createMemoryAssetService();
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { assetService: gmAssets.assetService });
  const player = createTestP2PSession(network, { assetService: playerAssets.assetService, hybrid: true });

  try {
    await gm.startGmRoom({ roomId: 'hybrid-asset-room', participantName: 'GM' });
    await player.startPlayerRoom({ roomId: 'HYBRID-ASSET-ROOM', participantName: 'Игрок' });
    await waitFor(() => assert.equal(player.session$.get().connected, true));
    const asset = await gmAssets.assetService.saveFile(new File([new Uint8Array([9, 8, 7])], 'map.png', { type: 'image/png' }));

    assert.equal(await player.requestAsset(asset.id, 'scene-background'), true);
    assert.deepEqual(await blobBytes(await playerAssets.assetService.getBlob(asset.id)), [9, 8, 7]);
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

    assert.equal(await player.requestAsset(asset.id, 'scene-music'), true);

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
    assert.equal(await playerSync.publishPlayerPresence({
      peerId: (playerSync.getTransport() as P2PRoomConnection).peerId,
      requesterId: participant.id,
      actorId: character.id,
      actorName: character.name,
      playerName: 'Игрок',
      connected: true,
      voiceMuted: false,
      voiceLive: false,
      updatedAt: '2026-05-26T00:00:00.000Z'
    }), true);
    await waitFor(() => {
      assert.equal(Boolean(sceneTableStore.get().participants[participant.id]?.peerId), true);
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
      intentId: 'intent-orphan-seat',
      participantId: 'stale-local-player-seat',
      actorId: character.id,
      actorName: character.name,
      publication: 'public',
      createdAt: '2026-05-26T00:00:00.500Z',
      intent: { type: 'manualDice', formula: '1d20', label: 'Recovered owner seat' }
    }), true);
    assert.equal(rollLogService.rollLog$.get().length, 2);
    assert.equal(rollLogService.rollLog$.get()[0]?.type, 'manual');

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
    assert.equal(rollLogService.rollLog$.get().length, 2);
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P GM rejects player roll intents spoofing another connected owner', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const character = characterService.createCharacter({ name: 'Ари' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { dice: true });
  const player = createTestP2PSession(network);
  const rogueSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'spoof-roll-room', participantName: 'GM' });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(character.id));
    assert.ok(participant);
    await player.startPlayerRoom({
      roomId: 'SPOOF-ROLL-ROOM',
      participantId: participant.id,
      participantName: 'Игрок',
      actorIds: [character.id]
    });
    await waitFor(() => {
      assert.equal(player.session$.get().connected, true);
      assert.equal(gm.session$.get().peers.length, 1);
    });
    assert.equal(await player.publishPresence({
      requesterId: participant.id,
      actorId: character.id,
      actorName: character.name,
      playerName: 'Игрок',
      connected: true,
      voiceMuted: false,
      voiceLive: false
    }), true);
    await waitFor(() => {
      assert.equal(Boolean(sceneTableStore.get().participants[participant.id]?.peerId), true);
    });

    await rogueSync.connectReadOnly('SPOOF-ROLL-ROOM', {
      id: 'rogue',
      name: 'Другой игрок',
      role: 'player',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal(gm.session$.get().peers.length, 2);
    });

    assert.equal(await rogueSync.publishPlayerRollIntent({
      type: 'playerRollIntent',
      intentId: 'spoofed-owner-intent',
      participantId: participant.id,
      actorId: character.id,
      actorName: character.name,
      publication: 'public',
      createdAt: '2026-05-26T00:00:01.000Z',
      intent: { type: 'manualDice', formula: '1d20', label: 'Spoofed owner' }
    }), true);

    assert.equal(rollLogService.rollLog$.get().length, 0);
  } finally {
    await rogueSync.disconnect().catch(() => undefined);
    await player.stop().catch(() => undefined);
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
    characterService.addSheetCard(character.id, {
      id: 'resource-capacity',
      kind: 'custom',
      name: 'Запас сил',
      text: 'Получите дополнительную ячейку Ран. Получите дополнительную ячейку Стресса.'
    });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(character.id));
    assert.ok(participant);
    await playerSync.connectReadOnly('RESOURCE-ROOM', {
      id: participant.id,
      name: 'Игрок',
      role: 'player',
      actorIds: [character.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    }, () => undefined);
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });
    assert.equal(await playerSync.publishPlayerPresence({
      peerId: (playerSync.getTransport() as P2PRoomConnection).peerId,
      requesterId: participant.id,
      actorId: character.id,
      actorName: character.name,
      playerName: 'Игрок',
      connected: true,
      voiceMuted: false,
      voiceLive: false,
      updatedAt: '2026-05-26T00:00:00.000Z'
    }), true);
    await waitFor(() => {
      assert.equal(Boolean(sceneTableStore.get().participants[participant.id]?.peerId), true);
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
    assert.equal(updated?.hp.marked, (updated?.hp.max ?? 0) + 1);
    assert.equal(updated?.stress.marked, (updated?.stress.max ?? 0) + 1);
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

test('P2P GM accepts an owned full-character update, replaces client audit data, and can undo it', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const character = characterService.createCharacter({ name: 'Ари', notes: 'Исходная заметка' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { characterService });
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'full-character-update-room', participantName: 'GM' });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(character.id));
    assert.ok(participant);
    await playerSync.connectReadOnly('FULL-CHARACTER-UPDATE-ROOM', {
      id: participant.id,
      name: 'Игрок Ари',
      role: 'player',
      actorIds: [character.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });
    assert.equal(await playerSync.publishPlayerPresence({
      peerId: (playerSync.getTransport() as P2PRoomConnection).peerId,
      requesterId: participant.id,
      actorId: character.id,
      actorName: character.name,
      playerName: 'Игрок Ари',
      connected: true,
      voiceMuted: false,
      voiceLive: false,
      updatedAt: '2026-05-26T00:00:00.000Z'
    }), true);
    await waitFor(() => {
      assert.equal(Boolean(sceneTableStore.get().participants[participant.id]?.peerId), true);
    });
    const acknowledgedRevisions: number[] = [];
    const unsubscribeAcks = playerSync.subscribePlayerCharacterUpdateAcks((message) => {
      if (message.actorId === character.id) acknowledgedRevisions.push(message.revision);
    });
    const canonicalBeforeUpdate = characterService.getCharacter(character.id);
    assert.ok(canonicalBeforeUpdate);

    const injectedHistory: CharacterChangeRecord = {
      id: 'client-supplied-history',
      actor: { id: 'spoofed-gm', name: 'Поддельный мастер', role: 'gm' },
      changedAt: '2026-05-26T00:00:00.500Z',
      kind: 'freeform',
      summary: 'Поддельная история',
      changes: [{
        path: ['name'],
        beforeExists: true,
        afterExists: true,
        before: canonicalBeforeUpdate.name,
        after: 'Поддельное имя'
      }]
    };
    assert.equal(await playerSync.publishPlayerCharacterUpdate({
      type: 'playerCharacterUpdate',
      participantId: participant.id,
      actorId: character.id,
      actorName: 'Игрок Ари',
      character: {
        ...canonicalBeforeUpdate,
        name: 'Ари после правки',
        notes: 'Заметка игрока',
        sheetCards: [...canonicalBeforeUpdate.sheetCards, {
          id: 'custom-training',
          kind: 'custom',
          name: 'Домашняя выучка',
          text: 'Получаете постоянный бонус +1 к Уклонению. Один раз до следующего продолжительного отдыха.'
        }],
        usageTrackers: [...(canonicalBeforeUpdate.usageTrackers ?? []), {
          id: 'custom-training-uses',
          targetKind: 'feature',
          targetId: 'custom-training',
          label: 'До продолжительного отдыха',
          current: 1,
          max: 1,
          reset: 'long'
        }],
        changeHistory: [injectedHistory]
      },
      revision: 2,
      updatedAt: '2026-05-26T00:00:01.000Z'
    }), true);

    await waitFor(() => {
      assert.equal(characterService.getCharacter(character.id)?.name, 'Ари после правки');
      assert.deepEqual(acknowledgedRevisions, [2]);
    });
    const updated = characterService.getCharacter(character.id);
    assert.ok(updated);
    assert.equal(updated.notes, 'Заметка игрока');
    assert.equal(updated.sheetCards.some((card) => card.id === 'custom-training'), true);
    assert.equal(updated.usageTrackers?.some((tracker) => tracker.id === 'custom-training-uses'), true);
    assert.equal(buildEffectiveCharacterStats(updated).evasion, updated.evasion + 1);
    assert.deepEqual(updated.playerSyncRevision, { participantId: participant.id, revision: 2 });
    assert.equal(updated.changeHistory?.length, 1);
    const authorityRecord = updated.changeHistory?.[0];
    assert.ok(authorityRecord);
    assert.notEqual(authorityRecord.id, injectedHistory.id);
    assert.deepEqual(authorityRecord.actor, {
      id: participant.id,
      name: 'Игрок Ари',
      role: 'player'
    });
    assert.equal(authorityRecord.kind, 'edit');
    assert.equal(authorityRecord.summary, 'Изменения игрока');
    assert.deepEqual(authorityRecord.changes.map((change) => change.path.join('.')).sort(), ['name', 'notes', 'sheetCards', 'usageTrackers']);

    assert.equal(await playerSync.publishPlayerCharacterUpdate({
      type: 'playerCharacterUpdate',
      participantId: participant.id,
      actorId: character.id,
      actorName: 'Игрок Ари',
      character: {
        ...canonicalBeforeUpdate,
        name: 'Запоздавшая старая правка',
        notes: 'Эта ревизия не должна примениться'
      },
      revision: 1,
      updatedAt: '2026-05-26T00:00:00.750Z'
    }), true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const afterStaleUpdate = characterService.getCharacter(character.id);
    assert.equal(afterStaleUpdate?.name, 'Ари после правки');
    assert.equal(afterStaleUpdate?.notes, 'Заметка игрока');
    assert.deepEqual(afterStaleUpdate?.playerSyncRevision, { participantId: participant.id, revision: 2 });
    assert.equal(afterStaleUpdate?.changeHistory?.length, 1);
    assert.deepEqual(acknowledgedRevisions, [2, 1]);

    const undo = characterService.undoChange(character.id, authorityRecord.id, {
      id: 'local-gm',
      name: 'GM',
      role: 'gm'
    });
    assert.equal(undo?.status, 'applied');
    const reverted = characterService.getCharacter(character.id);
    assert.ok(reverted);
    assert.equal(reverted.name, character.name);
    assert.equal(reverted.notes, character.notes);
    assert.equal(reverted.changeHistory?.length, 2);
    assert.deepEqual(reverted.changeHistory?.[1]?.actor, { id: 'local-gm', name: 'GM', role: 'gm' });
    assert.equal(reverted.changeHistory?.[1]?.kind, 'undo');
    assert.equal(reverted.changeHistory?.[1]?.undoesChangeId, authorityRecord.id);
    unsubscribeAcks();
  } finally {
    await playerSync.disconnect().catch(() => undefined);
    await gm.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('P2P GM rejects a full-character update for an actor the sending player does not own', async () => {
  resetAllStores();
  const restoreWindow = installTimerWindow();
  const ownedCharacter = characterService.createCharacter({ name: 'Ари' });
  const otherCharacter = characterService.createCharacter({ name: 'Чужой герой' });
  const network = new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 });
  const gm = createTestP2PSession(network, { characterService });
  const playerSync = createTestPlayerSync(network);

  try {
    await gm.startGmRoom({ roomId: 'foreign-character-update-room', participantName: 'GM' });
    const participant = Object.values(sceneTableStore.get().participants).find((seat) => seat.actorIds.includes(ownedCharacter.id));
    assert.ok(participant);
    await playerSync.connectReadOnly('FOREIGN-CHARACTER-UPDATE-ROOM', {
      id: participant.id,
      name: 'Игрок Ари',
      role: 'player',
      actorIds: [ownedCharacter.id],
      connected: true,
      updatedAt: '2026-05-26T00:00:00.000Z'
    });
    await waitFor(() => {
      assert.equal((playerSync.getTransport() as P2PRoomConnection).peers().length, 1);
      assert.equal(gm.session$.get().peers.length, 1);
    });
    assert.equal(await playerSync.publishPlayerPresence({
      peerId: (playerSync.getTransport() as P2PRoomConnection).peerId,
      requesterId: participant.id,
      actorId: ownedCharacter.id,
      actorName: ownedCharacter.name,
      playerName: 'Игрок Ари',
      connected: true,
      voiceMuted: false,
      voiceLive: false,
      updatedAt: '2026-05-26T00:00:00.000Z'
    }), true);
    await waitFor(() => {
      assert.equal(Boolean(sceneTableStore.get().participants[participant.id]?.peerId), true);
    });

    assert.equal(await playerSync.publishPlayerCharacterUpdate({
      type: 'playerCharacterUpdate',
      participantId: participant.id,
      actorId: otherCharacter.id,
      actorName: 'Игрок Ари',
      character: { ...otherCharacter, name: 'Украденный персонаж' },
      revision: 1,
      updatedAt: '2026-05-26T00:00:01.000Z'
    }), true);

    assert.equal(characterService.getCharacter(otherCharacter.id)?.name, otherCharacter.name);
    assert.deepEqual(characterService.getCharacter(otherCharacter.id)?.changeHistory ?? [], []);
    assert.match(gm.session$.get().message, /отклонены/i);
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
