import { schemaStatements } from '../db/schema';
import { isMasterLeaseActive, isPlayerEnvelopeAllowed, normalizeServerRoomId } from '../src/domain/p2p/serverSession';
import { isP2PWireEnvelope, type P2PWireEnvelope } from '../src/services/p2p/P2PTransportAdapter';
import type { D1Database, ExecutionContext, WorkerEnv } from './cloudflare';

const MASTER_LEASE_MS = 20_000;
const PARTICIPANT_LEASE_MS = 30_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
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
        await ensureSchema(env.DB);
        return await handleApi(request, env.DB, url);
      } catch (error) {
        console.error('Server session request failed.', error);
        return json({ error: 'server_error', message: 'Сервер временно недоступен.' }, 500);
      }
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || request.method !== 'GET' || !request.headers.get('accept')?.includes('text/html')) {
      return asset;
    }
    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  }
};

export default worker;

async function handleApi(request: Request, db: D1Database, url: URL): Promise<Response> {
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const master = masterIdentity(request);
    return json(master ? { authenticated: true, user: master } : { authenticated: false });
  }

  if (url.pathname === '/api/worlds' && request.method === 'GET') {
    const master = requireMaster(request);
    if (master instanceof Response) return master;
    const worlds = await db.prepare(
      'SELECT id, name, created_at AS createdAt, updated_at AS updatedAt FROM worlds WHERE owner_id = ? ORDER BY updated_at DESC'
    ).bind(master.id).all();
    return json({ worlds: worlds.results ?? [] });
  }

  const worldMatch = url.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/export)?$/);
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

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|events))?$/);
  if (!roomMatch) return json({ error: 'not_found' }, 404);
  const roomId = normalizeServerRoomId(decodeURIComponent(roomMatch[1]));
  if (!roomId) return json({ error: 'invalid_room' }, 400);
  const action = roomMatch[2] ?? '';

  if (!action && request.method === 'PUT') return openMasterRoom(request, db, roomId);
  if (action === 'join' && request.method === 'POST') return joinRoom(request, db, roomId);
  if (action === 'events' && request.method === 'GET') return readEvents(request, db, roomId, url);
  if (action === 'events' && request.method === 'POST') return publishEvent(request, db, roomId);
  return json({ error: 'method_not_allowed' }, 405);
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
  }

  const snapshotJson = JSON.stringify(snapshot);
  const worldName = snapshotName(snapshot);
  await db.batch([
    db.prepare(`INSERT INTO worlds (id, owner_id, name, snapshot_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, id) DO UPDATE SET name = excluded.name, snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`)
      .bind(worldId, master.id, worldName, snapshotJson, now, now),
    db.prepare(`INSERT INTO rooms (id, owner_id, world_id, gm_peer_id, gm_name, active_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET owner_id = excluded.owner_id, world_id = excluded.world_id,
        gm_peer_id = excluded.gm_peer_id, gm_name = excluded.gm_name,
        active_until = excluded.active_until, updated_at = excluded.updated_at`)
      .bind(roomId, master.id, worldId, peerId, displayName, now + MASTER_LEASE_MS, now, now)
  ]);
  const cursor = await latestSequence(db, roomId);
  return json({ roomId, cursor, peers: await activePeers(db, roomId, peerId, now) });
}

async function joinRoom(request: Request, db: D1Database, roomId: string): Promise<Response> {
  const activeRoom = await activeRoomForPlayer(db, roomId);
  if (activeRoom instanceof Response) return activeRoom;
  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const peerId = stringField(body, 'peerId');
  const displayName = stringField(body, 'displayName') || 'Игрок';
  if (!peerId) return json({ error: 'invalid_participant' }, 400);

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  await db.prepare(`INSERT INTO participants (id, room_id, token_hash, display_name, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(room_id, id) DO UPDATE SET token_hash = excluded.token_hash,
      display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`)
    .bind(peerId, roomId, tokenHash, displayName, now).run();
  return json({
    roomId,
    participantToken: token,
    cursor: await latestSequence(db, roomId),
    peers: await activePeers(db, roomId, peerId, now)
  });
}

async function readEvents(request: Request, db: D1Database, roomId: string, url: URL): Promise<Response> {
  const identity = await roomIdentity(request, db, roomId);
  if (identity instanceof Response) return identity;
  const now = Date.now();
  if (identity.role === 'gm') {
    await db.prepare('UPDATE rooms SET active_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(now + MASTER_LEASE_MS, now, roomId, identity.ownerId).run();
  } else {
    const activeRoom = await activeRoomForPlayer(db, roomId, now);
    if (activeRoom instanceof Response) return activeRoom;
    await db.prepare('UPDATE participants SET last_seen_at = ? WHERE room_id = ? AND id = ?')
      .bind(now, roomId, identity.peerId).run();
  }

  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const events = await db.prepare(`SELECT sequence, author_peer_id, target_peer_id, envelope_json FROM room_events
    WHERE room_id = ? AND sequence > ?
    ORDER BY sequence ASC LIMIT 100`)
    .bind(roomId, after).all<EventRow>();
  const scannedEvents = events.results ?? [];
  const visibleEvents = scannedEvents.filter((event) => event.author_peer_id !== identity.peerId
    && (event.target_peer_id === null || event.target_peer_id === identity.peerId));
  return json({
    cursor: scannedEvents.reduce((cursor, event) => Math.max(cursor, event.sequence), after),
    events: visibleEvents.map((event) => ({ sequence: event.sequence, envelope: JSON.parse(event.envelope_json) })),
    peers: await activePeers(db, roomId, identity.peerId, now)
  });
}

async function publishEvent(request: Request, db: D1Database, roomId: string): Promise<Response> {
  const identity = await roomIdentity(request, db, roomId);
  if (identity instanceof Response) return identity;
  if (identity.role === 'player') {
    const activeRoom = await activeRoomForPlayer(db, roomId);
    if (activeRoom instanceof Response) return activeRoom;
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
  if (identity.role === 'gm') {
    await db.prepare('UPDATE rooms SET active_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(now + MASTER_LEASE_MS, now, roomId, identity.ownerId).run();
  } else {
    await db.prepare('UPDATE participants SET last_seen_at = ? WHERE room_id = ? AND id = ?')
      .bind(now, roomId, identity.peerId).run();
  }
  await db.prepare(`INSERT INTO room_events (room_id, event_id, author_peer_id, target_peer_id, envelope_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, event_id) DO NOTHING`)
    .bind(roomId, envelope.id, identity.peerId, targetPeer, JSON.stringify(envelope), now).run();
  if (identity.role === 'gm') {
    await saveSnapshotFromEnvelope(db, roomId, identity.ownerId, envelope, now);
  }
  if (controlType(envelope) === 'goodbye') {
    if (identity.role === 'gm') {
      await db.prepare('UPDATE rooms SET active_until = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
        .bind(now, now, roomId, identity.ownerId).run();
    } else {
      await db.prepare('DELETE FROM participants WHERE room_id = ? AND id = ?').bind(roomId, identity.peerId).run();
    }
  }
  return json({ sequence: await eventSequence(db, roomId, envelope.id) });
}

async function roomIdentity(request: Request, db: D1Database, roomId: string): Promise<{
  role: 'gm' | 'player';
  peerId: string;
  ownerId: string;
} | Response> {
  const currentRoom = await room(db, roomId);
  if (!currentRoom) return json({ error: 'room_not_found' }, 404);
  const master = masterIdentity(request);
  if (master && master.id === currentRoom.owner_id) {
    return { role: 'gm', peerId: currentRoom.gm_peer_id, ownerId: currentRoom.owner_id };
  }
  const bearer = bearerToken(request);
  const peerId = request.headers.get('x-daggerheart-peer-id')?.trim();
  if (!bearer || !peerId) return json({ error: 'participant_unauthorized' }, 401);
  const participant = await db.prepare(
    'SELECT id, token_hash FROM participants WHERE room_id = ? AND id = ?'
  ).bind(roomId, peerId).first<ParticipantRow>();
  if (!participant || !(await tokenMatches(bearer, participant.token_hash))) {
    return json({ error: 'participant_unauthorized' }, 401);
  }
  return { role: 'player', peerId, ownerId: currentRoom.owner_id };
}

async function activeRoomForPlayer(db: D1Database, roomId: string, now = Date.now()): Promise<RoomRow | Response> {
  const currentRoom = await room(db, roomId);
  if (!currentRoom || !isMasterLeaseActive(currentRoom.active_until, now)) {
    return json({ error: 'master_offline', message: 'Мастер ещё не запустил эту игру.' }, 409);
  }
  return currentRoom;
}

async function room(db: D1Database, roomId: string): Promise<RoomRow | null> {
  return db.prepare('SELECT id, owner_id, world_id, gm_peer_id, gm_name, active_until FROM rooms WHERE id = ?')
    .bind(roomId).first<RoomRow>();
}

async function activePeers(db: D1Database, roomId: string, requesterPeerId: string, now: number): Promise<string[]> {
  const currentRoom = await room(db, roomId);
  if (!currentRoom) return [];
  const players = await db.prepare(
    'SELECT id FROM participants WHERE room_id = ? AND last_seen_at > ? AND id <> ?'
  ).bind(roomId, now - PARTICIPANT_LEASE_MS, requesterPeerId).all<{ id: string }>();
  const peers = (players.results ?? []).map((player) => player.id);
  if (currentRoom.gm_peer_id !== requesterPeerId && isMasterLeaseActive(currentRoom.active_until, now)) {
    peers.unshift(currentRoom.gm_peer_id);
  }
  return peers;
}

async function saveSnapshotFromEnvelope(db: D1Database, roomId: string, ownerId: string, envelope: P2PWireEnvelope, now: number): Promise<void> {
  const event = envelope.channel === 'data' && envelope.payload && typeof envelope.payload === 'object'
    ? envelope.payload as { kind?: unknown; value?: unknown }
    : null;
  if (event?.kind !== 'snapshot' || !event.value || typeof event.value !== 'object') return;
  const currentRoom = await room(db, roomId);
  if (!currentRoom) return;
  await db.prepare('UPDATE worlds SET name = ?, snapshot_json = ?, updated_at = ? WHERE owner_id = ? AND id = ?')
    .bind(snapshotName(event.value), JSON.stringify(event.value), now, ownerId, currentRoom.world_id).run();
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
  const game = (snapshot as { game?: unknown }).game;
  if (!game || typeof game !== 'object') return 'Без названия';
  const name = (game as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Без названия';
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

async function latestSequence(db: D1Database, roomId: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM room_events WHERE room_id = ?')
    .bind(roomId).first<{ sequence: number }>();
  return Number(row?.sequence ?? 0);
}

async function eventSequence(db: D1Database, roomId: string, eventId: string): Promise<number> {
  const row = await db.prepare('SELECT sequence FROM room_events WHERE room_id = ? AND event_id = ?')
    .bind(roomId, eventId).first<{ sequence: number }>();
  return Number(row?.sequence ?? 0);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'daggerheart-world';
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: jsonHeaders });
}
