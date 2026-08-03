import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CloudBackupService } from '../../src/services/CloudBackupService';
import type { AssetService } from '../../src/services/AssetService';
import type { ImportExportService } from '../../src/services/ImportExportService';

test('cloud backup uploads and restores the existing dhgame archive', async () => {
  const archive = new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/zip' });
  let stored: Blob | null = null;
  let imported: Blob | null = null;
  let importedAsNewGame = false;
  const importExportService = {
    exportGameBundle: async () => archive,
    importFile: async (file: Blob, options?: { asNewGame?: boolean }) => {
      imported = file;
      importedAsNewGame = options?.asNewGame === true;
      return { ok: true as const };
    }
  } as ImportExportService;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      stored = init.body as Blob;
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'DELETE') {
      stored = null;
      return new Response(null, { status: 204 });
    }
    return stored ? new Response(stored) : new Response(null, { status: 404 });
  };
  const backups = new CloudBackupService(importExportService, undefined, fetcher as typeof fetch);

  await backups.save('world-1');
  assert.equal(await (stored as Blob | null)?.arrayBuffer().then((bytes) => bytes.byteLength), 4);
  assert.equal(await backups.restore('world-1'), true);
  assert.equal(await (imported as Blob | null)?.arrayBuffer().then((bytes) => bytes.byteLength), 4);
  assert.equal(importedAsNewGame, true);
  assert.equal(await backups.remove('world-1'), true);
  assert.equal(stored, null);
});

test('cloud backup uploads indexeddb assets once per unchanged file', async () => {
  const archive = new Blob([new Uint8Array([80, 75])], { type: 'application/zip' });
  const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
  const importExportService = {
    exportGameBundle: async () => archive
  } as ImportExportService;
  const assetService = {
    exportAssetFiles: async () => [{
      asset: {
        id: 'scene-image',
        name: 'Фон',
        mimeType: 'image/webp',
        byteSize: image.size,
        storage: 'indexeddb'
      },
      path: 'assets/scene-image.webp',
      blob: image
    }]
  } as unknown as AssetService;
  const uploads: Array<{ url: string; type: string; size: number }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const blob = init?.body as Blob;
    uploads.push({ url: String(input), type: blob.type, size: blob.size });
    return new Response(null, { status: 204 });
  };
  const backups = new CloudBackupService(importExportService, assetService, fetcher as typeof fetch);

  await backups.save('world-1');
  await backups.save('world-1');

  assert.deepEqual(uploads, [
    { url: '/api/worlds/world-1/assets/scene-image', type: 'image/webp', size: 3 },
    { url: '/api/worlds/world-1/backup', type: 'application/zip', size: 2 },
    { url: '/api/worlds/world-1/backup', type: 'application/zip', size: 2 }
  ]);
});
