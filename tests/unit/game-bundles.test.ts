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

  const legacyJson = JSON.stringify(snapshotPersistedState());
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

test('zip archive helper round-trips utf8 paths and binary payloads', async () => {
  const archive = await writeZip([
    { path: 'manifest.json', data: '{"ok":true}' },
    { path: 'resources/images/карта.bin', data: new Uint8Array([1, 2, 3, 4]) }
  ]);
  const entries = await readZipEntries(archive);

  assert.equal(zipTextEntry(entries, 'manifest.json'), '{"ok":true}');
  assert.deepEqual(Array.from(entries.find((entry) => entry.path === 'resources/images/карта.bin')?.bytes ?? []), [1, 2, 3, 4]);
});
