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

test('Sites falls back to the client index for application routes', async () => {
  const requestedPaths: string[] = [];
  const response = await worker.fetch(
    new Request('https://daggerheart-play-server.example/game', { headers: { accept: 'text/html' } }),
    {
      ASSETS: {
        fetch: async (request: Request) => {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);
          return pathname === '/index.html'
            ? new Response('<main>Daggerheart Play</main>', { status: 200 })
            : new Response(null, { status: 404 });
        }
      }
    } as unknown as WorkerEnv,
    {} as ExecutionContext
  );

  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/game', '/index.html']);
});

test('Sites preserves application routes when its asset service redirects them to root', async () => {
  const requestedPaths: string[] = [];
  const response = await worker.fetch(
    new Request('https://daggerheart-play.example/join/ABC123', { headers: { accept: 'text/html' } }),
    {
      ASSETS: {
        fetch: async (request: Request) => {
          const pathname = new URL(request.url).pathname;
          requestedPaths.push(pathname);
          return pathname === '/index.html'
            ? new Response('<main>Daggerheart Play</main>', { status: 200 })
            : Response.redirect('https://daggerheart-play.example/', 307);
        }
      }
    } as unknown as WorkerEnv,
    {} as ExecutionContext
  );

  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/join/ABC123', '/index.html']);
});
