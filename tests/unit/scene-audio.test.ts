import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import {
  createSceneMusicState,
  effectiveSceneMusicPosition,
  pauseSceneMusic,
  playSceneMusic,
  setSceneMusicTrack,
  setSceneMusicVolume,
  stopSceneMusic
} from "../../src/domain/audio/sceneAudio";
import { createTableScene } from "../../src/domain/tabletop/factories";
import { resetAllStores, sceneTableStore } from "../../src/stores/gameStores";
import { sceneTableService } from "../../src/services/serviceRegistry";
import { AudioService } from "../../src/services/AudioService";
import { createFakeSceneAudioElement } from "./helpers";

test('scene music helpers normalize track, playback position and volume', () => {
  const base = createSceneMusicState({ sourceUrl: ' https://cdn.example.com/scene.mp3 ', volume: 2, position: -10, updatedAt: '2026-05-24T10:00:00.000Z' });
  assert.equal(base.sourceUrl, 'https://cdn.example.com/scene.mp3');
  assert.equal(base.volume, 1);
  assert.equal(base.position, 0);

  const changed = setSceneMusicTrack(base, { sourceUrl: 'https://cdn.example.com/forest.mp3', title: 'Forest' }, '2026-05-24T10:00:01.000Z');
  assert.equal(changed.playing, false);
  assert.equal(changed.position, 0);
  assert.equal(changed.revision, base.revision + 1);

  const localTrack = setSceneMusicTrack(changed, { assetId: 'asset-music-1', sourceUrl: '', title: 'Local Forest' }, '2026-05-24T10:00:01.500Z');
  assert.equal(localTrack.assetId, 'asset-music-1');
  assert.equal(localTrack.sourceUrl, '');
  assert.equal(playSceneMusic(localTrack, '2026-05-24T10:00:01.750Z').playing, true);

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
});

test('publishing a scene carries active scene music playback to the next scene track', () => {
  resetAllStores();
  const firstSceneId = sceneTableStore.getSnapshot().liveSceneId;
  sceneTableService.setSceneMusicTrack(firstSceneId, { sourceUrl: 'https://cdn.example.com/first.mp3', title: 'First' });
  sceneTableService.playSceneMusic(firstSceneId);

  const secondScene = sceneTableService.createScene({
    name: 'Second scene',
    music: createSceneMusicState({ sourceUrl: 'https://cdn.example.com/second.mp3', title: 'Second' })
  });

  assert.equal(sceneTableService.publishScene(secondScene.id), true);
  assert.equal(sceneTableStore.getSnapshot().scenes[secondScene.id].music.playing, true);

  sceneTableService.stopSceneMusic(secondScene.id);
  const thirdScene = sceneTableService.createScene({
    name: 'Third scene',
    music: createSceneMusicState({ sourceUrl: 'https://cdn.example.com/third.mp3', title: 'Third' })
  });

  assert.equal(sceneTableService.publishScene(thirdScene.id), true);
  assert.equal(sceneTableStore.getSnapshot().scenes[thirdScene.id].music.playing, false);
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
  assert.equal(audio.audioStore.getSnapshot().sceneAudioStatus, 'blocked');

  await audio.unlockSceneAudio();

  assert.equal(fakeAudio.playCalls(), 2);
  assert.equal(audio.audioStore.getSnapshot().sceneAudioStatus, 'playing');
  assert.equal(audio.audioStore.getSnapshot().sceneAudioUnlocked, true);

  await audio.syncSceneMusic(createSceneMusicState({
    sourceUrl: 'https://cdn.example.com/battle.mp3',
    title: 'Battle',
    playing: true,
    volume: 0.35
  }));

  assert.equal(fakeAudio.playCalls(), 2);
  assert.equal(fakeAudio.element.volume, 0.35);
});

test('audio service stops local voice stream when transport is detached', async () => {
  const audio = new AudioService();
  const stoppedTracks: string[] = [];
  const fakeTrack = {
    enabled: true,
    stop: () => stoppedTracks.push('audio')
  };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack]
  } as unknown as MediaStream;
  const published: MediaStream[] = [];
  const removed: MediaStream[] = [];
  const fakeTransport = {
    id: 'fake',
    label: 'Fake',
    peerId: 'peer',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async (stream: MediaStream) => {
      published.push(stream);
    },
    removeMediaStream: (stream: MediaStream) => {
      removed.push(stream);
    },
    subscribeMediaStreams: () => () => undefined
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => fakeStream
      }
    }
  });

  try {
    audio.setVoiceTransport(fakeTransport);
    await audio.startVoiceChat('Ари');

    assert.equal(audio.audioStore.getSnapshot().voiceStatus, 'live');
    assert.deepEqual(published, [fakeStream]);

    audio.setVoiceTransport(null);

    assert.deepEqual(removed, [fakeStream]);
    assert.deepEqual(stoppedTracks, ['audio']);
    assert.equal(audio.audioStore.getSnapshot().voiceStatus, 'idle');
    assert.equal(audio.audioStore.getSnapshot().voiceMuted, true);
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});

test('audio service retries blocked remote voice playback from mic click', async () => {
  const audio = new AudioService();
  const fakeLocalTrack = {
    enabled: true,
    stop: () => undefined
  };
  const fakeLocalStream = {
    getTracks: () => [fakeLocalTrack],
    getAudioTracks: () => [fakeLocalTrack]
  } as unknown as MediaStream;
  const fakeRemoteStream = {
    getTracks: () => [],
    getAudioTracks: () => []
  } as unknown as MediaStream;
  let mediaListener: ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null = null;
  const fakeTransport = {
    id: 'fake',
    label: 'Fake',
    peerId: 'local-peer',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: () => undefined,
    subscribeMediaStreams: (listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void) => {
      mediaListener = listener;
      return () => {
        mediaListener = null;
      };
    }
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const OriginalAudio = globalThis.Audio;
  const playCalls: Array<'blocked' | 'played'> = [];

  class FakeAudio {
    autoplay = false;
    srcObject: MediaStream | null = null;

    setAttribute = () => undefined;
    play = async () => {
      if (playCalls.length === 0) {
        playCalls.push('blocked');
        throw new DOMException('Autoplay blocked', 'NotAllowedError');
      }
      playCalls.push('played');
    };

    pause = () => undefined;
  }

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => fakeLocalStream
      }
    }
  });
  globalThis.Audio = FakeAudio as unknown as typeof Audio;

  try {
    audio.setVoiceTransport(fakeTransport);
    const listener = mediaListener as ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null;
    listener?.(fakeRemoteStream, 'remote-peer', { kind: 'voice', label: 'Роланд' });
    await Promise.resolve();

    assert.deepEqual(playCalls, ['blocked']);
    assert.equal(audio.audioStore.getSnapshot().voiceMessage, 'Нажмите микрофон, чтобы разблокировать входящий голос.');

    await audio.toggleVoiceChat('Ари');

    assert.deepEqual(playCalls, ['blocked', 'played']);
    assert.equal(audio.audioStore.getSnapshot().voiceStatus, 'live');
  } finally {
    globalThis.Audio = OriginalAudio;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});
