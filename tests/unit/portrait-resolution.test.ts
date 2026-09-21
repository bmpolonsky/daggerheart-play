import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import type { Store } from '../../src/core/store/Store';
import { createMapAsset } from '../../src/domain/tabletop/factories';
import { AssetService } from '../../src/services/AssetService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import type { P2PRoomConnection } from '../../src/services/p2p/P2PRoomConnection';
import { SupabaseAssetService } from '../../src/services/SupabaseAssetService';
import { gameStore, resetAllStores, sceneTableStore } from '../../src/stores/gameStores';
import { createTestP2PSession, ScriptedP2PNetwork } from './helpers';

beforeEach(() => {
  resetAllStores();
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function harness() {
  let ready = false;
  const blob = new Blob(['portrait'], { type: 'image/webp' });
  const blobs = new Map<string, Blob>();
  const get = vi.fn(async (id: string): Promise<Blob | null> => blobs.get(id) ?? null);
  const assets = new AssetService({ get,
    put: async (id, value) => { blobs.set(id, value); }, delete: async id => { blobs.delete(id); } });
  const download = vi.fn(async () => ready
    ? { data: blob, error: null }
    : { data: null, error: { message: 'Object not found', statusCode: '404' } });
  const query = { select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { owner_id: 'gm' }, error: null }) };
  const cloud = new SupabaseAssetService({ url: 'https://example.supabase.co', publishableKey: 'test' }, {
    from: () => query, storage: { from: () => ({ download }) }
  } as never);
  const service = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), { assetService: assets });
  const internals = service as unknown as { sessionStore: Store<P2PSessionState>;
    activeRoomConnection: P2PRoomConnection | null; supabaseAssetService: SupabaseAssetService };
  internals.supabaseAssetService = cloud;
  // No direct GM peer: the real transfer service cannot supply the missing file.
  internals.activeRoomConnection = { gmPeerId: () => null } as unknown as P2PRoomConnection;
  internals.sessionStore.set({ ...internals.sessionStore.get(), connected: true, role: 'player', roomId: 'ROOM', transportMode: 'hybrid' });
  sceneTableStore.update(state => ({ ...state, assets: {
    portrait: createMapAsset({ id: 'portrait', name: 'portrait.webp', storage: 'indexeddb', mimeType: 'image/webp' })
  } }));
  return { service, internals, get, download, blobs, blob, uploaded: () => { ready = true; } };
}

test('a cloud-only portrait resolves after its snapshot arrives before the file, without a new snapshot', async () => {
  const h = harness();
  const controller = new AbortController();
  const snapshot = sceneTableStore.get();
  const pending = h.service.resolveAssetUrl('asset:portrait', controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  assert.equal(h.download.mock.calls.length, 1);
  h.download.mockRejectedValueOnce(new Error('Temporary network failure'));
  await vi.advanceTimersByTimeAsync(1_000);
  assert.equal(h.download.mock.calls.length, 2);
  h.uploaded();
  await vi.advanceTimersByTimeAsync(2_000);
  const url = await pending;
  assert.match(url!, /^blob:/);
  assert.equal(await h.blobs.get('portrait')?.text(), 'portrait');
  assert.equal(sceneTableStore.get(), snapshot);
  URL.revokeObjectURL(url!);
  assert.equal(vi.getTimerCount(), 0);
});

test('closing a missing portrait cancels its retry timer', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.service.resolveAssetUrl('asset:portrait', controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  assert.equal(await pending, null);
  await vi.advanceTimersByTimeAsync(60_000);
  assert.equal(h.download.mock.calls.length, 1);
  assert.equal(vi.getTimerCount(), 0);
});

for (const change of ['connection', 'world'] as const) {
  test(`a pending portrait does not download into a different ${change}`, async () => {
    const h = harness();
    const pending = h.service.resolveAssetUrl('asset:portrait', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    if (change === 'connection') h.internals.activeRoomConnection = null;
    else gameStore.update(state => ({ ...state, id: 'other-world' }));
    h.uploaded();
    await vi.advanceTimersByTimeAsync(1_000);
    assert.equal(await pending, null);
    assert.equal(h.download.mock.calls.length, 1);
    assert.equal(h.blobs.size, 0);
  });
}

test('missing portraits back off to 30 seconds instead of a tight request loop', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.service.resolveAssetUrl('asset:portrait', controller.signal);
  await vi.advanceTimersByTimeAsync(61_000);
  assert.equal(h.download.mock.calls.length, 7); // 0, 1, 3, 7, 15, 31, 61 seconds
  controller.abort();
  assert.equal(await pending, null);
});

for (const change of ['abort', 'connection', 'world'] as const) {
  test(`a ${change} during IndexedDB lookup prevents a stale network request`, async () => {
    const h = harness();
    const controller = new AbortController();
    let finish!: (blob: Blob | null) => void;
    h.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = h.service.resolveAssetUrl('asset:portrait', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    if (change === 'abort') controller.abort();
    else if (change === 'connection') h.internals.activeRoomConnection = null;
    else gameStore.update(state => ({ ...state, id: 'other-world' }));
    finish(null);
    assert.equal(await pending, null);
    assert.equal(h.download.mock.calls.length, 0);
    assert.equal(vi.getTimerCount(), 0);
  });
}
