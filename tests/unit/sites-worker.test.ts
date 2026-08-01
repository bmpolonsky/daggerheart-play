import assert from 'node:assert/strict';
import { test } from 'vitest';
import worker from '../../worker/index';
import type { D1Database, D1PreparedStatement, ExecutionContext, R2Bucket, WorkerEnv } from '../../worker/cloudflare';

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

test('Sites stores dhgame backups privately for their authenticated master', async () => {
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  const env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    DB: ownedWorldDatabase('master-1', 'world-1'),
    FILES: memoryR2(objects)
  } satisfies WorkerEnv;
  const authHeaders = {
    'content-type': 'application/zip',
    'oai-authenticated-user-email': 'master@example.test',
    'oai-authenticated-user-id': 'master-1'
  };

  const upload = await worker.fetch(new Request('https://example.test/api/worlds/world-1/backup', {
    method: 'PUT',
    headers: authHeaders,
    body: new Uint8Array([1, 2, 3])
  }), env, {} as ExecutionContext);
  assert.equal(upload.status, 204);

  const download = await worker.fetch(new Request('https://example.test/api/worlds/world-1/backup', {
    headers: authHeaders
  }), env, {} as ExecutionContext);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/zip');
  assert.match(download.headers.get('content-disposition') ?? '', /\.dhgame"$/);
  assert.deepEqual(Array.from(new Uint8Array(await download.arrayBuffer())), [1, 2, 3]);

  const stranger = await worker.fetch(new Request('https://example.test/api/worlds/world-1/backup', {
    headers: {
      'oai-authenticated-user-email': 'other@example.test',
      'oai-authenticated-user-id': 'master-2'
    }
  }), env, {} as ExecutionContext);
  assert.equal(stranger.status, 404);
});

function ownedWorldDatabase(ownerId: string, worldId: string): D1Database {
  return {
    prepare: (query) => statement(query),
    batch: async () => []
  };

  function statement(query: string, values: unknown[] = []): D1PreparedStatement {
    return {
      bind: (...nextValues) => statement(query, nextValues),
      first: async <T>() => query.includes('FROM worlds') && values[0] === ownerId && values[1] === worldId
        ? { id: worldId, name: 'Тестовый мир' } as T
        : null,
      all: async () => ({ success: true, results: [] }),
      run: async () => ({ success: true })
    };
  }
}

function memoryR2(objects: Map<string, { bytes: ArrayBuffer; contentType: string }>): R2Bucket {
  return {
    get: async (key) => {
      const object = objects.get(key);
      return object ? {
        body: new Blob([object.bytes]).stream(),
        size: object.bytes.byteLength,
        httpMetadata: { contentType: object.contentType }
      } : null;
    },
    put: async (key, value, options) => {
      const bytes = await new Response(value).arrayBuffer();
      objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream' });
    }
  };
}
