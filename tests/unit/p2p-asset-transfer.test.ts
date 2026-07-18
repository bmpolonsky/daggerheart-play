import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import type { AssetBlobStore } from '../../src/core/persistence/assetBlobStore';
import { createMapAsset } from '../../src/domain/tabletop/factories';
import { AssetService } from '../../src/services/AssetService';
import { P2PAssetTransferService } from '../../src/services/P2PAssetTransferService';
import type { P2PRoomConnection } from '../../src/services/p2p/P2PRoomConnection';
import { SceneTableService } from '../../src/services/SceneTableService';
import type { AssetMessage, SyncService } from '../../src/services/SyncService';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('asset transfer idle timeout is extended by real progress', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const blobs = new Map<string, Blob>();
  const assetService = new AssetService({
    get: async (id) => blobs.get(id) ?? null,
    put: async (id, blob) => { blobs.set(id, blob); },
    delete: async (id) => { blobs.delete(id); }
  } satisfies AssetBlobStore);
  const publishedMessages: AssetMessage[] = [];
  let progressListener = (_percent: number, _peerId: string, _metadata: unknown) => undefined;
  let binaryListener = (_data: ArrayBuffer, _peerId: string, _metadata: unknown) => undefined;
  const sync = {
    publishAssetMessage: async (message: AssetMessage) => {
      publishedMessages.push(message);
      return true;
    },
    subscribeAssetMessages: () => () => undefined
  } as unknown as SyncService;
  const connection = {
    gmPeerId: () => 'gm-peer',
    subscribeBinary: (listener: typeof binaryListener) => {
      binaryListener = listener;
      return () => undefined;
    },
    subscribeBinaryProgress: (listener: typeof progressListener) => {
      progressListener = listener;
      return () => undefined;
    }
  } as unknown as P2PRoomConnection;
  const service = new P2PAssetTransferService(
    sync,
    assetService,
    new SceneTableService(),
    () => ({ connected: true, role: 'player' }),
    () => connection,
    () => undefined
  );
  service.subscribePlayer(connection);

  const result = service.request('slow-audio', 'scene-music');
  await flushMicrotasks();
  const published = publishedMessages[0];
  assert.equal(published?.type, 'request');
  if (!published || published.type !== 'request') throw new Error('Asset request was not published.');
  const asset = createMapAsset({
    id: 'slow-audio',
    name: 'slow.mp3',
    mimeType: 'audio/mpeg',
    storage: 'indexeddb'
  });
  const metadata = { type: 'asset', requestId: published.requestId, asset };

  await vi.advanceTimersByTimeAsync(14_000);
  progressListener(0.1, 'gm-peer', metadata);
  await vi.advanceTimersByTimeAsync(14_000);
  progressListener(0.4, 'gm-peer', metadata);
  await vi.advanceTimersByTimeAsync(14_000);
  binaryListener(new Uint8Array([1, 2, 3]).buffer, 'gm-peer', metadata);

  assert.equal(await result, true);
  assert.deepEqual(Array.from(new Uint8Array(await (await assetService.getBlob(asset.id))!.arrayBuffer())), [1, 2, 3]);
});

test('repeated non-increasing progress cannot bypass the asset idle timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const assetService = new AssetService(null);
  const publishedMessages: AssetMessage[] = [];
  let progressListener = (_percent: number, _peerId: string, _metadata: unknown) => undefined;
  const sync = {
    publishAssetMessage: async (message: AssetMessage) => {
      publishedMessages.push(message);
      return true;
    },
    subscribeAssetMessages: () => () => undefined
  } as unknown as SyncService;
  const connection = {
    gmPeerId: () => 'gm-peer',
    subscribeBinary: () => () => undefined,
    subscribeBinaryProgress: (listener: typeof progressListener) => {
      progressListener = listener;
      return () => undefined;
    }
  } as unknown as P2PRoomConnection;
  const service = new P2PAssetTransferService(
    sync,
    assetService,
    new SceneTableService(),
    () => ({ connected: true, role: 'player' }),
    () => connection,
    () => undefined
  );
  service.subscribePlayer(connection);

  const result = service.request('stalled-audio', 'scene-music');
  await flushMicrotasks();
  const published = publishedMessages[0];
  if (!published || published.type !== 'request') throw new Error('Asset request was not published.');
  const metadata = {
    type: 'asset',
    requestId: published.requestId,
    asset: createMapAsset({ id: 'stalled-audio', name: 'stalled.mp3', mimeType: 'audio/mpeg', storage: 'indexeddb' })
  };
  progressListener(0.2, 'gm-peer', metadata);
  await vi.advanceTimersByTimeAsync(10_000);
  progressListener(0.2, 'gm-peer', metadata);
  await vi.advanceTimersByTimeAsync(5_001);

  assert.equal(await result, false);
});

test('increasing progress cannot bypass the asset hard timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const assetService = new AssetService(null);
  const publishedMessages: AssetMessage[] = [];
  let progressListener = (_percent: number, _peerId: string, _metadata: unknown) => undefined;
  const sync = {
    publishAssetMessage: async (message: AssetMessage) => {
      publishedMessages.push(message);
      return true;
    },
    subscribeAssetMessages: () => () => undefined
  } as unknown as SyncService;
  const connection = {
    gmPeerId: () => 'gm-peer',
    subscribeBinary: () => () => undefined,
    subscribeBinaryProgress: (listener: typeof progressListener) => {
      progressListener = listener;
      return () => undefined;
    }
  } as unknown as P2PRoomConnection;
  const service = new P2PAssetTransferService(
    sync,
    assetService,
    new SceneTableService(),
    () => ({ connected: true, role: 'player' }),
    () => connection,
    () => undefined
  );
  service.subscribePlayer(connection);

  const result = service.request('endless-audio', 'scene-music');
  await flushMicrotasks();
  const published = publishedMessages[0];
  if (!published || published.type !== 'request') throw new Error('Asset request was not published.');
  const metadata = {
    type: 'asset',
    requestId: published.requestId,
    asset: createMapAsset({ id: 'endless-audio', name: 'endless.mp3', mimeType: 'audio/mpeg', storage: 'indexeddb' })
  };
  for (let step = 1; step <= 21; step += 1) {
    await vi.advanceTimersByTimeAsync(14_000);
    progressListener(step / 100, 'gm-peer', metadata);
  }
  await vi.advanceTimersByTimeAsync(6_001);

  assert.equal(await result, false);
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
