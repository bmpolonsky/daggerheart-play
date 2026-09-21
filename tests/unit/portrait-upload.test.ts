import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { AssetService } from '../../src/services/AssetService';
import { PortraitUploadService } from '../../src/services/PortraitUploadService';
import { assetIdFromReference } from '../../src/domain/game/assetReferences';
import { isPortraitUploadMessage, type PortraitUploadMessage } from '../../src/domain/p2p/portraitUpload';
import { resetAllStores, sceneTableStore } from '../../src/stores/gameStores';
import type { AssetMessage, SyncService } from '../../src/services/SyncService';
import type { SupabaseAssetService } from '../../src/services/SupabaseAssetService';
import type { P2PRoomConnection } from '../../src/services/p2p/P2PRoomConnection';
import type { MapAsset, SyncEventContext } from '../../src/domain/tabletop/types';

beforeEach(() => { resetAllStores(); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const file = () => new File(['portrait bytes'], 'portrait.webp', { type: 'image/webp' });
const metadata = (): MapAsset => ({ id: 'asset_portrait', name: 'portrait.webp', mimeType: 'image/webp', storage: 'indexeddb', byteSize: file().size, createdAt: '2026-09-20' });
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

function harness(role: 'gm' | 'player', mode = 'p2p', cloud?: SupabaseAssetService, authorized = true) {
  const blobs = new Map<string, Blob>();
  const assets = new AssetService({ get: async id => blobs.get(id) ?? null, put: async (id, blob) => { blobs.set(id, blob); }, delete: async id => { blobs.delete(id); } });
  const messages: Array<{ message: AssetMessage; peer: unknown }> = [];
  let receive = (_message: AssetMessage, _event: never, _context: SyncEventContext) => {};
  let binary = (_data: ArrayBuffer, _peer: string, _metadata?: unknown) => {};
  const sync = {
    publishAssetMessage: vi.fn(async (message: AssetMessage, peer: unknown) => { messages.push({ message, peer }); return true; }),
    subscribeAssetMessages: (listener: typeof receive) => { receive = listener; return () => {}; }
  };
  const connection = {
    gmPeerId: () => 'gm',
    sendBinary: vi.fn(async () => {}),
    subscribeBinary: (listener: typeof binary) => { binary = listener; return () => {}; }
  };
  const session = { role, connected: true, transportMode: mode, roomId: 'ROOM' };
  const authorize = vi.fn(() => authorized);
  const service = new PortraitUploadService(assets, sync as unknown as SyncService, () => connection as unknown as P2PRoomConnection, () => session, authorize, cloud);
  service.subscribe(connection as unknown as P2PRoomConnection);
  return { assets, blobs, messages, service, sync, connection, session, authorize,
    receive: async (message: PortraitUploadMessage, peer = role === 'player' ? 'gm' : 'player') => { receive(message, undefined as never, { sourcePeerId: peer, verifiedSourcePeerId: peer }); await flush(); },
    binary: async (data: ArrayBuffer, peer: string, requestId: string) => { binary(data, peer, { type: 'portrait', requestId }); await flush(); }
  };
}

test('new local portraits are separate blobs and failed storage never produces a reference', async () => {
  const h = harness('gm');
  h.session.connected = false;
  const reference = await h.service.save(file());
  const id = assetIdFromReference(reference)!;
  assert.equal(await h.blobs.get(id)?.text(), 'portrait bytes');
  assert.equal(sceneTableStore.get().assets[id].storage, 'indexeddb');
  assert.ok(reference.length < 80);
  assert.deepEqual(h.messages, []);
  const unavailable = new PortraitUploadService(new AssetService(null), h.sync as never, () => null, () => h.session, () => true);
  await assert.rejects(unavailable.save(file()), /Хранилище файлов недоступно/);
  h.service.clear();
});

test('player P2P upload waits for the GM acknowledgement and retains metadata across snapshots', async () => {
  const h = harness('player');
  const promise = h.service.save(file(), { actorId: 'hero', participantId: 'seat' });
  await flush();
  const offer = h.messages[0].message;
  assert.equal(offer.type, 'portrait-offer');
  if (offer.type !== 'portrait-offer') throw new Error('No offer');
  let done = false;
  void promise.then(() => { done = true; });
  sceneTableStore.update(state => ({ ...state, assets: {} }));
  await h.receive({ type: 'portrait-ready', requestId: offer.requestId });
  assert.equal(h.connection.sendBinary.mock.calls.length, 1);
  assert.equal(done, false);
  await h.receive({ type: 'portrait-result', requestId: offer.requestId, ok: true }, 'impostor');
  assert.equal(done, false);
  await h.receive({ type: 'portrait-result', requestId: offer.requestId, ok: true });
  assert.equal(await promise, `asset:${offer.asset.id}`);
  assert.ok(sceneTableStore.get().assets[offer.asset.id]);
  h.service.clear();
});

test('cloud player uploads using a signed ticket without a direct peer connection', async () => {
  const uploadWithTicket = vi.fn(async () => {});
  const h = harness('player', 'hybrid', { uploadWithTicket } as unknown as SupabaseAssetService);
  const promise = h.service.save(file(), { actorId: 'hero', participantId: 'seat' });
  await flush();
  const requestId = h.messages[0].message.requestId;
  await h.receive({ type: 'portrait-ready', requestId, ticket: { path: 'owner/game/assets/id', token: 'ticket' } });
  assert.equal(uploadWithTicket.mock.calls.length, 1);
  assert.equal(h.connection.sendBinary.mock.calls.length, 0);
  assert.equal(h.messages.at(-1)?.message.type, 'portrait-complete');
  await h.receive({ type: 'portrait-result', requestId, ok: true });
  assert.match(await promise, /^asset:/);
  h.service.clear();
});

test.each(['p2p', 'hybrid'])('GM persists an authorized %s portrait before acknowledging it', async mode => {
  const cloud = { createUploadTicket: vi.fn(async () => ({ path: 'owner/game/assets/asset_portrait', token: 'ticket' })), download: vi.fn(async () => file()) };
  const h = harness('gm', mode, cloud as unknown as SupabaseAssetService);
  await h.receive({ type: 'portrait-offer', requestId: 'request', actorId: 'hero', participantId: 'seat', asset: metadata() });
  assert.equal(h.authorize.mock.calls.length, 1);
  assert.equal(h.messages.at(-1)?.message.type, 'portrait-ready');
  assert.equal(h.blobs.size, 0);
  if (mode === 'p2p') {
    await h.binary(await file().arrayBuffer(), 'other-player', 'request');
    assert.equal(h.blobs.size, 0);
    await h.binary(await file().arrayBuffer(), 'player', 'request');
  } else {
    await h.receive({ type: 'portrait-complete', requestId: 'request' }, 'other-player');
    assert.equal(cloud.download.mock.calls.length, 0);
    await h.receive({ type: 'portrait-complete', requestId: 'request' });
  }
  assert.equal(await h.blobs.get('asset_portrait')?.text(), 'portrait bytes');
  assert.ok(sceneTableStore.get().assets.asset_portrait);
  assert.deepEqual(h.messages.at(-1)?.message, { type: 'portrait-result', requestId: 'request', ok: true });
  h.service.clear();
});

test('GM rejects unauthorized offers, existing asset replacement and mismatched bytes', async () => {
  const denied = harness('gm', 'p2p', undefined, false);
  const offer = { type: 'portrait-offer', requestId: 'request', actorId: 'hero', participantId: 'seat', asset: metadata() } as const;
  await denied.receive(offer);
  assert.deepEqual(denied.messages.at(-1)?.message, { type: 'portrait-result', requestId: 'request', ok: false });
  denied.service.clear();
  const h = harness('gm');
  sceneTableStore.update(state => ({ ...state, assets: { asset_portrait: metadata() } }));
  await h.receive(offer);
  assert.deepEqual(h.messages.at(-1)?.message, { type: 'portrait-result', requestId: 'request', ok: false });
  sceneTableStore.update(state => ({ ...state, assets: {} }));
  await h.receive(offer);
  await h.binary(new ArrayBuffer(1), 'player', 'request');
  assert.equal(h.blobs.size, 0);
  assert.deepEqual(h.messages.at(-1)?.message, { type: 'portrait-result', requestId: 'request', ok: false });
  assert.equal(isPortraitUploadMessage({ ...offer, asset: { ...metadata(), id: '../existing' } }), false);
  assert.equal(isPortraitUploadMessage({ ...offer, asset: { ...metadata(), byteSize: 100 * 1024 * 1024 } }), false);
  h.service.clear();
});

test('upload failure or disconnect leaves the caller without a replacement portrait', async () => {
  const h = harness('player', 'hybrid', { uploadWithTicket: async () => { throw new Error('Network'); } } as unknown as SupabaseAssetService);
  const failed = assert.rejects(h.service.save(file(), { actorId: 'hero', participantId: 'seat' }), /Прежнее изображение сохранено/);
  await flush();
  await h.receive({ type: 'portrait-ready', requestId: h.messages[0].message.requestId, ticket: { path: 'path', token: 'token' } });
  await failed;
  const stopped = assert.rejects(h.service.save(file(), { actorId: 'hero', participantId: 'seat' }), /Прежнее изображение сохранено/);
  await flush();
  h.service.clear();
  await stopped;
});

test('cloud download completing after session teardown cannot attach an asset to the next game', async () => {
  let finish: (blob: Blob) => void = () => {};
  const cloud = { createUploadTicket: async () => ({ path: 'path', token: 'token' }), download: () => new Promise<Blob>(resolve => { finish = resolve; }) };
  const h = harness('gm', 'hybrid', cloud as unknown as SupabaseAssetService);
  await h.receive({ type: 'portrait-offer', requestId: 'request', actorId: 'hero', participantId: 'seat', asset: metadata() });
  await h.receive({ type: 'portrait-complete', requestId: 'request' });
  h.service.clear();
  finish(file());
  await flush();
  assert.equal(h.blobs.size, 0);
  assert.equal(sceneTableStore.get().assets.asset_portrait, undefined);
  assert.equal(h.messages.some(({ message }) => message.type === 'portrait-result' && message.ok), false);
});

test('GM cloud failure or game change during upload cannot publish an unusable reference', async () => {
  let finish: () => void = () => {};
  const cloud = { upload: () => new Promise<void>(resolve => { finish = resolve; }) };
  const h = harness('gm', 'hybrid', cloud as unknown as SupabaseAssetService);
  const pending = assert.rejects(h.service.save(file()), /Загрузка портрета прервана/);
  await flush();
  assert.equal(Object.keys(sceneTableStore.get().assets).length, 0);
  h.service.clear();
  finish();
  await pending;
  assert.equal(Object.keys(sceneTableStore.get().assets).length, 0);
  const failed = harness('gm', 'hybrid', { upload: async () => { throw new Error('Storage unavailable'); } } as unknown as SupabaseAssetService);
  await assert.rejects(failed.service.save(file()), /Storage unavailable/);
  assert.equal(Object.keys(sceneTableStore.get().assets).length, 0);
  failed.service.clear();
});


test('a connected player can upload for a new character draft but cannot use another bound seat', async () => {
  const restore = installTimerWindow();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }));
  const internals = session as unknown as {
    activeRoomConnection: P2PRoomConnection;
    authorizePortraitUpload(participant: string, actor: string, context: SyncEventContext): boolean;
  };
  internals.activeRoomConnection = { peers: () => ['player'] } as unknown as P2PRoomConnection;
  const seat = createLocalParticipant({ id: 'seat', role: 'player', actorIds: [], peerId: 'player' });
  sceneTableStore.update(state => ({ ...state, participants: { seat } }));
  try {
    assert.equal(internals.authorizePortraitUpload('seat', '', { sourcePeerId: 'player' }), true);
    assert.equal(internals.authorizePortraitUpload('seat', '', { sourcePeerId: 'stranger' }), false);
    assert.equal(internals.authorizePortraitUpload('seat', 'someone-elses-character', { sourcePeerId: 'player' }), false);
    sceneTableStore.update(state => ({ ...state, participants: { seat: { ...seat, peerId: 'other-player' } } }));
    assert.equal(internals.authorizePortraitUpload('seat', '', { sourcePeerId: 'player' }), false);
  } finally { restore(); }
  const h = harness('player');
  const pending = h.service.save(file(), { actorId: '', participantId: 'seat' });
  await flush();
  const offer = h.messages[0].message;
  assert.equal(offer.type, 'portrait-offer');
  assert.ok(offer.type === 'portrait-offer' && offer.actorId === '');
  await h.receive({ type: 'portrait-ready', requestId: offer.requestId });
  await h.receive({ type: 'portrait-result', requestId: offer.requestId, ok: true });
  assert.match(await pending, /^asset:/);
  h.service.clear();
});
