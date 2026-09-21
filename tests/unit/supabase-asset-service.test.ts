import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SupabaseAssetService } from '../../src/services/SupabaseAssetService';

test('coalesces concurrent uploads of the same scene asset', async () => {
  let uploads = 0;
  let finishUpload: (() => void) | undefined;
  const client = {
    storage: {
      from: () => ({
        upload: async () => {
          uploads += 1;
          await new Promise<void>((resolve) => { finishUpload = resolve; });
          return { error: null };
        }
      })
    }
  };
  const service = new SupabaseAssetService(
    { url: 'https://project.supabase.co', publishableKey: 'test' },
    client as never,
    async () => 'owner-1'
  );

  const first = service.upload('world-1', 'asset-1', new Blob(['map'], { type: 'image/webp' }));
  const second = service.upload('world-1', 'asset-1', new Blob(['map'], { type: 'image/webp' }));
  while (uploads === 0) await Promise.resolve();
  assert.equal(uploads, 1);
  finishUpload?.();
  await Promise.all([first, second]);
});

test('includes the Storage error when an upload fails', async () => {
  const client = {
    storage: {
      from: () => ({
        upload: async () => ({ error: { message: 'row-level security policy' } })
      })
    }
  };
  const service = new SupabaseAssetService(
    { url: 'https://project.supabase.co', publishableKey: 'test' },
    client as never,
    async () => 'owner-1'
  );

  await assert.rejects(
    service.upload('world-1', 'asset-1', new Blob(['map'], { type: 'image/webp' })),
    /row-level security policy/
  );
});

test('signed portrait uploads target one owner-scoped file without granting write access to the bucket', async () => {
  const calls: unknown[][] = [];
  const client = { storage: { from: (bucket: string) => ({
    createSignedUploadUrl: async (path: string, options?: unknown) => {
      calls.push(['sign', bucket, path, options]); return { data: { token: 'one-file-ticket' }, error: null };
    },
    uploadToSignedUrl: async (path: string, token: string, blob: Blob, options: unknown) => {
      calls.push(['upload', bucket, path, token, blob, options]); return { error: null };
    }
  }) } };
  const owner = new SupabaseAssetService({ url: 'https://project.supabase.co', publishableKey: 'test' }, client as never, async () => 'owner');
  const player = new SupabaseAssetService({ url: 'https://project.supabase.co', publishableKey: 'test' }, client as never, async () => { throw new Error('Player is not the owner'); });
  const ticket = await owner.createUploadTicket('world', 'asset_portrait');
  const blob = new Blob(['image'], { type: 'image/webp' });
  await player.uploadWithTicket(ticket, blob);
  assert.deepEqual(calls, [
    ['sign', 'world-assets', 'owner/world/assets/asset_portrait', undefined],
    ['upload', 'world-assets', 'owner/world/assets/asset_portrait', 'one-file-ticket', blob, { contentType: 'image/webp' }]
  ]);
});
