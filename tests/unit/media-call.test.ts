import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MediaCallService } from '../../src/services/MediaCallService';
import { SyncService } from '../../src/services/SyncService';

test('call audio plays independently from camera state and exposes autoplay retry', async () => {
  const originalAudio = globalThis.Audio;
  const playResults: Array<'blocked' | 'playing'> = [];
  const createdAudio: FakeAudio[] = [];
  let mediaListener: ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null = null;

  class TestAudio extends FakeAudio {
    constructor() {
      super(playResults);
      createdAudio.push(this);
    }
  }

  globalThis.Audio = TestAudio as unknown as typeof Audio;
  const call = new MediaCallService(new SyncService());
  const transport = {
    id: 'call-media-test',
    label: 'Call media test',
    peerId: 'local-peer',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: () => undefined,
    subscribeMediaStreams: (listener: typeof mediaListener) => {
      mediaListener = listener;
      return () => {
        mediaListener = null;
      };
    }
  };
  const audioTrack = {
    enabled: true,
    muted: false,
    readyState: 'live'
  };
  const stream = {
    id: 'remote-audio-only',
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [],
    getTracks: () => [audioTrack]
  } as unknown as MediaStream;

  try {
    call.setMediaTransport(transport);
    const listener = mediaListener as ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null;
    listener?.(stream, 'remote-peer', {
      kind: 'call',
      participantId: 'remote-participant',
      displayName: 'Игрок'
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(createdAudio.length, 1);
    assert.equal(createdAudio[0]?.srcObject, stream);
    assert.equal(createdAudio[0]?.autoplay, true);
    assert.equal(createdAudio[0]?.muted, false);
    assert.equal(call.call$.get().audioPlaybackBlocked, true);
    assert.equal(call.call$.get().audioPlaybackActive, false);
    assert.deepEqual(playResults, ['blocked']);

    await call.unlockRemoteAudio();

    assert.equal(call.call$.get().audioPlaybackBlocked, false);
    assert.equal(call.call$.get().audioPlaybackActive, true);
    assert.deepEqual(playResults, ['blocked', 'playing']);

    call.removeRemotePeer('remote-peer');

    assert.equal(createdAudio[0]?.pausedByService, true);
    assert.equal(createdAudio[0]?.srcObject, null);
  } finally {
    globalThis.Audio = originalAudio;
  }
});

test('a stale audio play result cannot change playback state after the peer leaves', async () => {
  const originalAudio = globalThis.Audio;
  let rejectPlay: ((reason?: unknown) => void) | undefined;
  let mediaListener: ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null = null;

  class DeferredAudio {
    autoplay = false;
    muted = true;
    srcObject: MediaStream | null = null;

    setAttribute(): void {}

    play(): Promise<void> {
      return new Promise((_resolve, reject) => {
        rejectPlay = reject;
      });
    }

    pause(): void {}
  }

  globalThis.Audio = DeferredAudio as unknown as typeof Audio;
  const call = new MediaCallService(new SyncService());
  const transport = {
    id: 'call-media-stale-play-test',
    label: 'Call media stale play test',
    peerId: 'local-peer',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async () => undefined,
    removeMediaStream: () => undefined,
    subscribeMediaStreams: (listener: typeof mediaListener) => {
      mediaListener = listener;
      return () => {
        mediaListener = null;
      };
    }
  };
  const audioTrack = { enabled: true, muted: false, readyState: 'live' };
  const stream = {
    id: 'remote-deferred-audio',
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [],
    getTracks: () => [audioTrack]
  } as unknown as MediaStream;

  try {
    call.setMediaTransport(transport);
    const listener = mediaListener as ((stream: MediaStream, peerId: string, metadata?: unknown) => void) | null;
    listener?.(stream, 'remote-peer', {
      kind: 'call',
      participantId: 'remote-participant',
      displayName: 'Игрок'
    });
    call.removeRemotePeer('remote-peer');
    rejectPlay?.(new DOMException('Autoplay blocked', 'NotAllowedError'));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(call.call$.get().audioPlaybackBlocked, false);
    assert.equal(call.call$.get().audioPlaybackActive, false);
  } finally {
    globalThis.Audio = originalAudio;
  }
});

test('enabling microphone after camera adds an audio track without replacing the video stream', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const videoTrack = fakeMediaTrack('video');
  const audioTrack = fakeMediaTrack('audio');
  const localTracks = [videoTrack];
  const videoStream = fakeMediaStream('local-call', localTracks);
  const audioStream = fakeMediaStream('new-audio', [audioTrack]);
  const published: MediaStream[] = [];
  const added: Array<{ track: MediaStreamTrack; stream: MediaStream }> = [];
  const streams = [videoStream, audioStream];

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => streams.shift()
      }
    }
  });

  const call = new MediaCallService(new SyncService());
  const transport = {
    id: 'call-track-test',
    label: 'Call track test',
    peerId: 'local-peer',
    connect: async () => undefined,
    disconnect: async () => undefined,
    publish: async () => undefined,
    subscribe: () => () => undefined,
    publishMediaStream: async (stream: MediaStream) => {
      published.push(stream);
    },
    removeMediaStream: () => undefined,
    addMediaTrack: async (track: MediaStreamTrack, stream: MediaStream) => {
      added.push({ track, stream });
    },
    subscribeMediaStreams: () => () => undefined
  };

  try {
    call.setMediaTransport(transport);
    call.setRoom({ roomId: 'MEDIA1', participantId: 'local-participant', displayName: 'Игрок', role: 'player', active: true });

    await call.toggleCamera();
    const streamAfterCamera = call.call$.get().localStream;
    await call.toggleMicrophone();

    assert.equal(call.call$.get().localStream, streamAfterCamera);
    assert.deepEqual(localTracks, [videoTrack, audioTrack]);
    assert.deepEqual(published, [videoStream]);
    assert.deepEqual(added, [{ track: audioTrack, stream: videoStream }]);
    assert.equal(videoTrack.stopped, false);
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
  }
});

class FakeAudio {
  autoplay = false;
  muted = true;
  srcObject: MediaStream | null = null;
  pausedByService = false;

  constructor(private results: Array<'blocked' | 'playing'>) {}

  setAttribute(): void {}

  async play(): Promise<void> {
    if (this.results.length === 0) {
      this.results.push('blocked');
      throw new DOMException('Autoplay blocked', 'NotAllowedError');
    }
    this.results.push('playing');
  }

  pause(): void {
    this.pausedByService = true;
  }
}

function fakeMediaTrack(kind: 'audio' | 'video'): MediaStreamTrack & { stopped: boolean } {
  const track = { kind, id: `${kind}-track`, enabled: true, contentHint: '', stopped: false, stop: () => { track.stopped = true; } };
  return track as unknown as MediaStreamTrack & { stopped: boolean };
}

function fakeMediaStream(id: string, tracks: MediaStreamTrack[]): MediaStream {
  return {
    id,
    getTracks: () => [...tracks],
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    addTrack: (track: MediaStreamTrack) => tracks.push(track),
    removeTrack: (track: MediaStreamTrack) => tracks.splice(tracks.indexOf(track), 1)
  } as unknown as MediaStream;
}
