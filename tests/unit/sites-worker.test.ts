import assert from 'node:assert/strict';
import { test } from 'vitest';
import worker from '../../worker/index';
import type { ExecutionContext, WorkerEnv } from '../../worker/cloudflare';

test('Sites redirects omitted image assets to the existing Pages deployment', async () => {
  const response = await worker.fetch(
    new Request('https://daggerheart-play-server.example/image/environment/hallow-temple.webp?v=1'),
    {
      ASSETS: { fetch: async () => new Response(null, { status: 404 }) }
    } as unknown as WorkerEnv,
    {} as ExecutionContext
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://bmpolonsky.github.io/daggerheart-play/image/environment/hallow-temple.webp?v=1');
});
