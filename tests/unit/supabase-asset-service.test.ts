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
