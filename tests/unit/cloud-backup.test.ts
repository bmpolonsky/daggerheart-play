import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CloudBackupService } from '../../src/services/CloudBackupService';
import type { ImportExportService } from '../../src/services/ImportExportService';

test('cloud backup uploads and restores the existing dhgame archive', async () => {
  const archive = new Blob([new Uint8Array([80, 75, 3, 4])], { type: 'application/zip' });
  let stored: Blob | null = null;
  let imported: Blob | null = null;
  const importExportService = {
    exportGameBundle: async () => archive,
    importFile: async (file: Blob) => {
      imported = file;
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
  const backups = new CloudBackupService(importExportService, fetcher as typeof fetch);

  await backups.save('world-1');
  assert.equal(await (stored as Blob | null)?.arrayBuffer().then((bytes) => bytes.byteLength), 4);
  assert.equal(await backups.restore('world-1'), true);
  assert.equal(await (imported as Blob | null)?.arrayBuffer().then((bytes) => bytes.byteLength), 4);
  assert.equal(await backups.remove('world-1'), true);
  assert.equal(stored, null);
});
