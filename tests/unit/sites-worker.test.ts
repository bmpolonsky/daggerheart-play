import assert from 'node:assert/strict';
import { test } from 'vitest';
import worker from '../../worker/index';
import type { D1Database, D1PreparedStatement, D1Result, ExecutionContext, R2Bucket, WorkerEnv } from '../../worker/cloudflare';

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

  const remove = await worker.fetch(new Request('https://example.test/api/worlds/world-1', {
    method: 'DELETE',
    headers: authHeaders
  }), env, {} as ExecutionContext);
  assert.equal(remove.status, 204);
  assert.equal(objects.size, 0);
});

test('Sites serves world assets to players only while the master room is active', async () => {
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  const env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    DB: activeRoomDatabase('master-1', 'world-1', 'ROOM1'),
    FILES: memoryR2(objects)
  } satisfies WorkerEnv;
  const upload = await worker.fetch(new Request('https://example.test/api/worlds/world-1/assets/scene-image', {
    method: 'PUT',
    headers: {
      'content-type': 'image/webp',
      'oai-authenticated-user-email': 'master@example.test',
      'oai-authenticated-user-id': 'master-1',
      'x-daggerheart-asset-size': '3'
    },
    body: new Uint8Array([4, 5, 6])
  }), env, {} as ExecutionContext);
  assert.equal(upload.status, 204);

  const download = await worker.fetch(new Request('https://example.test/api/rooms/ROOM1/assets/scene-image'), env, {} as ExecutionContext);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'image/webp');
  assert.deepEqual(Array.from(new Uint8Array(await download.arrayBuffer())), [4, 5, 6]);

  env.DB = activeRoomDatabase('master-1', 'world-1', 'ROOM1', Date.now() - 1);
  const afterMasterLeft = await worker.fetch(
    new Request('https://example.test/api/rooms/ROOM1/assets/scene-image'),
    env,
    {} as ExecutionContext
  );
  assert.equal(afterMasterLeft.status, 409);
});

test('Sites relays events with two D1 batches and no runtime schema work', async () => {
  const relay = relayDatabase();
  const env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    DB: relay.db,
    FILES: memoryR2(new Map())
  } satisfies WorkerEnv;
  const authHeaders = {
    'oai-authenticated-user-email': 'master@example.test',
    'oai-authenticated-user-id': 'master-1'
  };

  const poll = await worker.fetch(
    new Request('https://example.test/api/rooms/ROOM1/events?after=0', { headers: authHeaders }),
    env,
    {} as ExecutionContext
  );
  assert.equal(poll.status, 200);
  assert.equal((await poll.json() as { events: unknown[] }).events.length, 1);
  assert.equal(relay.batches.length, 2);

  const publish = await worker.fetch(new Request('https://example.test/api/rooms/ROOM1/events', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({
      envelope: {
        version: 2,
        id: 'gm-event',
        channel: 'control',
        sender: { peerId: 'gm-peer', role: 'gm' },
        sentAt: new Date(0).toISOString(),
        payload: { type: 'gm-pong' }
      }
    })
  }), env, {} as ExecutionContext);
  assert.equal(publish.status, 200);
  assert.equal(relay.batches.length, 4);
  assert.equal(relay.batches.flat().some((query) => /CREATE TABLE|PRAGMA optimize|SELECT sequence FROM/.test(query)), false);
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

function activeRoomDatabase(
  ownerId: string,
  worldId: string,
  roomId: string,
  activeUntil = Date.now() + 60_000
): D1Database {
  return {
    prepare: (query) => statement(query),
    batch: async () => []
  };

  function statement(query: string, values: unknown[] = []): D1PreparedStatement {
    return {
      bind: (...nextValues) => statement(query, nextValues),
      first: async <T>() => query.includes('FROM rooms') && values[0] === roomId
        ? {
            id: roomId,
            owner_id: ownerId,
            world_id: worldId,
            gm_peer_id: 'gm-peer',
            gm_name: 'Мастер',
            active_until: activeUntil
          } as T
        : null,
      all: async () => ({ success: true, results: [] }),
      run: async () => ({ success: true })
    };
  }
}

function relayDatabase(): { db: D1Database; batches: string[][] } {
  const batches: string[][] = [];
  const metadata = new WeakMap<D1PreparedStatement, { query: string; values: unknown[] }>();

  const statement = (query: string, values: unknown[] = []): D1PreparedStatement => {
    const prepared: D1PreparedStatement = {
      bind: (...nextValues) => statement(query, nextValues),
      first: async <T>() => (result(query, values).results?.[0] ?? null) as T | null,
      all: async <T>() => result(query, values) as { success: boolean; results?: T[] },
      run: async <T>() => result(query, values) as { success: boolean; results?: T[] }
    };
    metadata.set(prepared, { query, values });
    return prepared;
  };

  const result = (query: string, _values: unknown[]) => {
    if (query.includes('FROM rooms WHERE id')) return { success: true, results: [{
      id: 'ROOM1',
      owner_id: 'master-1',
      world_id: 'world-1',
      gm_peer_id: 'gm-peer',
      gm_name: 'Мастер',
      active_until: Date.now() + 60_000
    }] };
    if (query.includes('FROM room_events')) return { success: true, results: [{
      sequence: 1,
      author_peer_id: 'player-peer',
      target_peer_id: null,
      envelope_json: JSON.stringify({
        version: 2,
        id: 'player-event',
        channel: 'control',
        sender: { peerId: 'player-peer', role: 'player' },
        sentAt: new Date(0).toISOString(),
        payload: { type: 'player-ping' }
      })
    }] };
    if (query.includes('SELECT id FROM participants')) return { success: true, results: [{ id: 'player-peer' }] };
    return { success: true, results: [] };
  };

  return {
    batches,
    db: {
      prepare: (query) => statement(query),
      batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
        const descriptions = statements.map((prepared) => metadata.get(prepared)!);
        batches.push(descriptions.map(({ query }) => query));
        return descriptions.map(({ query, values }) => result(query, values)) as D1Result<T>[];
      }
    }
  };
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
    },
    list: async ({ prefix = '' } = {}) => ({
      objects: Array.from(objects.keys())
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
      truncated: false
    }),
    delete: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    }
  };
}
