import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { patchOfferPool, patchStrategy, patchTorrent } from '../../scripts/patch-trystero.mjs';

const require = createRequire(import.meta.url);
const coreRoot = dirname(require.resolve('@trystero-p2p/core/package.json'));
const torrentPath = require.resolve('@trystero-p2p/torrent');
const { OfferPool } = await import(pathToFileURL(resolve(coreRoot, 'dist/offer-pool.mjs')).href);

function fakePeer() {
  return {
    isDead: false,
    destroy() { this.isDead = true; },
    connection: {},
    getOffer: async () => ({ type: 'offer', sdp: 'test' }),
    setHandlers() {}
  };
}

test('warmup closes every allocated connection if a later constructor fails', () => {
  const peers = [];
  const failure = new Error("Failed to construct 'RTCPeerConnection': Cannot create so many PeerConnections");
  const pool = new OfferPool(() => {
    if (peers.length === 3) throw failure;
    const peer = fakePeer(); peers.push(peer); return peer;
  });
  assert.throws(() => pool.warmup(), error => error === failure);
  assert.equal(peers.length, 3);
  assert.ok(peers.every(peer => peer.isDead));
  assert.equal(pool.isActive, false);
  pool.destroy();
});

test('checkout closes shifted and newly allocated connections when allocation fails', () => {
  const existing = fakePeer();
  const created = [];
  const failure = new Error('RTC allocation failed');
  const pool = new OfferPool(() => {
    if (created.length === 1) throw failure;
    const peer = fakePeer(); created.push(peer); return peer;
  });
  pool.push(existing);
  assert.throws(() => pool.getOffers(3, async () => 'offer'), error => error === failure);
  assert.ok(existing.isDead);
  assert.ok(created.every(peer => peer.isDead));
  pool.destroy();
});

test('successful offer checkout still leases and releases real pool entries', async () => {
  const peers = [];
  const pool = new OfferPool(() => { const peer = fakePeer(); peers.push(peer); return peer; });
  pool.warmup();
  try {
    const offers = await pool.getOffers(3, async () => 'encrypted');
    assert.equal(peers.length, 20);
    assert.equal(offers.length, 3);
    assert.ok(offers.every(offer => offer.offer === 'encrypted' && !offer.peer.isDead));
  } finally { pool.destroy(); }
  assert.ok(peers.every(peer => peer.isDead));
});

test('destroy closes in-flight offers and late completion cannot lease or retry them', async () => {
  const peers = [];
  let finish;
  const encrypted = new Promise(resolve => { finish = resolve; });
  const pool = new OfferPool(() => { const peer = fakePeer(); peers.push(peer); return peer; });
  pool.warmup();
  const checkout = pool.getOffers(3, () => encrypted);
  const rejected = assert.rejects(checkout, /checkout cancelled/);
  pool.destroy();
  assert.ok(peers.every(peer => peer.isDead));
  finish('late-offer');
  await rejected;
  assert.equal(peers.length, 20);
  assert.equal(pool.leased.size, 0);
  assert.equal(pool.pending.size, 0);
});

test('failed batched checkout releases successes and cancels still-pending candidates', async () => {
  const peers = [];
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const pool = new OfferPool(() => { const peer = fakePeer(); peers.push(peer); return peer; });
  pool.warmup();
  const checkout = pool.getOffers(3, candidate => {
    if (candidate === peers[0]) return Promise.resolve('success');
    if (candidate === peers[2]) return pending;
    return Promise.reject(new Error('cannot create offer'));
  });
  await assert.rejects(checkout, /cannot create offer/);
  assert.ok(peers.slice(0, 3).every(peer => peer.isDead));
  assert.equal(pool.leased.size, 0);
  finish('late-success');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pool.pending.size, 0);
  assert.equal(pool.leased.size, 0);
  assert.equal(peers.length, 21); // Only the original failing offer received one retry.
  pool.destroy();
  assert.ok(peers.every(peer => peer.isDead));
});

test('pool destruction does not close a claimed connection owned by a live peer', async () => {
  const pool = new OfferPool(fakePeer);
  pool.warmup();
  const [offer] = await pool.getOffers(1, async () => 'offer');
  offer.claim();
  pool.destroy();
  assert.equal(offer.peer.isDead, false);
  offer.peer.destroy();
});

test('patches are idempotent and reject an unexpected upstream source', async () => {
  for (const [path, patch] of [
    [resolve(coreRoot, 'dist/offer-pool.mjs'), patchOfferPool],
    [resolve(coreRoot, 'dist/strategy.mjs'), patchStrategy],
    [torrentPath, patchTorrent]
  ]) {
    const source = await readFile(path, 'utf8');
    assert.ok(source.startsWith('// daggerheart-play: Trystero allocation/retry guard v1'));
    assert.equal(patch(source), source);
    assert.throws(() => patch('unexpected upstream source'), /source mismatch/);
  }
});

// Execute the installed torrent module with only its external relay primitives
// replaced. Its real subscribe/announce/timer code remains under test.
async function torrentStrategy() {
  const source = await readFile(torrentPath, 'utf8');
  const stubCore = `
const createRelayManager = () => ({
  scoped: () => { const maps = new Map(); const get = key => { if (!maps.has(key)) maps.set(key, {}); return maps.get(key); }; return { forRelay: client => get(client.url), forKey: get }; },
  getSockets: () => []
});
const createStrategy = strategy => strategy;
const { entries, keys } = Object;
const fromJson = JSON.parse, toJson = JSON.stringify;
let nextId = 0;
const genId = () => String(++nextId);
const sha1 = async text => text;
const selfId = 'local-test-peer', libName = 'Trystero';
const getRelays = () => [], makeSocket = () => {}, pauseRelayReconnection = () => {}, resumeRelayReconnection = () => {};
`;
  const isolated = source.replace(/^import .* from "@trystero-p2p\/core";$/m, stubCore)
    + '\nexport { joinRoomStrategy as strategy };';
  return (await import(`data:text/javascript;base64,${Buffer.from(isolated).toString('base64')}`)).strategy;
}

test('torrent announce handles allocation failure, backs off, reports and recovers', async t => {
  const strategy = await torrentStrategy();
  const timers = new Set();
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', callback => { timers.add(callback); return callback; });
  t.mock.method(globalThis, 'clearInterval', callback => timers.delete(callback));
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  const errors = [];
  let attempts = 0, fail = true, sends = 0;
  const client = { url: 'test-tracker', send: async () => { sends++; } };
  const context = { appId: 'test', roomId: 'test-room', config: {}, onJoinError: error => errors.push(error) };
  const unsubscribe = strategy.subscribe(client, 'test-room-topic', '', () => {}, async () => {
    attempts++;
    if (fail) throw new Error("Failed to construct 'RTCPeerConnection': Cannot create so many PeerConnections");
    return [{ offer: 'test-sdp' }];
  }, context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const tick = async milliseconds => { now = milliseconds; await Promise.all([...timers].map(callback => callback())); await flush(); };
  try {
    await flush();
    assert.equal(attempts, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0].error, /torrent_announce_failed:.*RTCPeerConnection/);
    await tick(19_999); assert.equal(attempts, 1);
    await tick(20_000); assert.equal(attempts, 2);
    await tick(40_000); assert.equal(attempts, 2);
    await tick(60_000); assert.equal(attempts, 3);
    await tick(140_000); assert.equal(attempts, 4);
    await tick(300_000); assert.equal(attempts, 5);
    await tick(599_999); assert.equal(attempts, 5);
    fail = false;
    await tick(600_000); assert.equal(attempts, 6);
    assert.equal(sends, 1);
    assert.equal(errors.length, 1);
    assert.equal(warnings.length, 5);
    assert.match(warnings.at(-1), /attempt 5, retry in 300000ms/);
    // Recovery resets the backoff. A separate outage is visible again.
    client.send = async () => { throw new Error('socket send failed'); };
    await tick(610_000);
    assert.equal(errors.length, 2);
    assert.match(errors[1].error, /socket send failed/);
    assert.match(warnings.at(-1), /attempt 1, retry in 20000ms/);
  } finally { unsubscribe(); }
  assert.equal(timers.size, 0);
});

test('torrent does not overlap an in-flight announce or retry after unsubscribe', async t => {
  const strategy = await torrentStrategy();
  const timers = new Set();
  t.mock.method(globalThis, 'setInterval', callback => { timers.add(callback); return callback; });
  t.mock.method(globalThis, 'clearInterval', callback => timers.delete(callback));
  let reject;
  let attempts = 0;
  const errors = [];
  const pending = new Promise((_resolve, fail) => { reject = fail; });
  const client = { url: 'pending-tracker', send: async () => {} };
  const unsubscribe = strategy.subscribe(client, 'pending-room-topic', '', () => {}, () => { attempts++; return pending; },
    { config: {}, appId: 'test', roomId: 'pending', onJoinError: error => errors.push(error) });
  await new Promise(resolve => setImmediate(resolve));
  const tick = [...timers][0];
  await tick(); await tick();
  assert.equal(attempts, 1);
  unsubscribe();
  reject(new Error('late failure'));
  await new Promise(resolve => setImmediate(resolve));
  await tick();
  assert.equal(attempts, 1);
  assert.deepEqual(errors, []);
  assert.equal(timers.size, 0);
});

test('torrent reclaims fulfilled offers after unsubscribe without sending them', async t => {
  const strategy = await torrentStrategy();
  const timers = new Set();
  t.mock.method(globalThis, 'setInterval', callback => { timers.add(callback); return callback; });
  t.mock.method(globalThis, 'clearInterval', callback => timers.delete(callback));
  let finish, sends = 0, reclaimed = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const client = { url: 'leaving-tracker', send: async () => { sends++; } };
  const unsubscribe = strategy.subscribe(client, 'leaving-room-topic', '', () => {}, () => pending,
    { config: {}, appId: 'test', roomId: 'leaving' });
  await new Promise(resolve => setImmediate(resolve));
  unsubscribe();
  finish([{ offer: 'late-sdp', reclaim: () => { reclaimed++; } }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends, 0);
  assert.equal(reclaimed, 1);
  assert.equal(timers.size, 0);
});
