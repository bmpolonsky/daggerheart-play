import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import { gameStore, resetAllStores, sceneTableStore, subscribeToSyncedGameStores, syncedGameStores } from "../../src/stores/gameStores";
import { migratePersistedState } from "../../src/domain/migrations/persistedState";
import { snapshotPersistedState, hydratePersistedState, isPersistedState } from "../../src/stores/persistedState";
import { characterService, encounterService, importExportService, sceneTableService } from "../../src/services/serviceRegistry";
import type { GameDocument } from "../../src/domain/game/gameDocument";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";

test('persistence v5 includes table scenes and import/export hydrates them', async () => {
  resetAllStores();
  sceneTableService.updateSceneTokens([{
    id: 'character:test',
    actor: { kind: 'character', id: 'test' },
    x: 115.2,
    y: 326.4,
    width: 72,
    height: 72,
    rotation: 0,
    hidden: false,
    locked: false,
    ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' }
  }]);
  sceneTableService.selectToken('character:test');
  sceneTableService.updateScene(sceneTableStore.get().activeSceneId, { mode: 'scene', backgroundUrl: 'data:image/png;base64,abc' });
  sceneTableStore.update((state) => ({
    ...state,
    assets: {
      'asset-map': {
        id: 'asset-map',
        name: 'Карта руин',
        mimeType: 'image/webp',
        storage: 'indexeddb',
        createdAt: '2026-05-22T00:00:00.000Z'
      }
    }
  }));

  const snapshot = snapshotPersistedState();
  assert.equal(snapshot.schemaVersion, 5);
  assert.deepEqual(snapshot.feed, []);
  assert.equal(Object.keys(snapshot.sceneTable.assets).length, 1);
  assert.equal(snapshot.sceneTable.scenes[snapshot.sceneTable.activeSceneId].tokens.length, 1);
  assert.equal(snapshot.sceneTable.selectedTokenId, 'character:test');

  hydratePersistedState({ ...snapshot, sceneTable: createSceneTableState() });
  assert.equal(sceneTableStore.get().scenes[sceneTableStore.get().activeSceneId].tokens.length, 0);

  const result = await importExportService.importJson(JSON.stringify(snapshot));
  assert.deepEqual(result, { ok: true });
  const importedSceneTable = sceneTableStore.get();
  assert.equal(importedSceneTable.scenes[importedSceneTable.activeSceneId].tokens[0]?.id, 'character:test');
  assert.equal(importedSceneTable.scenes[importedSceneTable.activeSceneId].mode, 'scene');

  const preview = importExportService.previewImportJson(JSON.stringify(snapshot));
  assert.equal(preview.ok, true);
  assert.equal(preview.counts.scenes, snapshot.sceneTable.sceneOrder.length);
  assert.equal(preview.counts.characters, snapshot.characters.order.length);
  assert.equal(importExportService.previewImportJson('{bad').ok, false);

  const document = JSON.parse(importExportService.exportArchiveJson(false)) as GameDocument;
  assert.equal(document.manifest.kind, 'daggerheart-play:game');
  assert.equal(document.files['resources/assets.json'].length, 1);
  assert.equal(document.files['data/scene-table.json'].assets['asset-map']?.name, 'Карта руин');
  assert.equal(importExportService.previewImportJson(JSON.stringify(document)).ok, true);
  assert.deepEqual(await importExportService.importJson(JSON.stringify(document)), { ok: true });

  const legacyArchive = {
    kind: 'daggerheart-play:game-archive',
    version: 1,
    exportedAt: '2026-05-26T00:00:00.000Z',
    document: snapshot,
    assets: Object.values(snapshot.sceneTable.assets)
  };
  assert.equal(importExportService.previewImportJson(JSON.stringify(legacyArchive)).ok, true);
});

test('custom text effects and their usage trackers survive game export and import', async () => {
  resetAllStores();
  const character = characterService.createCharacter({ name: 'Герой с домашним правилом', evasion: 10 });
  characterService.addSheetCard(character.id, {
    id: 'custom-training',
    kind: 'custom',
    name: 'Домашняя выучка',
    subtitle: 'Домашнее правило',
    text: 'Получаете постоянный бонус +1 к Уклонению. Вы можете использовать это свойство один раз до следующего продолжительного отдыха.'
  });
  characterService.configureUsageTracker(character.id, {
    id: 'custom-training-uses',
    targetKind: 'feature',
    targetId: 'custom-training',
    label: 'До продолжительного отдыха',
    current: 1,
    max: 1,
    reset: 'long'
  });

  const exported = importExportService.exportGameJson(false);
  resetAllStores();
  assert.deepEqual(await importExportService.importJson(exported), { ok: true });

  const restored = characterService.getCharacter(character.id);
  assert.ok(restored);
  assert.equal(restored.sheetCards.find((card) => card.id === 'custom-training')?.text?.startsWith('Получаете постоянный бонус'), true);
  assert.deepEqual(restored.usageTrackers?.find((tracker) => tracker.id === 'custom-training-uses'), {
    id: 'custom-training-uses',
    targetKind: 'feature',
    targetId: 'custom-training',
    label: 'До продолжительного отдыха',
    current: 1,
    max: 1,
    reset: 'long'
  });
  assert.equal(buildEffectiveCharacterStats(restored).evasion, 11);
});

test('synced game store registry backs snapshots, hydration, and subscriptions', () => {
  resetAllStores();
  const snapshotKeys = Object.keys(snapshotPersistedState()).filter((key) => key !== 'schemaVersion').sort();
  assert.deepEqual(Object.keys(syncedGameStores).sort(), snapshotKeys);

  let subscriptionCount = 0;
  const unsubscribeCallbacks = subscribeToSyncedGameStores(() => {
    subscriptionCount += 1;
  });
  for (const store of Object.values(syncedGameStores) as Array<{ get(): unknown; reset(value: unknown): void }>) {
    store.reset(store.get());
  }
  unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
  assert.equal(subscriptionCount, Object.keys(syncedGameStores).length);
});

test('persistence migrates v4 string inventory into sanitized v5 inventory', () => {
  resetAllStores();
  const character = characterService.createCharacter({ name: 'Legacy Gear' });
  const snapshot = snapshotPersistedState();
  const v4 = {
    ...snapshot,
    schemaVersion: 4 as const,
    characters: {
      ...snapshot.characters,
      entities: {
        ...snapshot.characters.entities,
        [character.id]: ({
          ...snapshot.characters.entities[character.id],
          inventory: ['Rope', 'Potion']
        } as unknown) as typeof snapshot.characters.entities[typeof character.id]
      }
    }
  };

  assert.equal(isPersistedState(v4), true);
  const migrated = migratePersistedState(v4);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.characters.entities[character.id]?.inventory, []);

  hydratePersistedState(v4);
  assert.deepEqual(characterService.getCharacter(character.id)?.inventory, []);
});

test('persistence migrates v4 countdown visibility into the v5 contract', () => {
  resetAllStores();
  encounterService.addCountdown({ id: 'countdown-public', name: 'Ритуал', current: 1, max: 4 });
  encounterService.addCountdown({ id: 'countdown-gm', name: 'Секрет', current: 2, max: 6, visibility: 'gm' });
  const environment = encounterService.createEnvironment({ name: 'Затопленный рынок', difficulty: 13 });
  const snapshot = snapshotPersistedState();
  const v4 = {
    ...snapshot,
    schemaVersion: 4 as const,
    encounter: {
      ...snapshot.encounter,
      countdowns: [
        {
          ...snapshot.encounter.countdowns[0],
          visibility: undefined
        } as unknown as typeof snapshot.encounter.countdowns[number],
        ...snapshot.encounter.countdowns.slice(1)
      ]
    }
  };

  assert.equal(environment.name, 'Затопленный рынок');
  assert.equal(isPersistedState(v4), true);
  const migrated = migratePersistedState(v4);
  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.encounter.countdowns.find((item) => item.id === 'countdown-public')?.visibility, 'public');
  assert.equal(migrated.encounter.countdowns.find((item) => item.id === 'countdown-gm')?.visibility, 'gm');
});

test('persistence migrates legacy public asset image URLs', () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: 'https://bmpolonsky.github.io',
        pathname: '/daggerheart-play/game'
      }
    },
    configurable: true
  });
  try {
    const character = characterService.createCharacter({
      name: 'Asset Paths',
      portraitUrl: '/image/character/ribbet.png',
      domainCards: [{
        id: 'card-rune',
        name: 'Rune Ward',
        domain: 'Codex',
        level: 1,
        text: '',
        inLoadout: true,
        imageUrl: '/image/domain/card/rune-ward.jpg',
        tokens: { value: 0, max: 0 }
      }],
      sheetCards: [{
        id: 'sheet-feature',
        kind: 'note',
        name: 'Feature',
        imageUrl: '/daggerheart-play/image/subclass/feature.jpeg'
      }],
      inventory: [{
        id: 'item-external',
        name: 'External Item',
        kind: 'item',
        quantity: 1,
        imageUrl: 'https://example.test/image/item/rope.png'
      }, {
        id: 'item-blob',
        name: 'Blob Item',
        kind: 'item',
        quantity: 1,
        imageUrl: 'blob:https://bmpolonsky.github.io/item'
      }, {
        id: 'item-data',
        name: 'Data Item',
        kind: 'item',
        quantity: 1,
        imageUrl: 'data:image/png;base64,AQID'
      }]
    });
    const adversary = encounterService.createAdversary({
      name: 'Same Origin',
      imageUrl: 'https://bmpolonsky.github.io/daggerheart-play/image/adversary/ooze-red.png'
    });
    const environment = encounterService.createEnvironment({
      name: 'Environment',
      imageUrl: './image/environment/cliffside-tavern.png'
    });
    gameStore.update((state) => ({
      ...state,
      handouts: [{
        id: 'handout-1',
        title: 'Handout',
        body: '',
        imageUrl: '/image/handout/clue.jpg',
        visibleToPlayers: true,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt
      }]
    }));
    sceneTableService.updateScene(sceneTableStore.get().activeSceneId, {
      backgroundUrl: '/daggerheart-play/image/environment/raging-river.png'
    });

    const migrated = migratePersistedState({
      ...snapshotPersistedState(),
      schemaVersion: 4 as const
    });
    const migratedCharacter = migrated.characters.entities[character.id];

    assert.equal(migratedCharacter.portraitUrl, '/image/character/ribbet.webp');
    assert.equal(migratedCharacter.domainCards[0]?.imageUrl, '/image/domain/card/rune-ward.webp');
    assert.equal(migratedCharacter.sheetCards[0]?.imageUrl, '/daggerheart-play/image/subclass/feature.webp');
    assert.equal(migratedCharacter.inventory[0]?.imageUrl, 'https://example.test/image/item/rope.png');
    assert.equal(migratedCharacter.inventory[1]?.imageUrl, 'blob:https://bmpolonsky.github.io/item');
    assert.equal(migratedCharacter.inventory[2]?.imageUrl, 'data:image/png;base64,AQID');
    assert.equal(migrated.encounter.adversaries[adversary.id]?.imageUrl, 'https://bmpolonsky.github.io/daggerheart-play/image/adversary/ooze-red.webp');
    assert.equal(migrated.encounter.environments[environment.id]?.imageUrl, './image/environment/cliffside-tavern.webp');
    assert.equal(migrated.game.handouts[0]?.imageUrl, '/image/handout/clue.webp');
    assert.equal(migrated.sceneTable.scenes[migrated.sceneTable.activeSceneId]?.backgroundUrl, '/daggerheart-play/image/environment/raging-river.webp');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('v3 persistence snapshots are rejected after the migration cutoff', async () => {
  resetAllStores();
  const snapshot = snapshotPersistedState();
  const legacy = {
    schemaVersion: 3 as const,
    game: snapshot.game,
    characters: snapshot.characters,
    encounter: snapshot.encounter,
    rollLog: snapshot.rollLog,
    feed: snapshot.feed,
    ui: snapshot.ui,
    sceneTable: {
      schemaVersion: 3 as const,
      activeSceneId: '',
      liveSceneId: '',
      scenes: {},
      sceneOrder: [],
      assets: {},
      participants: {},
      tokens: [{ id: 'character:legacy', kind: 'character' as const, sourceId: 'legacy', x: 50, y: 25 }],
      selectedTokenId: 'character:legacy',
      canvasViewport: { x: 0, y: 0, zoom: 1 },
      canvasSettings: { mapMode: 'image' as const, backgroundImageUrl: 'https://example.test/scene.jpg', gridSize: 48, gridOpacity: 0.5, activeCanvasTool: 'select' as const },
      updatedAt: snapshot.sceneTable.updatedAt
    }
  };

  const result = await importExportService.importJson(JSON.stringify(legacy));
  assert.equal(result.ok, false);
  const state = sceneTableStore.get();
  assert.equal(state.schemaVersion, 4);
  assert.notEqual(state.scenes[state.activeSceneId].tokens[0]?.id, 'character:legacy');
});
