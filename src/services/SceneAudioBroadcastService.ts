import { Store } from '../core/store/Store';
import type { SceneMusicState } from '../domain/audio/sceneAudio';
import type { SyncTransport } from '../domain/tabletop/types';

export type SceneAudioBroadcastStatus = 'idle' | 'starting' | 'live' | 'unsupported' | 'error';

export interface SceneAudioBroadcastState {
  status: SceneAudioBroadcastStatus;
  message: string;
  sourceLabel: string;
  volume: number;
  remotePeerIds: string[];
}

interface SceneAudioMediaTransport {
  publishMediaStream(stream: MediaStream, metadata?: { kind: 'scene-audio'; label: string }): Promise<void>;
  removeMediaStream(stream: MediaStream): void;
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
}

const initialBroadcastState: SceneAudioBroadcastState = {
  status: 'idle',
  message: 'Стрим музыки выключен.',
  sourceLabel: '',
  volume: 0.72,
  remotePeerIds: []
};

export class SceneAudioBroadcastService {
  readonly broadcastStore = new Store<SceneAudioBroadcastState>(initialBroadcastState);

  private sceneAudioElement: HTMLAudioElement | null = null;
  private sceneMusic: SceneMusicState | null = null;
  private transport: SceneAudioMediaTransport | null = null;
  private unsubscribeStreams: (() => void) | null = null;
  private localBroadcastStream: MediaStream | null = null;
  private localSourceStream: MediaStream | null = null;
  private localCaptureStream: MediaStream | null = null;
  private localBroadcastElement: HTMLAudioElement | null = null;
  private localBroadcastObjectUrl: string | null = null;
  private broadcastAudioContext: AudioContext | null = null;
  private broadcastSourceNode: MediaStreamAudioSourceNode | null = null;
  private broadcastGainNode: GainNode | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();

  attachSceneAudioElement(element: HTMLAudioElement | null): () => void {
    this.sceneAudioElement = element;
    return () => {
      if (this.sceneAudioElement === element) {
        this.sceneAudioElement = null;
      }
    };
  }

  setSceneMusicContext(music: SceneMusicState): void {
    this.sceneMusic = music;
  }

  setTransport(transport: SyncTransport | null): void {
    const previousTransport = this.transport;
    const nextTransport = isSceneAudioMediaTransport(transport) ? transport : null;
    this.unsubscribeStreams?.();
    this.unsubscribeStreams = null;
    if (previousTransport && previousTransport !== nextTransport && this.localBroadcastStream) {
      previousTransport.removeMediaStream(this.localBroadcastStream);
    }
    if (previousTransport !== nextTransport) {
      this.clearRemoteStreams();
    }
    this.transport = nextTransport;
    if (!this.transport) {
      if (this.localBroadcastStream) {
        this.stopLocalBroadcastTracks();
      }
      this.patchBroadcast({
        status: 'idle',
        message: transport ? 'P2P transport не поддерживает audio broadcast.' : 'Стрим музыки выключен.',
        sourceLabel: ''
      });
      return;
    }
    this.unsubscribeStreams = this.transport.subscribeMediaStreams((stream, peerId, metadata) => {
      if (!isSceneAudioMetadata(metadata)) return;
      this.attachRemoteStream(peerId, stream, metadata.label);
    });
    if (this.localBroadcastStream) {
      void this.publishLocalStream();
    }
  }

  async startScenePlayerBroadcast(label = 'Музыка сцены'): Promise<void> {
    if (!this.transport) {
      this.patchBroadcast({ status: 'unsupported', message: 'Сначала подключитесь к серверу мастера.' });
      return;
    }
    const element = this.sceneAudioElement;
    if (element && !element.src && this.sceneMusic?.sourceUrl) {
      element.src = this.sceneMusic.sourceUrl;
      element.load();
    }
    if (element && this.sceneMusic) {
      element.volume = this.sceneMusic.volume;
    }
    if (!element?.src) {
      this.patchBroadcast({ status: 'error', message: 'Сначала запустите трек в плеере сцены.' });
      return;
    }
    const stream = captureMediaElementStream(element);
    if (!stream || stream.getAudioTracks().length === 0) {
      this.patchBroadcast({ status: 'unsupported', message: 'Браузер не умеет стримить этот плеер. Используйте файл или звук вкладки.' });
      return;
    }
    this.patchBroadcast({ status: 'starting', message: 'Запускаем стрим плеера...' });
    try {
      if (element.paused) {
        await element.play();
      }
      await this.setLocalBroadcastStream(stream, label, 'Плеер сцены');
    } catch (error) {
      stopStreamTracks(stream);
      this.patchBroadcast({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось раздать плеер сцены.' });
    }
  }

  async startLocalAudioFileBroadcast(file: File): Promise<void> {
    if (!this.transport) {
      this.patchBroadcast({ status: 'unsupported', message: 'Сначала подключитесь к серверу мастера.' });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const element = new Audio(objectUrl);
    element.preload = 'auto';
    element.loop = true;
    element.volume = 1;
    const stream = captureMediaElementStream(element);
    if (!stream) {
      URL.revokeObjectURL(objectUrl);
      this.patchBroadcast({ status: 'unsupported', message: 'Браузер не умеет стримить локальный аудиофайл.' });
      return;
    }
    this.patchBroadcast({ status: 'starting', message: 'Запускаем локальный файл...' });
    try {
      await element.play();
      if (stream.getAudioTracks().length === 0) {
        throw new Error('В файле не найден аудиотрек.');
      }
      await this.setLocalBroadcastStream(stream, file.name || 'Локальный файл', 'Локальный файл');
      this.localBroadcastElement = element;
      this.localBroadcastObjectUrl = objectUrl;
    } catch (error) {
      element.pause();
      stopStreamTracks(stream);
      URL.revokeObjectURL(objectUrl);
      this.localBroadcastElement = null;
      this.localBroadcastObjectUrl = null;
      this.patchBroadcast({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось раздать локальный файл.' });
    }
  }

  async startDisplayAudioBroadcast(label = 'Звук вкладки'): Promise<void> {
    if (!this.transport) {
      this.patchBroadcast({ status: 'unsupported', message: 'Сначала подключитесь к серверу мастера.' });
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.patchBroadcast({ status: 'unsupported', message: 'Браузер не поддерживает захват звука вкладки.' });
      return;
    }
    this.patchBroadcast({ status: 'starting', message: 'Выберите вкладку или окно со звуком...' });
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        video: true
      });
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        stopStreamTracks(displayStream);
        this.patchBroadcast({ status: 'error', message: 'В выбранном источнике нет аудио. Включите Share tab audio.' });
        return;
      }
      const stream = new MediaStream(audioTracks);
      await this.setLocalBroadcastStream(stream, label, 'Звук вкладки');
      this.localCaptureStream = displayStream;
      displayStream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => this.stopBroadcast());
      });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError' || error.name === 'AbortError');
      this.patchBroadcast({
        status: denied ? 'idle' : 'error',
        message: denied ? 'Захват звука отменен.' : error instanceof Error ? error.message : 'Не удалось захватить звук вкладки.'
      });
    }
  }

  stopBroadcast(): void {
    if (this.localBroadcastStream) {
      this.transport?.removeMediaStream(this.localBroadcastStream);
    }
    this.stopLocalBroadcastTracks();
    this.patchBroadcast({
      status: 'idle',
      message: 'Стрим музыки выключен.',
      sourceLabel: ''
    });
  }

  setVolume(volume: number): void {
    const nextVolume = clampVolume(volume);
    if (this.broadcastGainNode) {
      this.broadcastGainNode.gain.value = nextVolume;
    }
    this.patchBroadcast({ volume: nextVolume });
  }

  removeRemotePeer(peerId: string): void {
    const element = this.remoteAudioElements.get(peerId);
    if (!element) return;
    element.pause();
    element.srcObject = null;
    this.remoteAudioElements.delete(peerId);
    this.patchBroadcast((state) => {
      const remotePeerIds = state.remotePeerIds.filter((item) => item !== peerId);
      return {
        ...state,
        remotePeerIds,
        status: remotePeerIds.length === 0 ? 'idle' : state.status,
        message: remotePeerIds.length === 0 ? 'Стрим музыки выключен.' : state.message
      };
    });
  }

  private async publishLocalStream(label = this.broadcastStore.getSnapshot().sourceLabel || 'Музыка сцены'): Promise<void> {
    if (!this.transport || !this.localBroadcastStream) return;
    await this.transport.publishMediaStream(this.localBroadcastStream, { kind: 'scene-audio', label });
  }

  private async setLocalBroadcastStream(sourceStream: MediaStream, label: string, source: string): Promise<void> {
    if (!this.transport) return;
    if (this.localBroadcastStream) {
      this.transport.removeMediaStream(this.localBroadcastStream);
    }
    this.stopLocalBroadcastTracks();
    const broadcastStream = this.createGainControlledStream(sourceStream);
    this.localSourceStream = sourceStream;
    this.localBroadcastStream = broadcastStream;
    sourceStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => this.stopBroadcast());
    });
    try {
      await this.publishLocalStream(label);
    } catch (error) {
      stopStreamTracks(broadcastStream);
      stopStreamTracks(sourceStream);
      this.localBroadcastStream = null;
      this.localSourceStream = null;
      throw error;
    }
    this.patchBroadcast({
      status: 'live',
      message: `${source}: ${label}`,
      sourceLabel: label
    });
  }

  private attachRemoteStream(peerId: string, stream: MediaStream, label = 'Музыка сцены'): void {
    const current = this.remoteAudioElements.get(peerId) ?? new Audio();
    current.autoplay = true;
    current.srcObject = stream;
    this.remoteAudioElements.set(peerId, current);
    void current.play().catch(() => {
      this.patchBroadcast({ message: 'Нажмите звук сцены, чтобы разблокировать входящую музыку.' });
    });
    this.patchBroadcast((state) => ({
      ...state,
      status: 'live',
      message: `Играет стрим: ${label}`,
      remotePeerIds: state.remotePeerIds.includes(peerId) ? state.remotePeerIds : [...state.remotePeerIds, peerId]
    }));
  }

  private stopLocalBroadcastTracks(): void {
    const tracks = new Set<MediaStreamTrack>();
    this.localBroadcastStream?.getTracks().forEach((track) => tracks.add(track));
    this.localSourceStream?.getTracks().forEach((track) => tracks.add(track));
    this.localCaptureStream?.getTracks().forEach((track) => tracks.add(track));
    tracks.forEach((track) => track.stop());
    this.localBroadcastStream = null;
    this.localSourceStream = null;
    this.localCaptureStream = null;
    this.localBroadcastElement?.pause();
    this.localBroadcastElement = null;
    if (this.localBroadcastObjectUrl) {
      URL.revokeObjectURL(this.localBroadcastObjectUrl);
      this.localBroadcastObjectUrl = null;
    }
    this.broadcastSourceNode?.disconnect();
    this.broadcastGainNode?.disconnect();
    void this.broadcastAudioContext?.close().catch(() => undefined);
    this.broadcastAudioContext = null;
    this.broadcastSourceNode = null;
    this.broadcastGainNode = null;
  }

  private clearRemoteStreams(): void {
    this.remoteAudioElements.forEach((element) => {
      element.pause();
      element.srcObject = null;
    });
    this.remoteAudioElements.clear();
    this.patchBroadcast({ remotePeerIds: [] });
  }

  private patchBroadcast(patch: Partial<SceneAudioBroadcastState> | ((state: SceneAudioBroadcastState) => SceneAudioBroadcastState)): void {
    if (typeof patch === 'function') {
      this.broadcastStore.update(patch);
      return;
    }
    this.broadcastStore.update((state) => ({ ...state, ...patch }));
  }

  private createGainControlledStream(sourceStream: MediaStream): MediaStream {
    if (sourceStream.getAudioTracks().length === 0) return sourceStream;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(sourceStream);
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = this.broadcastStore.getSnapshot().volume;
      source.connect(gain);
      gain.connect(destination);
      this.broadcastAudioContext = context;
      this.broadcastSourceNode = source;
      this.broadcastGainNode = gain;
      return destination.stream;
    } catch {
      return sourceStream;
    }
  }
}

function isSceneAudioMediaTransport(transport: SyncTransport | null): transport is SyncTransport & SceneAudioMediaTransport {
  return Boolean(
    transport &&
    'publishMediaStream' in transport &&
    'removeMediaStream' in transport &&
    'subscribeMediaStreams' in transport
  );
}

function isSceneAudioMetadata(value: unknown): value is { kind: 'scene-audio'; label: string } {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'scene-audio');
}

type CapturableMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureMediaElementStream(element: HTMLMediaElement): MediaStream | null {
  const capturable = element as CapturableMediaElement;
  const capture = capturable.captureStream ?? capturable.mozCaptureStream;
  return capture ? capture.call(capturable) : null;
}

function stopStreamTracks(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.72));
}
