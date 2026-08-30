import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import { readZipEntries, writeZip, zipTextEntry } from "../../src/core/archive/zip";
import { setSceneMusicTrack } from "../../src/domain/audio/sceneAudio";
import { resetAllStores, sceneTableStore } from "../../src/stores/gameStores";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { gameService, importExportService, sceneTableService } from "../../src/services/serviceRegistry";
import { AssetService } from "../../src/services/AssetService";
import { ImportExportService } from "../../src/services/ImportExportService";
import { PersistenceService } from "../../src/services/PersistenceService";
import { applyBrowserCustomContent, readBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";
import { emptyCustomContent } from "../../src/domain/game/gameDocument";
import type { WorldArchiveDocument } from "../../src/core/persistence/gameDocumentStore";
import { CURRENT_PERSISTED_STATE_VERSION } from "../../src/domain/migrations/persistedState";

function createMemoryImportExportService(assetService: AssetService): ImportExportService {
  return new ImportExportService(assetService, new PersistenceService(null, assetService));
}

test('game bundles are real zip folders and legacy JSON remains importable', async () => {
  resetAllStores();
  const assetBlobs = new Map<string, Blob>();
  const memoryAssetService = new AssetService({
    get: async (id: string) => assetBlobs.get(id) ?? null,
    put: async (id: string, blob: Blob) => {
      assetBlobs.set(id, blob);
    },
    delete: async (id: string) => {
      assetBlobs.delete(id);
    }
  });
  const bundleImportExportService = createMemoryImportExportService(memoryAssetService);
  gameService.updateGame({ name: 'Zip Game' });
  applyBrowserCustomContent({
    ...emptyCustomContent(),
    classes: [{ id: 'custom-class', name: 'Класс из архива' }],
    equipment: [{ id: 'custom-equipment', name: 'Снаряжение из архива' }],
    beastforms: [{ id: 'custom-beastform', name: 'Звероформа из архива' }]
  });
  await memoryAssetService.putAssetBlob({
    id: 'asset-bundle',
    name: 'bundle-map.png',
    mimeType: 'image/png',
    storage: 'indexeddb',
    createdAt: '2026-05-26T00:00:00.000Z'
  }, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));

  const bundle = await bundleImportExportService.exportGameBundle();
  const entries = await readZipEntries(bundle);

  assert.ok(entries.some((entry) => entry.path === 'manifest.json'));
  assert.ok(entries.some((entry) => entry.path === 'data/game.json'));
  assert.equal(entries.some((entry) => entry.path === 'data/campaign.json'), false);
  assert.ok(entries.some((entry) => entry.path === 'resources/assets.json'));
  assert.ok(entries.some((entry) => entry.path === 'resources/images/asset-bundle.png'));
  assert.deepEqual(Array.from(entries.find((entry) => entry.path === 'resources/images/asset-bundle.png')?.bytes ?? []), [1, 2, 3, 4]);
  assert.equal(JSON.parse(zipTextEntry(entries, 'manifest.json') ?? '{}').name, 'Zip Game');
  assert.equal(JSON.parse(zipTextEntry(entries, 'resources/assets.json') ?? '[]')[0]?.resourcePath, 'resources/images/asset-bundle.png');
  assert.equal(JSON.parse(zipTextEntry(entries, 'content/custom-classes.json') ?? '[]')[0]?.name, 'Класс из архива');
  applyBrowserCustomContent(emptyCustomContent());
  assert.deepEqual(await bundleImportExportService.importFile(bundle), { ok: true });
  assert.equal(gameService.game$.get().name, 'Zip Game');
  assert.equal(readBrowserCustomContent().classes[0]?.name, 'Класс из архива');
  assert.equal(readBrowserCustomContent().equipment[0]?.name, 'Снаряжение из архива');
  assert.equal(readBrowserCustomContent().beastforms[0]?.name, 'Звероформа из архива');

  const legacyState = snapshotPersistedState();
  const legacyJson = JSON.stringify({ ...legacyState, sceneTable: { ...legacyState.sceneTable, assets: {} } });
  assert.deepEqual(await importExportService.importFile(new Blob([legacyJson], { type: 'application/json' })), { ok: true });
  applyBrowserCustomContent(emptyCustomContent());
});

test('game bundle export extracts embedded scene data URLs into resource files', async () => {
  resetAllStores();
  const assetBlobs = new Map<string, Blob>();
  const memoryAssetService = new AssetService({
    get: async (id: string) => assetBlobs.get(id) ?? null,
    put: async (id: string, blob: Blob) => {
      assetBlobs.set(id, blob);
    },
    delete: async (id: string) => {
      assetBlobs.delete(id);
    }
  });
  const bundleImportExportService = createMemoryImportExportService(memoryAssetService);
  const sceneId = sceneTableStore.get().activeSceneId;
  sceneTableService.updateScene(sceneId, { backgroundUrl: 'data:image/png;base64,AQIDBA==' });
  sceneTableService.setSceneMusicTrack(sceneId, { sourceUrl: 'data:audio/mpeg;base64,BQYH', title: 'battle.mp3' });

  const bundle = await bundleImportExportService.exportGameBundle();
  const entries = await readZipEntries(bundle);
  const sceneTable = JSON.parse(zipTextEntry(entries, 'data/scene-table.json') ?? '{}') as ReturnType<typeof createSceneTableState>;
  const scene = sceneTable.scenes[sceneId];
  const imageEntry = entries.find((entry) => entry.path.startsWith('resources/images/') && entry.path.endsWith('.png'));
  const audioEntry = entries.find((entry) => entry.path.startsWith('resources/audio/') && entry.path.endsWith('.mp3'));

  assert.equal(scene.backgroundUrl, '');
  assert.equal(Boolean(scene.backgroundAssetId), true);
  assert.equal(scene.music.sourceUrl, '');
  assert.equal(Boolean(scene.music.assetId), true);
  assert.deepEqual(Array.from(imageEntry?.bytes ?? []), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(audioEntry?.bytes ?? []), [5, 6, 7]);
});

test('world bundles contain all games, shared content and binary assets', async () => {
  resetAllStores();
  const blobs = new Map<string, Blob>();
  const assets = new AssetService({
    get: async (id: string) => blobs.get(id) ?? null,
    put: async (id: string, blob: Blob) => { blobs.set(id, blob); },
    delete: async (id: string) => { blobs.delete(id); }
  });
  const asset = {
    id: 'world-map',
    name: 'world-map.png',
    mimeType: 'image/png',
    storage: 'indexeddb' as const,
    createdAt: '2026-08-30T00:00:00.000Z'
  };
  await assets.putAssetBlob(asset, new Blob([new Uint8Array([7, 8, 9])], { type: 'image/png' }), { updateSceneTable: false });
  const state = snapshotPersistedState();
  const { assets: _assets, ...sceneTable } = state.sceneTable;
  const archive: WorldArchiveDocument = {
    kind: 'daggerheart-play:world-archive',
    version: 1,
    exportedAt: '2026-08-30T00:00:00.000Z',
    world: {
      id: 'world-1',
      name: 'Эстория',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
      shared: { customContent: { ...emptyCustomContent(), ancestries: [{ id: 'custom-ancestry', name: 'Своя родословная' }] }, assets: { [asset.id]: asset } },
      activeGameId: 'game-1',
      order: ['game-1', 'game-2'],
      games: {
        'game-1': { id: 'game-1', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z', state: { ...state, sceneTable } },
        'game-2': { id: 'game-2', createdAt: '2026-08-30T00:00:00.000Z', updatedAt: '2026-08-30T00:00:00.000Z', state: { ...state, game: { ...state.game, name: 'Вторая игра' }, sceneTable } }
      }
    }
  };
  let imported: WorldArchiveDocument | null = null;
  const service = new ImportExportService(assets, {
    importGameDocument: async () => undefined,
    importGameAsWorldDocument: async () => undefined,
    exportWorldDocument: async () => archive,
    importWorldDocument: async (document) => { imported = document; }
  });

  const bundle = await service.exportWorldBundle();
  const entries = await readZipEntries(bundle);
  assert.equal(JSON.parse(zipTextEntry(entries, 'manifest.json') ?? '{}').name, 'Эстория');
  assert.equal(JSON.parse(zipTextEntry(entries, 'data/world.json') ?? '{}').order.length, 2);
  assert.deepEqual(Array.from(entries.find((entry) => entry.path === 'resources/images/world-map.png')?.bytes ?? []), [7, 8, 9]);

  assert.deepEqual(await service.importFile(bundle, { expectedKind: 'world' }), { ok: true });
  assert.ok(imported);
  const importedWorld = (imported as WorldArchiveDocument).world;
  const importedGameIds = importedWorld.order;
  const importedAssetId = Object.keys(importedWorld.shared.assets)[0];
  assert.equal(importedWorld.name, 'Эстория');
  assert.equal(importedWorld.games[importedGameIds[1]].state.game.name, 'Вторая игра');
  assert.notEqual(importedGameIds[0], 'game-1');
  assert.notEqual(importedWorld.games[importedGameIds[0]].state.game.id, state.game.id);
  assert.notEqual(importedAssetId, asset.id);
  assert.deepEqual(Array.from(new Uint8Array(await (blobs.get(importedAssetId)?.arrayBuffer() ?? new ArrayBuffer(0)))), [7, 8, 9]);
  assert.equal(importedWorld.shared.customContent.ancestries[0]?.name, 'Своя родословная');
  assert.equal(CURRENT_PERSISTED_STATE_VERSION, state.schemaVersion);
});

test('world and game import buttons reject the other archive kind', async () => {
  resetAllStores();
  const assets = new AssetService({ get: async () => null, put: async () => undefined, delete: async () => undefined });
  const service = createMemoryImportExportService(assets);
  const gameBundle = await service.exportGameBundle();

  assert.deepEqual(await service.importFile(gameBundle, { expectedKind: 'world' }), {
    ok: false,
    message: 'Выбран архив игры. Используйте «Импорт игры».'
  });
});

test('world import accepts a legacy game archive as a new world', async () => {
  resetAllStores();
  const assets = new AssetService({ get: async () => null, put: async () => undefined, delete: async () => undefined });
  const gameBundle = await createMemoryImportExportService(assets).exportGameBundle();
  let imported = false;
  const service = new ImportExportService(assets, {
    importGameDocument: async () => undefined,
    importGameAsWorldDocument: async () => { imported = true; },
    exportWorldDocument: async () => null,
    importWorldDocument: async () => undefined
  });

  assert.deepEqual(await service.importFile(gameBundle, { expectedKind: 'world', gameAsNewWorld: true }), { ok: true });
  assert.equal(imported, true);
});

test('world export fails instead of producing an archive with missing local files', async () => {
  resetAllStores();
  const asset = {
    id: 'missing-map',
    name: 'missing-map.webp',
    mimeType: 'image/webp',
    storage: 'indexeddb' as const,
    createdAt: '2026-08-30T00:00:00.000Z'
  };
  const state = snapshotPersistedState();
  const { assets: _assets, ...sceneTable } = state.sceneTable;
  const archive: WorldArchiveDocument = {
    kind: 'daggerheart-play:world-archive',
    version: 1,
    exportedAt: '2026-08-30T00:00:00.000Z',
    world: {
      id: 'world-1', name: 'Мир', createdAt: state.game.updatedAt, updatedAt: state.game.updatedAt,
      shared: { customContent: emptyCustomContent(), assets: { [asset.id]: asset } },
      activeGameId: 'game-1', order: ['game-1'],
      games: { 'game-1': { id: 'game-1', createdAt: state.game.updatedAt, updatedAt: state.game.updatedAt, state: { ...state, sceneTable } } }
    }
  };
  const service = new ImportExportService(
    new AssetService({ get: async () => null, put: async () => undefined, delete: async () => undefined }),
    { importGameDocument: async () => undefined, importGameAsWorldDocument: async () => undefined, exportWorldDocument: async () => archive, importWorldDocument: async () => undefined }
  );

  await assert.rejects(service.exportWorldBundle(), /missing-map\.webp/);
});

test('zip archive helper round-trips utf8 paths and binary payloads', async () => {
  const archive = await writeZip([
    { path: 'manifest.json', data: '{"ok":true}' },
    { path: 'resources/images/карта.bin', data: new Uint8Array([1, 2, 3, 4]) }
  ]);
  const entries = await readZipEntries(archive);

  assert.equal(zipTextEntry(entries, 'manifest.json'), '{"ok":true}');
  assert.deepEqual(Array.from(entries.find((entry) => entry.path === 'resources/images/карта.bin')?.bytes ?? []), [1, 2, 3, 4]);
});
