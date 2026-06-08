import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores } from "../../src/stores/gameStores";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { LocalSyncTransport, SyncService } from "../../src/services/SyncService";
import type { FeedEntry, PersistedState } from "../../src/domain/rules/types";

test('read-only sync joins receive snapshots and cannot publish snapshots', async () => {
  resetAllStores();
  const transport = new LocalSyncTransport();
  const gm = new SyncService();
  const observer = new SyncService();
  gm.setTransport(transport);
  observer.setTransport(transport);

  await gm.connectLocal({
    id: 'gm-1',
    name: 'Мастер',
    role: 'gm',
    actorIds: [],
    connected: true,
    updatedAt: '2026-05-22T00:00:00.000Z'
  });

  const received: PersistedState[] = [];
  await observer.connectReadOnly(
    'room-1',
    {
      id: 'player-1',
      name: 'Игрок',
      role: 'observer',
      actorIds: [],
      connected: true,
      updatedAt: '2026-05-22T00:00:00.000Z'
    },
    (state) => received.push(state)
  );

  const snapshot = snapshotPersistedState();
  assert.equal(await gm.publishSnapshot(snapshot), true);
  assert.equal(received.length, 1);
  assert.equal(received[0].schemaVersion, 5);
  assert.equal(await observer.publishSnapshot(snapshot), false);

  const playerRequests: unknown[] = [];
  const unsubscribe = gm.subscribePlayerRequests((request) => playerRequests.push(request));
  assert.equal(await observer.publishPlayerRequest({ id: 'request-1', title: 'Проверка ловкости' }), true);
  assert.deepEqual(playerRequests, [{ id: 'request-1', title: 'Проверка ловкости' }]);
  unsubscribe();

  const feedEntries: FeedEntry[] = [];
  const unsubscribeFeed = gm.subscribeFeedEntries((entry) => feedEntries.push(entry));
  const playerMessage: FeedEntry = {
    id: 'feed-1',
    type: 'message',
    createdAt: '2026-05-22T00:00:00.000Z',
    visibility: 'public',
    authorName: 'Ари',
    title: 'Ари',
    body: 'Иду вперед'
  };
  assert.equal(await observer.publishFeedEntry(playerMessage), true);
  assert.deepEqual(feedEntries, [playerMessage]);
  unsubscribeFeed();

  const snapshotRequests: string[] = [];
  const unsubscribeSnapshotRequests = gm.subscribeSnapshotRequests((request) => snapshotRequests.push(request.reason));
  assert.equal(await observer.publishSnapshotRequest('join'), true);
  assert.deepEqual(snapshotRequests, ['join']);
  unsubscribeSnapshotRequests();

  const resourceMessages: unknown[] = [];
  const unsubscribeResources = gm.subscribePlayerCharacterResources((message) => resourceMessages.push(message));
  assert.equal(await observer.publishPlayerCharacterResources({
    type: 'playerCharacterResources',
    participantId: 'player-1',
    actorId: 'hero-1',
    actorName: 'Ари',
    resources: {
      hope: { value: 3 },
      stress: { marked: 2 }
    },
    updatedAt: '2026-05-22T00:00:01.000Z'
  }), true);
  assert.deepEqual(resourceMessages, [{
    type: 'playerCharacterResources',
    participantId: 'player-1',
    actorId: 'hero-1',
    actorName: 'Ари',
    resources: {
      hope: { value: 3 },
      stress: { marked: 2 }
    },
    updatedAt: '2026-05-22T00:00:01.000Z'
  }]);
  unsubscribeResources();
});
