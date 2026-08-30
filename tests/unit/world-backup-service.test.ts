import assert from 'node:assert/strict';
import { test } from 'vitest';
import { WorldBackupService } from '../../src/services/WorldBackupService';

test('lists, saves and restores complete world archives in the owner backup folder', async () => {
  const calls: Array<{ operation: string; path: string; options?: unknown }> = [];
  let imported: Blob | null = null;
  const archive = new Blob(['world'], { type: 'application/zip' });
  const client = {
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, 'world-backups');
        return {
          list: async (path: string) => {
            calls.push({ operation: 'list', path });
            return { data: [{
              name: 'world-1.dhworld',
              updated_at: '2026-08-30T10:00:00.000Z',
              metadata: { worldId: 'world-1', worldName: 'Изгои', gameCount: 2, size: 5 }
            }], error: null };
          },
          upload: async (path: string, _body: Blob, options: unknown) => {
            calls.push({ operation: 'upload', path, options });
            return { error: null };
          },
          download: async (path: string) => {
            calls.push({ operation: 'download', path });
            return { data: archive, error: null };
          },
          remove: async ([path]: string[]) => {
            calls.push({ operation: 'remove', path });
            return { error: null };
          }
        };
      }
    }
  };
  const service = new WorldBackupService(
    { url: 'https://project.supabase.co', publishableKey: 'test' },
    {
      exportWorldBundle: async () => archive,
      importFile: async (file: Blob) => { imported = file; return { ok: true }; }
    } as never,
    client as never,
    async () => 'owner-1'
  );

  assert.deepEqual(await service.list(), [{
    id: 'world-1',
    name: 'Изгои',
    updatedAt: '2026-08-30T10:00:00.000Z',
    gameCount: 2,
    byteSize: 5
  }]);
  await service.save({ id: 'world-1', name: 'Изгои', updatedAt: null, gameCount: 2, active: true, games: [] });
  await service.restore('world-1');
  await service.remove('world-1');

  assert.equal(imported, archive);
  assert.deepEqual(calls.map(({ operation, path }) => [operation, path]), [
    ['list', 'owner-1'],
    ['upload', 'owner-1/world-1.dhworld'],
    ['download', 'owner-1/world-1.dhworld'],
    ['remove', 'owner-1/world-1.dhworld']
  ]);
});
