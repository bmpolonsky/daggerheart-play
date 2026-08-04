import { schemaStatements } from '../db/schema';
import { isMasterLeaseActive, isPlayerEnvelopeAllowed, normalizeServerRoomId } from '../src/domain/p2p/serverSession';
import { isP2PWireEnvelope, type P2PWireEnvelope } from '../src/services/p2p/P2PTransportAdapter';
import type { D1Database, ExecutionContext, R2Bucket, WorkerEnv } from './cloudflare';

const MASTER_LEASE_MS = 60_000;
const PARTICIPANT_LEASE_MS = 90_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_LONG_POLL_MS = 15_000;
const LONG_POLL_INTERVAL_MS = 500;
const EVENT_RETENTION_MS = 10 * 60_000;
const MAX_EVENTS_PER_ROOM = 500;
const TURN_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;
const PAGES_ASSET_ORIGIN = 'https://bmpolonsky.github.io/daggerheart-play';
const PAGES_ORIGIN = 'https://bmpolonsky.github.io';
const PAGES_TURN_GRANTS_PER_HOUR = 60;
const PAGES_TURN_GRANTS_PER_DAY = 1_000;
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };
let schemaReady: Promise<void> | null = null;

interface MasterIdentity {
  id: string;
  email: string;
  name: string;
}

interface RoomRow {
  id: string;
  owner_id: string;
  world_id: string;
  gm_peer_id: string;
  gm_name: string;
  active_until: number;
}

interface ParticipantRow {
  id: string;
  token_hash: string;
  last_seen_at: number;
}

interface ActiveParticipantRow {
  id: string;
  display_name: string;
}

interface EventRow {
  sequence: number;
  author_peer_id: string;
  target_peer_id: string | null;
  envelope_json: string;
}

const worker = {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!url.pathname.startsWith('/api/rooms/') || request.method === 'PUT') await ensureSchema(env.DB);
        return await handleApi(request, env, url);
      } catch (error) {
        console.error('Server session request failed.', error);
        return json({ error: 'server_error', message: 'Сервер временно недоступен.' }, 500);
      }
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/image/')) {
      return Response.redirect(`${PAGES_ASSET_ORIGIN}${url.pathname}${url.search}`, 307);
    }
    if (asset.status !== 404 || request.method !== 'GET' || !request.headers.get('accept')?.includes('text/html')) {
      return asset;
    }
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  }
};

export default worker;

async function handleApi(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const db = env.DB;
  if (url.pathname === '/api/turn-credentials') {
    return pagesTurnCredentials(request, env, url);
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const master = masterIdentity(request);
    return json(master ? { authenticated: true, user: master } : { authenticated: false });
  }

  if (url.pathname === '/api/worlds' && request.method === 'GET') {
    const master = requireMaster(request);
    if (master instanceof Response) return master;
    const worlds = await db.prepare(
      'SELECT id, name, snapshot_json AS snapshotJson, created_at AS createdAt, updated_at AS updatedAt FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC'
    ).bind(master.id).all();
    return json({
      worlds: (worlds.results ?? []).map((row) => {
        const world = row as { id: string; name: string; snapshotJson?: string; createdAt: number; updatedAt: number };
        return {
          id: world.id,
          name: world.name,
          createdAt: world.createdAt,
          updatedAt: snapshotUpdatedAt(world.snapshotJson, world.updatedAt)
        };
      })
    });
  }

  const worldAssetMatch = url.pathname.match(/^\/api\/worlds\/([^/]+)\/assets\/([^/]+)$/);
  if (worldAssetMatch) {
    return putWorldAsset(
      request,
      env.FILES,
      decodeURIComponent(worldAssetMatch[1]),
      decodeURIComponent(worldAssetMatch[2])
    );
  }

  const worldBackupMatch = url.pathname.match(/^\/api\/worlds\/([^/]+)\/backup$/);
  if (worldBackupMatch) {
    return worldBackup(request, db, env.FILES, decodeURIComponent(worldBackupMatch[1]));
  }

  const worldMatch = url.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/export)?$/);
  if (worldMatch && request.method === 'DELETE' && !url.pathname.endsWith('/export')) {
    return deleteWorld(request, db, env.FILES, decodeURIComponent(worldMatch[1]));
  }
  if (worldMatch && request.method === 'GET') {
    const master = requireMaster(request);
    if (master instanceof Response) return master;
    const worldId = decodeURIComponent(worldMatch[1]);
    const world = await db.prepare(
      'SELECT name, snapshot_json FROM worlds WHERE owner_id = ? AND id = ?'
    ).bind(master.id, worldId).first<{ name: string; snapshot_json: string }>();
    if (!world) return json({ error: 'world_not_found' }, 404);
    if (url.pathname.endsWith('/export')) {
      return new Response(world.snapshot_json, {
        headers: {
          'content-disposition': `attachment; filename="${safeFileName(world.name || 'daggerheart-world')}.json"`,
          'content-type': 'application/json; charset=utf-8'
        }
      });
    }
    return json({ id: worldId, name: world.name, snapshot: JSON.parse(world.snapshot_json) });
  }

  const roomAssetMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/assets\/([^/]+)$/);
  if (roomAssetMatch) {
    return getRoomAsset(
      request,
      db,
      env.FILES,
      decodeURIComponent(roomAssetMatch[1]),
      decodeURIComponent(roomAssetMatch[2])
    );
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|events|turn-credentials))?$/);
  if (!roomMatch) return json({ error: 'not_found' }, 404);
  const roomId = normalizeServerRoomId(decodeURIComponent(roomMatch[1]));
  if (!roomId) return json({ error: 'invalid_room' }, 400);
  const action = roomMatch[2] ?? '';

  if (!action && request.method === 'PUT') return openMasterRoom(request, db, roomId);
  if (action === 'join' && request.method === 'POST') return joinRoom(request, db, roomId);
  if (action === 'events' && request.method === 'GET') return readEvents(request, db, roomId, url);
  if (action === 'events' && request.method === 'POST') return publishEvent(request, db, roomId);
  if (action === 'turn-credentials' && request.method === 'GET') return turnCredentials(request, env, roomId);
  return json({ error: 'method_not_allowed' }, 405);
}

async function turnCredentials(request: Request, env: WorkerEnv, roomId: string): Promise<Response> {
  const identity = await roomIdentity(request, env.DB, roomId);
  if (identity instanceof Response) return identity;
  return generateTurnCredentials(env, `${roomId}:${identity.role}`);
}

async function pagesTurnCredentials(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const origin = request.headers.get('origin')?.trim() ?? '';
  if (origin !== PAGES_ORIGIN) return pagesTurnResponse({ error: 'origin_not_allowed' }, 403, origin);
  if (request.method === 'OPTIONS') return pagesTurnResponse(null, 204, origin);
  if (request.method !== 'GET') return pagesTurnResponse({ error: 'method_not_allowed' }, 405, origin);

  const clientAddress = request.headers.get('cf-connecting-ip')?.trim();
  if (!clientAddress) return pagesTurnResponse({ error: 'client_unidentified' }, 400, origin);
  const clientHash = await hashToken(clientAddress);
  if (!(await allowPagesTurnGrant(env.DB, clientHash))) {
    return pagesTurnResponse({ error: 'turn_rate_limited' }, 429, origin);
  }
  const roomId = normalizeServerRoomId(url.searchParams.get('room') ?? '') ?? 'UNKNOWN';
  return withPagesTurnCors(await generateTurnCredentials(env, `pages:${roomId}:${clientHash.slice(0, 12)}`), origin);
}

async function generateTurnCredentials(env: WorkerEnv, customIdentifier: string): Promise<Response> {
  const keyId = env.TURN_KEY_ID?.trim();
  const apiToken = env.TURN_KEY_API_TOKEN?.trim();
  if (!keyId || !apiToken) return json({ error: 'turn_not_configured' }, 503);

  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ttl: TURN_CREDENTIAL_TTL_SECONDS,
      customIdentifier
    })
  });
  if (!response.ok) return json({ error: 'turn_unavailable' }, 502);
  const body = await response.json() as { iceServers?: unknown };
  const iceServers = browserIceServers(body.iceServers);
  return iceServers.length > 0 ? json({ iceServers }) : json({ error: 'turn_invalid_response' }, 502);
}

async function allowPagesTurnGrant(db: D1Database, clientHash: string, now = Date.now()): Promise<boolean> {
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const buckets = [
    { id: `ip:${clientHash}`, windowStartedAt: hour, limit: PAGES_TURN_GRANTS_PER_HOUR },
    { id: 'global', windowStartedAt: day, limit: PAGES_TURN_GRANTS_PER_DAY }
  ];
  const rows = await db.batch<{ bucket: string; window_started_at: number; count: number }>(
    buckets.map(({ id }) => db.prepare(
      'SELECT bucket, window_started_at, count FROM turn_credential_grants WHERE bucket = ?'
    ).bind(id))
  );
  if (buckets.some((bucket, index) => {
    const row = rows[index]?.results?.[0];
    return row?.window_started_at === bucket.windowStartedAt && row.count >= bucket.limit;
  })) return false;

  // ponytail: a D1 batch is sufficient at this scale; use a dedicated atomic limiter if concurrent abuse appears.
  await db.batch([...buckets.map((bucket, index) => {
    const row = rows[index]?.results?.[0];
    const count = row?.window_started_at === bucket.windowStartedAt ? row.count + 1 : 1;
    return db.prepare(
      'INSERT INTO turn_credential_grants (bucket, window_started_at, count) VALUES (?, ?, ?) '
      + 'ON CONFLICT(bucket) DO UPDATE SET window_started_at = excluded.window_started_at, count = excluded.count'
    ).bind(bucket.id, bucket.windowStartedAt, count);
  }), db.prepare(
    "DELETE FROM turn_credential_grants WHERE bucket <> 'global' AND window_started_at < ?"
  ).bind(day - 86_400_000)]);
  return true;
}

function pagesTurnResponse(value: unknown, status: number, origin: string): Response {
  return withPagesTurnCors(value === null ? new Response(null, { status }) : json(value, status), origin);
}

function withPagesTurnCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  if (origin === PAGES_ORIGIN) headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  headers.set('cache-control', 'private, no-store');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

async function putWorldAsset(request: Request, files: R2Bucket, worldId: string, assetId: string): Promise<Response> {
  if (request.method !== 'PUT') return json({ error: 'method_not_allowed' }, 405);
  const master = requireMaster(request);
  if (master instanceof Response) return master;
  if (!worldId || !assetId || !request.body) return json({ error: 'asset_required' }, 400);
  const declaredSize = Number(request.headers.get('x-daggerheart-asset-size') ?? request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_ASSET_BYTES) return json({ error: 'asset_too_large' }, 413);
  const key = cloudAssetKey(master.id, worldId, assetId);
  const stored = await files.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' }
  });
  if (typeof stored?.size === 'number' && stored.size > MAX_ASSET_BYTES) {
    await files.delete(key);
    return json({ error: 'asset_too_large' }, 413);
  }
  return new Response(null, { status: 204 });
}

async function getRoomAsset(
  request: Request,
  db: D1Database,
  files: R2Bucket,
  rawRoomId: string,
  assetId: string
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  const roomId = normalizeServerRoomId(rawRoomId);
  if (!roomId || !assetId) return json({ error: 'invalid_asset' }, 400);
  const activeRoom = await activeRoomForPlayer(db, roomId);
  if (activeRoom instanceof Response) return activeRoom;
  const object = await files.get(cloudAssetKey(activeRoom.owner_id, activeRoom.world_id, assetId));
  if (!object) return json({ error: 'asset_not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'cache-control': 'private, no-store',
      'content-length': String(object.size),
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream'
    }
  });
}

async function worldBackup(
  request: Request,
  db: D1Database,
  files: R2Bucket,
  worldId: string
): Promise<Response> {
  const master = requireMaster(request);
  if (master instanceof Response) return master;
  const world = await db.prepare('SELECT id, name FROM worlds WHERE owner_id = ? AND id = ?')
    .bind(master.id, worldId).first<{ id: string; name: string }>();
  if (!world) return json({ error: 'world_not_found' }, 404);
  const key = cloudBackupKey(master.id, worldId);
  if (request.method === 'GET') {
    const object = await files.get(key);
    if (!object) return json({ error: 'backup_not_found' }, 404);
    return new Response(object.body, {
      headers: {
        'cache-control': 'private, no-store',
        'content-length': String(object.size),
        'content-disposition': `attachment; filename="${safeFileName(world.name || 'daggerheart-world')}.dhgame"`,
        'content-type': object.httpMetadata?.contentType || 'application/zip'
      }
    });
  }
  if (request.method === 'PUT') {
    const declaredSize = Number(request.headers.get('x-daggerheart-backup-size') ?? request.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_BACKUP_BYTES) return json({ error: 'backup_too_large' }, 413);
    if (!request.body) return json({ error: 'backup_required' }, 400);
    const stored = await files.put(key, request.body, {
      httpMetadata: { contentType: 'application/zip' }
    });
    if (typeof stored?.size === 'number' && stored.size > MAX_BACKUP_BYTES) {
      await files.delete(key);
      return json({ error: 'backup_too_large' }, 413);
    }
    return new Response(null, { status: 204 });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

async function deleteWorld(
  request: Request,
  db: D1Database,
  files: R2Bucket,
  worldId: string
): Promise<Response> {
  const master = requireMaster(request);
  if (master instanceof Response) return master;
  const world = await db.prepare('SELECT id FROM worlds WHERE owner_id = ? AND id = ?')
    .bind(master.id, worldId).first<{ id: string }>();
  if (!world) return json({ error: 'world_not_found' }, 404);

  await deleteCloudWorldFiles(files, master.id, worldId);
  await db.batch([
    db.prepare('DELETE FROM room_events WHERE room_id IN (SELECT id FROM rooms WHERE owner_id = ? AND world_id = ?)')
      .bind(master.id, worldId),
    db.prepare('DELETE FROM participants WHERE room_id IN (SELECT id FROM rooms WHERE owner_id = ? AND world_id = ?)')
      .bind(master.id, worldId),
    db.prepare('DELETE FROM rooms WHERE owner_id = ? AND world_id = ?').bind(master.id, worldId),
    db.prepare('DELETE FROM worlds WHERE owner_id = ? AND id = ?').bind(master.id, worldId)
  ]);
  return new Response(null, { status: 204 });
}

async function openMasterRoom(request: Request, db: D1Database, roomId: string): Promise<Response> {
  const master = requireMaster(request);
  if (master instanceof Response) return master;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const peerId = stringField(body, 'peerId');
  const worldId = stringField(body, 'worldId');
  const displayName = stringField(body, 'displayName') || master.name;
  const snapshot = body.snapshot;
  if (!peerId || !worldId || !snapshot || typeof snapshot !== 'object') {
    return json({ error: 'invalid_room_payload' }, 400);
  }

  const now = Date.now();
  const existing = await room(db, roomId);
  if (existing && existing.owner_id !== master.id && isMasterLeaseActive(existing.active_until, now)) {
    return json({ error: 'room_in_use', message: 'Этот код комнаты уже используется.' }, 409);
  }
  if (existing && existing.owner_id !== master.id) {
    await db.batch([
      db.prepare('DELETE FROM room_events WHERE room_id = ?').bind(roomId),
      db.prepare('DELETE FROM participants WHERE room_id = ?').bind(roomId),
      db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId)
    ]);
  } else if (existing && (
    !isMasterLeaseActive(existing.active_until, now)
    || existing.world_id !== worldId
    || existing.gm_peer_id !== peerId
  )) {
    await db.batch([
      db.prepare('DELETE FROM room_events WHERE room_id = ?').bind(roomId),
      db.prepare('DELETE FROM participants WHERE room_id = ?').bind(roomId)
    ]);
  }

  const snapshotJson = JSON.stringify(snapshot);
  const worldName = snapshotName(snapshot);
  const [, , cursorResult, playersResult] = await db.batch([
    db.prepare(`INSERT INTO worlds (id, owner_id, name, snapshot_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, id) DO UPDATE SET name = excluded.name, snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`)
      .bind(worldId, master.id, worldName, snapshotJson, now, now),
    db.prepare(`INSERT INTO rooms (id, owner_id, world_id, gm_peer_id, gm_name, active_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, world_id = excluded.world_id,
        gm_peer_id = excluded.gm_peer_id, gm_name = excluded.gm_name,
        active_until = excluded.active_until, updated_at = excluded.updated_at`)
      .bind(roomId, master.id, worldId, peerId, displayName, now + MASTER_LEASE_MS, now, now),
    db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM room_events WHERE room_id = ?').bind(roomId),
    db.prepare('SELECT id, display_name FROM participants WHERE room_id = ? AND last_seen_at > ? AND id <> ?')
      .bind(roomId, now - PARTICIPANT_LEASE_MS, peerId)
  ]);
  const cursor = Number((cursorResult?.results?.[0] as { sequence?: number } | undefined)?.sequence ?? 0);
  const players = (playersResult?.results ?? []) as ActiveParticipantRow[];
  const currentRoom = {
    id: roomId,
    owner_id: master.id,
    world_id: worldId,
    gm_peer_id: peerId,
    gm_name: displayName,
    active_until: now + MASTER_LEASE_MS
  };
  return json({
    roomId,
    cursor,
    peers: activePeerIds(currentRoom, peerId, now, players),
    roster: activeRoster(currentRoom, peerId, now, players)
  });
}

async function joinRoom(request: Request, db: D1Database, roomId: string): Promise<Response> {
  const activeRoom = await activeRoomForPlayer(db, roomId);
  if (activeRoom instanceof Response) return activeRoom;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const peerId = stringField(body, 'peerId');
  const displayName = stringField(body, 'displayName') || 'Игрок';
  if (!peerId) return json({ error: 'invalid_participant' }, 400);

  const now = Date.now();
  const existing = await db.prepare('SELECT id, token_hash, last_seen_at FROM participants WHERE room_id = ? AND id = ?')
    .bind(roomId, peerId).first<ParticipantRow>();
  const presentedToken = bearerToken(request);
  const resumesExisting = Boolean(existing && presentedToken && await tokenMatches(presentedToken, existing.token_hash));
  if (existing && existing.last_seen_at > now - PARTICIPANT_LEASE_MS && !resumesExisting) {
    return json({ error: 'participant_in_use', message: 'Это подключение уже открыто в другой вкладке.' }, 409);
  }
  const token = resumesExisting && presentedToken ? presentedToken : randomToken();
  const tokenHash = await hashToken(token);
  const [, cursorResult, playersResult, snapshotResult] = await db.batch([
    db.prepare(`INSERT INTO participants (id, room_id, token_hash, display_name, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(room_id, id) DO UPDATE SET token_hash = excluded.token_hash,
        display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`)
      .bind(peerId, roomId, tokenHash, displayName, now),
    db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM room_events WHERE room_id = ?').bind(roomId),
    db.prepare('SELECT id, display_name FROM participants WHERE room_id = ? AND last_seen_at > ? AND id <> ?')
      .bind(roomId, now - PARTICIPANT_LEASE_MS, peerId),
    db.prepare('SELECT snapshot_json, updated_at FROM worlds WHERE owner_id = ? AND id = ?')
      .bind(activeRoom.owner_id, activeRoom.world_id)
  ]);
  const snapshot = snapshotResult?.results?.[0] as { snapshot_json?: string; updated_at?: number } | undefined;
  const snapshotUpdatedAt = Number(snapshot?.updated_at ?? now);
  const snapshotEventId = `server-snapshot-${roomId}-${snapshotUpdatedAt}`;
  return json({
    roomId,
    participantToken: token,
    cursor: Number((cursorResult?.results?.[0] as { sequence?: number } | undefined)?.sequence ?? 0),
    peers: activePeerIds(activeRoom, peerId, now, (playersResult?.results ?? []) as ActiveParticipantRow[]),
    roster: activeRoster(activeRoom, peerId, now, (playersResult?.results ?? []) as ActiveParticipantRow[]),
    initialEvent: snapshot?.snapshot_json ? {
      version: 2,
      id: `${snapshotEventId}-envelope`,
      channel: 'data',
      sender: { peerId: activeRoom.gm_peer_id, role: 'gm' },
      sentAt: new Date(snapshotUpdatedAt).toISOString(),
      payload: {
        id: snapshotEventId,
        createdAt: new Date(snapshotUpdatedAt).toISOString(),
        authorId: activeRoom.gm_peer_id,
        kind: 'snapshot',
        value: JSON.parse(snapshot.snapshot_json)
      }
    } satisfies P2PWireEnvelope : undefined
  });
}

async function readEvents(request: Request, db: D1Database, roomId: string, url: URL): Promise<Response> {
  const identity = await roomIdentity(request, db, roomId);
  if (identity instanceof Response) return identity;
  const startedAt = Date.now();
  const waitMs = Math.min(MAX_LONG_POLL_MS, Math.max(0, Number(url.searchParams.get('wait')) || 0));
  const deadline = startedAt + waitMs;
  if (identity.role === 'player' && !isMasterLeaseActive(identity.room.active_until, startedAt)) {
    return json({ error: 'master_offline', message: 'Мастер ещё не запустил эту игру.' }, 409);
  }

  let cursor = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const heartbeat = identity.role === 'gm'
    ? db.prepare('UPDATE rooms SET active_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(startedAt + MASTER_LEASE_MS, startedAt, roomId, identity.ownerId)
    : db.prepare('UPDATE participants SET last_seen_at = ? WHERE room_id = ? AND id = ?')
      .bind(startedAt, roomId, identity.peerId);
  let firstRead = true;
  let players: ActiveParticipantRow[] = [];
  while (true) {
    const now = Date.now();
    const statements = [
      db.prepare(`SELECT sequence, author_peer_id, target_peer_id, envelope_json FROM room_events
        WHERE room_id = ? AND sequence > ?
        ORDER BY sequence ASC LIMIT 100`).bind(roomId, cursor)
    ];
    if (firstRead) {
      statements.unshift(heartbeat);
      statements.push(db.prepare('SELECT id, display_name FROM participants WHERE room_id = ? AND last_seen_at > ? AND id <> ?')
        .bind(roomId, now - PARTICIPANT_LEASE_MS, identity.peerId));
    }
    const results = await db.batch(statements);
    const eventsResult = results[firstRead ? 1 : 0];
    if (firstRead) players = (results[2]?.results ?? []) as ActiveParticipantRow[];
    firstRead = false;
    const scannedEvents = (eventsResult?.results ?? []) as EventRow[];
    const visibleEvents = scannedEvents.filter((event) => event.author_peer_id !== identity.peerId
      && (event.target_peer_id === null || event.target_peer_id === identity.peerId));
    cursor = scannedEvents.reduce((latest, event) => Math.max(latest, event.sequence), cursor);
    if (visibleEvents.length > 0 || waitMs === 0 || Date.now() >= deadline || request.signal.aborted) {
      return json({
        cursor,
        events: visibleEvents.map((event) => ({ sequence: event.sequence, envelope: JSON.parse(event.envelope_json) })),
        peers: activePeerIds(identity.room, identity.peerId, now, players),
        roster: activeRoster(identity.room, identity.peerId, now, players)
      });
    }
    await new Promise((resolve) => setTimeout(resolve, LONG_POLL_INTERVAL_MS));
  }
}

async function publishEvent(request: Request, db: D1Database, roomId: string): Promise<Response> {
  const identity = await roomIdentity(request, db, roomId);
  if (identity instanceof Response) return identity;
  if (identity.role === 'player' && !isMasterLeaseActive(identity.room.active_until, Date.now())) {
    return json({ error: 'master_offline', message: 'Мастер ещё не запустил эту игру.' }, 409);
  }
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const envelope = body.envelope;
  const targetPeer = typeof body.targetPeer === 'string' ? body.targetPeer : null;
  if (!isP2PWireEnvelope(envelope) || envelope.sender.peerId !== identity.peerId || envelope.sender.role !== identity.role) {
    return json({ error: 'invalid_event' }, 400);
  }
  if (identity.role === 'player' && !isPlayerEnvelopeAllowed(envelope)) {
    return json({ error: 'event_forbidden' }, 403);
  }

  const now = Date.now();
  const statements = [
    db.prepare(`INSERT INTO room_events (room_id, event_id, author_peer_id, target_peer_id, envelope_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, event_id) DO NOTHING`)
      .bind(roomId, envelope.id, identity.peerId, targetPeer, JSON.stringify(envelope), now),
    db.prepare(`DELETE FROM room_events
      WHERE room_id = ? AND (
        created_at < ? OR
        sequence <= (SELECT COALESCE(MAX(sequence), 0) - ? FROM room_events WHERE room_id = ?)
      )`).bind(roomId, now - EVENT_RETENTION_MS, MAX_EVENTS_PER_ROOM, roomId)
  ];
  const type = controlType(envelope);
  if (identity.role === 'gm') {
    statements.push(db.prepare('UPDATE rooms SET active_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(type === 'goodbye' ? now : now + MASTER_LEASE_MS, now, roomId, identity.ownerId));
    const event = envelope.channel === 'data' && envelope.payload && typeof envelope.payload === 'object'
      ? envelope.payload as { kind?: unknown; value?: unknown }
      : null;
    if (event?.kind === 'snapshot' && event.value && typeof event.value === 'object') {
      statements.push(db.prepare('UPDATE worlds SET name = ?, snapshot_json = ?, updated_at = ? WHERE owner_id = ? AND id = ?')
        .bind(snapshotName(event.value), JSON.stringify(event.value), now, identity.ownerId, identity.room.world_id));
    }
  } else if (type === 'goodbye') {
    statements.push(db.prepare('DELETE FROM participants WHERE room_id = ? AND id = ?').bind(roomId, identity.peerId));
  } else {
    statements.push(db.prepare('UPDATE participants SET last_seen_at = ? WHERE room_id = ? AND id = ?')
      .bind(now, roomId, identity.peerId));
  }
  await db.batch(statements);
  return json({ accepted: true });
}

async function roomIdentity(request: Request, db: D1Database, roomId: string): Promise<{
  role: 'gm' | 'player';
  peerId: string;
  ownerId: string;
  room: RoomRow;
} | Response> {
  const master = masterIdentity(request);
  const bearer = bearerToken(request);
  const peerId = request.headers.get('x-daggerheart-peer-id')?.trim();
  const statements = [db.prepare('SELECT id, owner_id, world_id, gm_peer_id, gm_name, active_until FROM rooms WHERE id = ?').bind(roomId)];
  if (bearer && peerId) {
    statements.push(db.prepare('SELECT id, token_hash, last_seen_at FROM participants WHERE room_id = ? AND id = ?').bind(roomId, peerId));
  }
  const [roomResult, participantResult] = await db.batch(statements);
  const currentRoom = roomResult?.results?.[0] as RoomRow | undefined;
  if (!currentRoom) return json({ error: 'room_not_found' }, 404);
  if (master && master.id === currentRoom.owner_id) {
    return { role: 'gm', peerId: currentRoom.gm_peer_id, ownerId: currentRoom.owner_id, room: currentRoom };
  }
  if (!bearer || !peerId) return json({ error: 'participant_unauthorized' }, 401);
  const participant = participantResult?.results?.[0] as ParticipantRow | undefined;
  if (!participant || participant.last_seen_at <= Date.now() - PARTICIPANT_LEASE_MS || !(await tokenMatches(bearer, participant.token_hash))) {
    return json({ error: 'participant_unauthorized' }, 401);
  }
  return { role: 'player', peerId, ownerId: currentRoom.owner_id, room: currentRoom };
}

async function activeRoomForPlayer(db: D1Database, roomId: string, now = Date.now()): Promise<RoomRow | Response> {
  const currentRoom = await room(db, roomId);
  if (!currentRoom) {
    return json({ error: 'room_not_found', message: 'Комната не найдена.' }, 404);
  }
  if (!isMasterLeaseActive(currentRoom.active_until, now)) {
    return json({ error: 'master_offline', message: 'Мастер ещё не запустил эту игру.' }, 409);
  }
  return currentRoom;
}

async function room(db: D1Database, roomId: string): Promise<RoomRow | null> {
  return db.prepare('SELECT id, owner_id, world_id, gm_peer_id, gm_name, active_until FROM rooms WHERE id = ?')
    .bind(roomId).first<RoomRow>();
}

function activePeerIds(currentRoom: RoomRow, requesterPeerId: string, now: number, players: ActiveParticipantRow[]): string[] {
  const peers = players.map((player) => player.id);
  if (currentRoom.gm_peer_id !== requesterPeerId && isMasterLeaseActive(currentRoom.active_until, now)) {
    peers.unshift(currentRoom.gm_peer_id);
  }
  return peers;
}

function activeRoster(currentRoom: RoomRow, requesterPeerId: string, now: number, players: ActiveParticipantRow[]): Array<{ peerId: string; displayName: string; role: 'gm' | 'player' }> {
  const roster: Array<{ peerId: string; displayName: string; role: 'gm' | 'player' }> = players.map((player) => ({ peerId: player.id, displayName: player.display_name || 'Игрок', role: 'player' }));
  if (currentRoom.gm_peer_id !== requesterPeerId && isMasterLeaseActive(currentRoom.active_until, now)) {
    roster.unshift({ peerId: currentRoom.gm_peer_id, displayName: currentRoom.gm_name || 'Мастер', role: 'gm' as const });
  }
  return roster;
}

async function ensureSchema(db: D1Database): Promise<void> {
  // ponytail: idempotent runtime setup keeps the first schema version dependency-free; add migrations when the schema starts evolving.
  schemaReady ??= db.batch(schemaStatements.map((statement) => db.prepare(statement))).then(async () => {
    await db.prepare('PRAGMA optimize').run();
  });
  await schemaReady;
}

function masterIdentity(request: Request): MasterIdentity | null {
  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  const email = request.headers.get('oai-authenticated-user-email')?.trim();
  if (!id || !email) return null;
  return {
    id,
    email,
    name: decodedFullName(request) ?? email
  };
}

function requireMaster(request: Request): MasterIdentity | Response {
  return masterIdentity(request) ?? json({ error: 'master_sign_in_required', signInPath: '/signin-with-chatgpt?return_to=/' }, 401);
}

function decodedFullName(request: Request): string | null {
  if (request.headers.get('oai-authenticated-user-full-name-encoding') !== 'percent-encoded-utf-8') return null;
  const encoded = request.headers.get('oai-authenticated-user-full-name');
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
  try {
    const source = await request.text();
    if (new TextEncoder().encode(source).byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
    const body = JSON.parse(source) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : json({ error: 'invalid_json' }, 400);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
}

function snapshotName(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return 'Без названия';
  const value = snapshot as { game?: unknown; manifest?: unknown; files?: Record<string, unknown> };
  const manifestName = value.manifest && typeof value.manifest === 'object'
    ? (value.manifest as { name?: unknown }).name
    : null;
  if (typeof manifestName === 'string' && manifestName.trim()) return manifestName.trim();
  const game = value.game ?? value.files?.['data/game.json'];
  if (!game || typeof game !== 'object') return 'Без названия';
  const name = (game as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Без названия';
}

function snapshotUpdatedAt(snapshotJson: string | undefined, fallback: number): number {
  if (!snapshotJson) return fallback;
  try {
    const snapshot = JSON.parse(snapshotJson) as {
      game?: { updatedAt?: unknown };
      manifest?: { updatedAt?: unknown };
      files?: Record<string, unknown>;
    };
    const game = snapshot.game ?? snapshot.files?.['data/game.json'];
    const value = snapshot.manifest?.updatedAt ?? (game && typeof game === 'object'
      ? (game as { updatedAt?: unknown }).updatedAt
      : null);
    if (typeof value !== 'string') return fallback;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : fallback;
  } catch {
    return fallback;
  }
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function controlType(envelope: P2PWireEnvelope): string | null {
  const payload = envelope.channel === 'control' ? envelope.payload : null;
  return payload && typeof payload === 'object' && typeof (payload as { type?: unknown }).type === 'string'
    ? (payload as { type: string }).type
    : null;
}

function bearerToken(request: Request): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function browserIceServers(value: unknown): Array<{ urls: string[]; username?: string; credential?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const source = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(source.urls) ? source.urls : [source.urls])
      .filter((url): url is string => typeof url === 'string' && !/:53(?:\?|$)/.test(url));
    if (urls.length === 0) return [];
    return [{
      urls,
      ...(typeof source.username === 'string' ? { username: source.username } : {}),
      ...(typeof source.credential === 'string' ? { credential: source.credential } : {})
    }];
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return toHex(bytes);
}

async function hashToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

async function tokenMatches(token: string, expectedHash: string): Promise<boolean> {
  const actual = await hashToken(token);
  if (actual.length !== expectedHash.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return mismatch === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'daggerheart-world';
}

function cloudBackupKey(ownerId: string, worldId: string): string {
  return `${cloudWorldPrefix(ownerId, worldId)}backup.dhgame`;
}

function cloudAssetKey(ownerId: string, worldId: string, assetId: string): string {
  return `${cloudWorldPrefix(ownerId, worldId)}assets/${encodeURIComponent(assetId)}`;
}

function cloudWorldPrefix(ownerId: string, worldId: string): string {
  return `${[ownerId, worldId].map(encodeURIComponent).join('/')}/`;
}

async function deleteCloudWorldFiles(files: R2Bucket, ownerId: string, worldId: string): Promise<void> {
  const prefix = cloudWorldPrefix(ownerId, worldId);
  let cursor: string | undefined;
  do {
    const page = await files.list({ prefix, ...(cursor ? { cursor } : {}) });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) await files.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}
