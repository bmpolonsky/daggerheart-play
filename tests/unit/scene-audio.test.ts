import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import {
  createSceneMusicState,
  effectiveSceneMusicPosition,
  pauseSceneMusic,
  playSceneMusic,
  setSceneMusicTrack,
  setSceneMusicDeliveryMode,
  setSceneMusicVolume,
  stopSceneMusic
} from "../../src/domain/audio/sceneAudio";
import { createTableScene } from "../../src/domain/tabletop/factories";
import { resetAllStores, sceneTableStore } from "../../src/stores/gameStores";
import { sceneTableService } from "../../src/services/serviceRegistry";
import { AudioService } from "../../src/services/AudioService";
import { SceneAudioBroadcastService } from "../../src/services/SceneAudioBroadcastService";
import { createFakeSceneAudioElement } from "./helpers";
import { migratePersistedState } from '../../src/domain/migrations/persistedState';
import { snapshotPersistedState } from '../../src/stores/persistedState';

test('scene music helpers normalize track, playback position and volume', () => {
  const base = createSceneMusicState({ sourceUrl: ' https://cdn.example.com/scene.mp3 ', volume: 2, position: -10, updatedAt: '2026-05-24T10:00:00.000Z' });
  assert.equal(base.sourceUrl, 'https://cdn.example.com/scene.mp3');
  assert.equal(base.volume, 1);
  assert.equal(base.position, 0);
  assert.equal(base.deliveryMode, 'download');

  const changed = setSceneMusicTrack(base, { sourceUrl: 'https://cdn.example.com/forest.mp3', title: 'Forest' }, '2026-05-24T10:00:01.000Z');
  assert.equal(changed.playing, false);
  assert.equal(changed.position, 0);
  assert.equal(changed.revision, base.revision + 1);

  const localTrack = setSceneMusicTrack(changed, { assetId: 'asset-music-1', sourceUrl: '', title: 'Local Forest' }, '2026-05-24T10:00:01.500Z');
  assert.equal(localTrack.assetId, 'asset-music-1');
  assert.equal(localTrack.sourceUrl, '');
  assert.equal(playSceneMusic(localTrack, '2026-05-24T10:00:01.750Z').playing, true);
  assert.equal(setSceneMusicDeliveryMode(localTrack, 'broadcast').deliveryMode, 'broadcast');

  const playing = playSceneMusic(changed, '2026-05-24T10:00:02.000Z');
  assert.equal(playing.playing, true);
  assert.equal(effectiveSceneMusicPosition(playing, Date.parse('2026-05-24T10:00:07.500Z')), 5.5);

  const paused = pauseSceneMusic(playing, '2026-05-24T10:00:08.000Z');
  assert.equal(paused.playing, false);
  assert.equal(paused.position, 6);
  assert.equal(setSceneMusicVolume(paused, -1).volume, 0);
  assert.equal(stopSceneMusic(playing).position, 0);
});

test('scene table factory backfills scene music for older snapshots', () => {
  const legacyScene = createTableScene({ id: 'scene-old', name: 'Old scene' });
  const { music: _music, ...sceneWithoutMusic } = legacyScene;
  const state = createSceneTableState({
    activeSceneId: 'scene-old',
    liveSceneId: 'scene-old',
    scenes: { 'scene-old': sceneWithoutMusic as typeof legacyScene },
    sceneOrder: ['scene-old']
  });

  assert.equal(state.scenes['scene-old'].music.sourceUrl, '');
  assert.equal(state.scenes['scene-old'].music.playing, false);
  assert.equal(state.scenes['scene-old'].music.deliveryMode, 'download');
});

test('scene table persists the session music delivery preference and reads legacy scene settings', () => {
  resetAllStores();
  const sceneId = sceneTableStore.get().liveSceneId;
  sceneTableService.setSceneMusicDeliveryMode('broadcast');
  assert.equal(sceneTableStore.get().musicDeliveryMode, 'broadcast');
  const roundTripped = createSceneTableState(sceneTableStore.get());
  assert.equal(roundTripped.musicDeliveryMode, 'broadcast');

  const legacyState = createSceneTableState({
    activeSceneId: sceneId,
    liveSceneId: sceneId,
    scenes: {
      [sceneId]: createTableScene({
        ...sceneTableStore.get().scenes[sceneId],
        music: createSceneMusicState({ deliveryMode: 'broadcast' })
      })
    },
    sceneOrder: [sceneId],
    musicDeliveryMode: undefined
  });
  assert.equal(legacyState.musicDeliveryMode, 'broadcast');
});

test('current save files without a session preference inherit the legacy live-scene mode', () => {
  resetAllStores();
  const snapshot = snapshotPersistedState();
  const sceneId = snapshot.sceneTable.liveSceneId;
  const legacySnapshot = {
    ...snapshot,
    sceneTable: {
      ...snapshot.sceneTable,
      scenes: {
        ...snapshot.sceneTable.scenes,
        [sceneId]: createTableScene({
          ...snapshot.sceneTable.scenes[sceneId],
          music: createSceneMusicState({ deliveryMode: 'broadcast' })
        })
      }
    }
  };
  delete (legacySnapshot.sceneTable as Partial<typeof legacySnapshot.sceneTable>).musicDeliveryMode;

  assert.equal(migratePersistedState(legacySnapshot).sceneTable.musicDeliveryMode, 'broadcast');
});

test('publishing a scene carries active scene music playback to the next scene track', () => {
  resetAllStores();
  const firstSceneId = sceneTableStore.get().liveSceneId;
  sceneTableService.setSceneMusicTrack(firstSceneId, { sourceUrl: 'https://cdn.example.com/first.mp3', title: 'First' });
  sceneTableService.playSceneMusic(firstSceneId);

  const secondScene = sceneTableService.createScene({
    name: 'Second scene',
    music: createSceneMusicState({ sourceUrl: 'https://cdn.example.com/second.mp3', title: 'Second' })
  });

  assert.equal(sceneTableService.publishScene(secondScene.id), true);
  assert.equal(sceneTableStore.get().scenes[secondScene.id].music.playing, true);

  sceneTableService.stopSceneMusic(secondScene.id);
  const thirdScene = sceneTableService.createScene({
    name: 'Third scene',
    music: createSceneMusicState({ sourceUrl: 'https://cdn.example.com/third.mp3', title: 'Third' })
  });

  assert.equal(sceneTableService.publishScene(thirdScene.id), true);
  assert.equal(sceneTableStore.get().scenes[thirdScene.id].music.playing, false);
});

test('audio service attempts scene music playback and exposes autoplay block for retry', async () => {
  const audio = new AudioService();
  const fakeAudio = createFakeSceneAudioElement([
    new DOMException('Autoplay blocked', 'NotAllowedError'),
    undefined
  ]);

  audio.attachSceneAudioElement(fakeAudio.element);
  await audio.syncSceneMusic(createSceneMusicState({
    sourceUrl: 'https://cdn.example.com/battle.mp3',
    title: 'Battle',
    playing: true
  }));

  assert.equal(fakeAudio.playCalls(), 1);
  assert.equal(fakeAudio.element.getAttribute('src'), 'https://cdn.example.com/battle.mp3');
  assert.equal(audio.audio$.get().sceneAudioStatus, 'blocked');

  await audio.unlockSceneAudio();

  assert.equal(fakeAudio.playCalls(), 2);
  assert.equal(audio.audio$.get().sceneAudioStatus, 'playing');
  assert.equal(audio.audio$.get().sceneAudioUnlocked, true);

  await audio.syncSceneMusic(createSceneMusicState({
    sourceUrl: 'https://cdn.example.com/battle.mp3',
    title: 'Battle',
    playing: true,
    volume: 0.35
  }));

  assert.equal(fakeAudio.playCalls(), 2);
  assert.equal(fakeAudio.element.volume, 0.35);
});

test('audio service seeks to the live position when a delayed scene asset becomes available', async () => {
  const audio = new AudioService();
  const fakeAudio = createFakeSceneAudioElement([undefined]);
  audio.attachSceneAudioElement(fakeAudio.element);
  const startedAt = new Date(Date.now() - 4_000).toISOString();

  await audio.syncSceneMusic(createSceneMusicState({
    assetId: 'delayed-music',
    sourceUrl: 'blob:http://localhost/delayed-music',
    title: 'Delayed',
    playing: true,
    position: 3,
    startedAt
  }));

  assert.ok(fakeAudio.element.currentTime >= 6.5, `expected delayed playback near 7s, got ${fakeAudio.element.currentTime}`);
  assert.equal(audio.audio$.get().sceneAudioStatus, 'playing');
});

test('broadcast mode publishes the scene player as a distinct media delivery', async () => {
  const broadcast = new SceneAudioBroadcastService();
  const track = { contentHint: '', stop: () => undefined, addEventListener: () => undefined };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track]
  } as unknown as MediaStream;
  const published: Array<{ stream: MediaStream; metadata: unknown }> = [];
  const removed: MediaStream[] = [];
  const transport = {
    id: 'broadcast-test',
    label: 'Broadcast test',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async (publishedStream: MediaStream, metadata?: unknown) => {
      published.push({ stream: publishedStream, metadata });
    },
    removeMediaStream: (publishedStream: MediaStream) => removed.push(publishedStream),
    subscribeMediaStreams: () => () => undefined
  };
  const element = {
    src: 'blob:http://localhost/music',
    paused: false,
    volume: 1,
    captureStream: () => stream,
    load: () => undefined,
    play: async () => undefined
  } as unknown as HTMLAudioElement;

  broadcast.setTransport(transport);
  broadcast.attachSceneAudioElement(element);
  broadcast.setSceneMusicContext(createSceneMusicState({
    sourceUrl: element.src,
    title: 'Broadcast',
    deliveryMode: 'broadcast',
    playing: true
  }));
  await broadcast.startScenePlayerBroadcast('Broadcast');

  assert.equal(published.length, 1);
  assert.deepEqual(published[0]?.metadata, { kind: 'scene-audio', label: 'Broadcast', deliveryKind: 'scene-player' });
  assert.equal(broadcast.broadcast$.get().deliveryKind, 'scene-player');
  assert.equal(broadcast.broadcast$.get().status, 'live');
  broadcast.stopBroadcast();
  assert.equal(removed.length, 1);
  assert.equal(broadcast.broadcast$.get().deliveryKind, 'none');
});

test('scene player capture errors are exposed instead of rejecting silently', async () => {
  const broadcast = new SceneAudioBroadcastService();
  const transport = {
    id: 'capture-error-test',
    label: 'Capture error test',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: () => undefined,
    subscribeMediaStreams: () => () => undefined
  };
  broadcast.setTransport(transport);
  broadcast.attachSceneAudioElement({
    src: 'blob:http://localhost/music',
    paused: false,
    volume: 1,
    captureStream: () => { throw new Error('captureStream заблокирован'); },
    load: () => undefined,
    play: async () => undefined
  } as unknown as HTMLAudioElement);

  await broadcast.startScenePlayerBroadcast();

  assert.equal(broadcast.broadcast$.get().requestedKind, 'scene-player');
  assert.equal(broadcast.broadcast$.get().status, 'error');
  assert.equal(broadcast.broadcast$.get().message, 'captureStream заблокирован');
});

test('tab audio capture errors stay visible and scene controls cannot stop that flow', async () => {
  const broadcast = new SceneAudioBroadcastService();
  const transport = {
    id: 'display-test',
    label: 'Display test',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: () => undefined,
    subscribeMediaStreams: () => () => undefined
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia: async () => {
          throw new Error('Захват вкладки недоступен');
        }
      }
    }
  });

  try {
    broadcast.setTransport(transport);
    await broadcast.startDisplayAudioBroadcast();

    assert.equal(broadcast.broadcast$.get().requestedKind, 'none');
    assert.equal(broadcast.broadcast$.get().tabAudioStatus, 'error');
    assert.equal(broadcast.broadcast$.get().tabAudioMessage, 'Захват вкладки недоступен');

    broadcast.stopBroadcast('scene-player');
    assert.equal(broadcast.broadcast$.get().requestedKind, 'none');
    assert.equal(broadcast.broadcast$.get().tabAudioStatus, 'error');
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});

test('tab audio stays live when scene music is paused or its volume changes', async () => {
  const broadcast = new SceneAudioBroadcastService();
  const stopped: string[] = [];
  const audioTrack = { contentHint: '', stop: () => stopped.push('audio'), addEventListener: () => undefined };
  const videoTrack = { contentHint: '', stop: () => stopped.push('video'), addEventListener: () => undefined };
  class FakeMediaStream {
    readonly id = 'display-audio';
    constructor(private readonly tracks: Array<typeof audioTrack | typeof videoTrack> = []) {}
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter((track) => track === audioTrack); }
  }
  const displayStream = new FakeMediaStream([audioTrack, videoTrack]) as unknown as MediaStream;
  const removed: MediaStream[] = [];
  const transport = {
    id: 'display-live-test',
    label: 'Display live test',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: (stream: MediaStream) => removed.push(stream),
    subscribeMediaStreams: () => () => undefined
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const OriginalMediaStream = globalThis.MediaStream;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia: async () => displayStream } }
  });
  globalThis.MediaStream = FakeMediaStream as unknown as typeof MediaStream;

  try {
    broadcast.setTransport(transport);
    await broadcast.startDisplayAudioBroadcast();
    assert.equal(broadcast.broadcast$.get().deliveryKind, 'display');

    broadcast.stopBroadcast('scene-player');
    broadcast.setSceneMusicBroadcastVolume(0.2);
    assert.equal(broadcast.broadcast$.get().deliveryKind, 'display');
    assert.equal(broadcast.broadcast$.get().tabAudioVolume, 0.72);
    assert.equal(removed.length, 0);

    broadcast.stopBroadcast('display');
    assert.equal(broadcast.broadcast$.get().deliveryKind, 'none');
    assert.equal(removed.length, 1);
    assert.deepEqual(stopped.sort(), ['audio', 'video']);
  } finally {
    globalThis.MediaStream = OriginalMediaStream;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});
