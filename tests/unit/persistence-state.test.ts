import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import { resetAllStores, sceneTableStore, subscribeToSyncedGameStores, syncedGameStores } from "../../src/stores/gameStores";
import { snapshotPersistedState, hydratePersistedState } from "../../src/stores/persistedState";
import { characterService, encounterService, importExportService, sceneTableService } from "../../src/services/serviceRegistry";
import type { GameDocument } from "../../src/domain/game/gameDocument";

test('persistence v4 includes table scenes and import/export hydrates them', async () => {
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
  assert.equal(snapshot.schemaVersion, 4);
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

test('hydration drops legacy string inventory instead of migrating it', () => {
  resetAllStores();
  const character = characterService.createCharacter({ name: 'Legacy Gear' });
  const snapshot = snapshotPersistedState();
  snapshot.characters.entities[character.id] = ({
    ...snapshot.characters.entities[character.id],
    inventory: ['Rope', 'Potion']
  } as unknown) as typeof snapshot.characters.entities[typeof character.id];

  hydratePersistedState(snapshot);

  assert.deepEqual(characterService.getCharacter(character.id)?.inventory, []);
});

test('persistence normalizes countdown visibility and encounter environments', () => {
  resetAllStores();
  encounterService.addCountdown({ id: 'countdown-public', name: 'Ритуал', current: 1, max: 4 });
  encounterService.addCountdown({ id: 'countdown-gm', name: 'Секрет', current: 2, max: 6, visibility: 'gm' });
  const environment = encounterService.createEnvironment({ name: 'Затопленный рынок', difficulty: 13 });
  const snapshot = snapshotPersistedState();
  snapshot.encounter.countdowns[0] = {
    ...snapshot.encounter.countdowns[0],
    visibility: undefined
  } as unknown as typeof snapshot.encounter.countdowns[number];

  hydratePersistedState(snapshot);

  const encounter = encounterService.encounter$.get();
  assert.equal(encounter.countdowns.find((item) => item.id === 'countdown-public')?.visibility, 'public');
  assert.equal(encounter.countdowns.find((item) => item.id === 'countdown-gm')?.visibility, 'gm');
  assert.equal(encounter.environments[environment.id]?.name, 'Затопленный рынок');
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
