import { Store } from '../core/store/Store';
import type { SceneMusicState } from '../domain/audio/sceneAudio';
import type { SyncTransport } from '../domain/tabletop/types';

export type SceneAudioBroadcastStatus = 'idle' | 'starting' | 'live' | 'unsupported' | 'error';

export interface SceneAudioBroadcastState {
  status: SceneAudioBroadcastStatus;
  message: string;
  sourceLabel: string;
  volume: number;
  tabAudioVolume: number;
  tabAudioStatus: SceneAudioBroadcastStatus;
  tabAudioMessage: string;
  remotePeerIds: string[];
  deliveryKind: 'none' | 'scene-player' | 'display' | 'local-file';
  requestedKind: 'none' | 'scene-player' | 'display' | 'local-file';
  remotePlaybackBlocked: boolean;
}

interface SceneAudioMediaTransport {
  publishMediaStream(stream: MediaStream, metadata?: { kind: 'scene-audio'; label: string; deliveryKind: SceneAudioBroadcastState['deliveryKind'] }): Promise<void>;
  removeMediaStream(stream: MediaStream): void;
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
}

const initialBroadcastState: SceneAudioBroadcastState = {
  status: 'idle',
  message: 'Передача звука выключена.',
  sourceLabel: '',
  volume: 0.72,
  tabAudioVolume: 0.72,
  tabAudioStatus: 'idle',
  tabAudioMessage: 'Трансляция выключена.',
  remotePeerIds: [],
  deliveryKind: 'none',
  requestedKind: 'none',
  remotePlaybackBlocked: false
};

export class SceneAudioBroadcastService {
  private broadcastStore = new Store<SceneAudioBroadcastState>(initialBroadcastState);
  readonly broadcast$ = this.broadcastStore.toStream();

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
        message: transport ? 'P2P-подключение не поддерживает передачу звука.' : 'Передача звука выключена.',
        sourceLabel: '',
        deliveryKind: 'none',
        requestedKind: 'none',
        tabAudioStatus: 'idle',
        tabAudioMessage: 'Трансляция выключена.'
      });
      return;
    }
    this.unsubscribeStreams = this.transport.subscribeMediaStreams((stream, peerId, metadata) => {
      if (!isSceneAudioMetadata(metadata)) return;
      this.attachRemoteStream(peerId, stream, metadata.label, metadata.deliveryKind);
    });
    if (this.localBroadcastStream) {
      void this.publishLocalStream();
    }
  }

  async startScenePlayerBroadcast(label = 'Музыка сцены'): Promise<void> {
    this.patchBroadcast({ requestedKind: 'scene-player' });
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
    let stream: MediaStream | null;
    try {
      stream = captureMediaElementStream(element);
    } catch (error) {
      this.patchBroadcast({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось получить звук плеера сцены.'
      });
      return;
    }
    if (!stream || stream.getAudioTracks().length === 0) {
      this.patchBroadcast({ status: 'unsupported', message: 'Браузер не умеет передавать звук плеера во время воспроизведения. Выберите загрузку файла в настройках.' });
      return;
    }
    this.setSceneMusicBroadcastVolume(this.sceneMusic?.volume ?? this.broadcastStore.get().volume);
    this.patchBroadcast({ status: 'starting', message: 'Начинаем передачу музыки сцены...' });
    try {
      if (element.paused) {
        await element.play();
      }
      await this.setLocalBroadcastStream(stream, label, 'Плеер сцены', 'scene-player');
    } catch (error) {
      stopStreamTracks(stream);
      this.patchBroadcast({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось раздать плеер сцены.' });
    }
  }

  async startLocalAudioFileBroadcast(file: File): Promise<void> {
    this.patchBroadcast({ requestedKind: 'local-file' });
    if (!this.transport) {
      this.patchBroadcast({ status: 'unsupported', message: 'Сначала подключитесь к серверу мастера.' });
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const element = new Audio(objectUrl);
    element.preload = 'auto';
    element.loop = true;
    element.volume = 1;
    let stream: MediaStream | null;
    try {
      stream = captureMediaElementStream(element);
    } catch (error) {
      element.pause();
      URL.revokeObjectURL(objectUrl);
      this.patchBroadcast({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось получить звук локального файла.' });
      return;
    }
    if (!stream) {
      URL.revokeObjectURL(objectUrl);
      this.patchBroadcast({ status: 'unsupported', message: 'Браузер не умеет передавать локальный аудиофайл во время воспроизведения.' });
      return;
    }
    this.patchBroadcast({ status: 'starting', message: 'Запускаем локальный файл...' });
    try {
      await element.play();
      if (stream.getAudioTracks().length === 0) {
        throw new Error('В файле не найден аудиотрек.');
      }
      await this.setLocalBroadcastStream(stream, file.name || 'Локальный файл', 'Локальный файл', 'local-file');
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
    this.patchBroadcast({
      requestedKind: 'display',
      tabAudioStatus: 'starting',
      tabAudioMessage: 'Выберите вкладку или окно со звуком...'
    });
    if (!this.transport) {
      this.patchBroadcast({
        status: 'unsupported',
        message: 'Сначала подключитесь к серверу мастера.',
        requestedKind: 'none',
        tabAudioStatus: 'unsupported',
        tabAudioMessage: 'Сначала подключитесь к серверу мастера.'
      });
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.patchBroadcast({
        status: 'unsupported',
        message: 'Браузер не поддерживает захват звука вкладки.',
        requestedKind: 'none',
        tabAudioStatus: 'unsupported',
        tabAudioMessage: 'Браузер не поддерживает захват звука вкладки.'
      });
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
        const message = 'В выбранном источнике нет аудио. Включите передачу звука вкладки в окне выбора.';
        this.patchBroadcast({
          status: 'error',
          message,
          requestedKind: 'none',
          tabAudioStatus: 'error',
          tabAudioMessage: message
        });
        return;
      }
      const stream = new MediaStream(audioTracks);
      await this.setLocalBroadcastStream(stream, label, 'Звук вкладки', 'display');
      this.localCaptureStream = displayStream;
      displayStream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => this.stopBroadcast('display'));
      });
      this.patchBroadcast({
        tabAudioStatus: 'live',
        tabAudioMessage: `Передаётся: ${label}`
      });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError' || error.name === 'AbortError');
      const message = denied ? 'Захват звука отменен.' : error instanceof Error ? error.message : 'Не удалось захватить звук вкладки.';
      this.patchBroadcast({
        status: denied ? 'idle' : 'error',
        message,
        requestedKind: 'none',
        tabAudioStatus: denied ? 'idle' : 'error',
        tabAudioMessage: message
      });
    }
  }

  stopBroadcast(expectedKind?: Exclude<SceneAudioBroadcastState['deliveryKind'], 'none'>): void {
    const state = this.broadcastStore.get();
    if (expectedKind && state.deliveryKind !== expectedKind && state.requestedKind !== expectedKind) return;
    const stoppedTabAudio = state.deliveryKind === 'display' || state.requestedKind === 'display';
    if (this.localBroadcastStream) {
      this.transport?.removeMediaStream(this.localBroadcastStream);
    }
    this.stopLocalBroadcastTracks();
    this.patchBroadcast({
      status: 'idle',
      message: 'Передача звука выключена.',
      sourceLabel: '',
      deliveryKind: 'none',
      requestedKind: 'none',
      ...(stoppedTabAudio ? { tabAudioStatus: 'idle' as const, tabAudioMessage: 'Трансляция выключена.' } : {})
    });
  }

  setVolume(volume: number): void {
    if (this.broadcastStore.get().deliveryKind === 'display' || this.broadcastStore.get().requestedKind === 'display') {
      this.setTabAudioVolume(volume);
      return;
    }
    this.setSceneMusicBroadcastVolume(volume);
  }

  setSceneMusicBroadcastVolume(volume: number): void {
    const nextVolume = clampVolume(volume);
    const state = this.broadcastStore.get();
    if (this.broadcastGainNode && (state.deliveryKind === 'scene-player' || state.requestedKind === 'scene-player')) {
      this.broadcastGainNode.gain.value = nextVolume;
    }
    this.patchBroadcast({ volume: nextVolume });
  }

  setTabAudioVolume(volume: number): void {
    const nextVolume = clampVolume(volume);
    const state = this.broadcastStore.get();
    if (this.broadcastGainNode && (state.deliveryKind === 'display' || state.requestedKind === 'display')) {
      this.broadcastGainNode.gain.value = nextVolume;
    }
    this.patchBroadcast({ tabAudioVolume: nextVolume });
  }

  async unlockRemotePlayback(): Promise<void> {
    const results = await Promise.allSettled(Array.from(this.remoteAudioElements.values(), (element) => element.play()));
    const blocked = results.some((result) => result.status === 'rejected');
    this.patchBroadcast({
      remotePlaybackBlocked: blocked,
      message: blocked ? 'Браузер не разрешил включить входящую музыку.' : this.broadcastStore.get().message
    });
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
        message: remotePeerIds.length === 0 ? 'Передача звука выключена.' : state.message,
        requestedKind: remotePeerIds.length === 0 ? 'none' : state.requestedKind
      };
    });
  }

  private async publishLocalStream(label = this.broadcastStore.get().sourceLabel || 'Музыка сцены'): Promise<void> {
    if (!this.transport || !this.localBroadcastStream) return;
    await this.transport.publishMediaStream(this.localBroadcastStream, {
      kind: 'scene-audio',
      label,
      deliveryKind: this.broadcastStore.get().deliveryKind
    });
  }

  private async setLocalBroadcastStream(sourceStream: MediaStream, label: string, source: string, deliveryKind: Exclude<SceneAudioBroadcastState['deliveryKind'], 'none'>): Promise<void> {
    if (!this.transport) return;
    if (this.localBroadcastStream) {
      this.transport.removeMediaStream(this.localBroadcastStream);
    }
    this.stopLocalBroadcastTracks();
    const sourceVolume = deliveryKind === 'display'
      ? this.broadcastStore.get().tabAudioVolume
      : deliveryKind === 'scene-player'
        ? this.sceneMusic?.volume ?? this.broadcastStore.get().volume
        : this.broadcastStore.get().volume;
    const broadcastStream = this.createGainControlledStream(sourceStream, sourceVolume);
    applyMusicContentHint(broadcastStream);
    this.localSourceStream = sourceStream;
    this.localBroadcastStream = broadcastStream;
    this.patchBroadcast({ deliveryKind, requestedKind: deliveryKind });
    sourceStream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => this.stopBroadcast(deliveryKind));
    });
    try {
      await this.publishLocalStream(label);
    } catch (error) {
      stopStreamTracks(broadcastStream);
      stopStreamTracks(sourceStream);
      this.localBroadcastStream = null;
      this.localSourceStream = null;
      this.patchBroadcast({ deliveryKind: 'none' });
      throw error;
    }
    this.patchBroadcast({
      status: 'live',
      message: `${source}: ${label}`,
      sourceLabel: label,
      deliveryKind,
      requestedKind: deliveryKind
    });
  }

  private attachRemoteStream(peerId: string, stream: MediaStream, label = 'Музыка сцены', deliveryKind: SceneAudioBroadcastState['deliveryKind'] = 'scene-player'): void {
    const current = this.remoteAudioElements.get(peerId) ?? new Audio();
    current.autoplay = true;
    current.srcObject = stream;
    this.remoteAudioElements.set(peerId, current);
    void current.play().then(() => {
      this.patchBroadcast({ remotePlaybackBlocked: false });
    }).catch(() => {
      this.patchBroadcast({
        remotePlaybackBlocked: true,
        message: 'Нажмите звук сцены, чтобы разблокировать входящую музыку.'
      });
    });
    this.patchBroadcast((state) => ({
      ...state,
      status: 'live',
      message: `Передаётся: ${label}`,
      deliveryKind,
      requestedKind: deliveryKind,
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
    this.patchBroadcast({ remotePeerIds: [], remotePlaybackBlocked: false });
  }

  private patchBroadcast(patch: Partial<SceneAudioBroadcastState> | ((state: SceneAudioBroadcastState) => SceneAudioBroadcastState)): void {
    if (typeof patch === 'function') {
      this.broadcastStore.update(patch);
      return;
    }
    this.broadcastStore.update((state) => ({ ...state, ...patch }));
  }

  private createGainControlledStream(sourceStream: MediaStream, volume: number): MediaStream {
    if (sourceStream.getAudioTracks().length === 0) return sourceStream;
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(sourceStream);
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = clampVolume(volume);
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

function isSceneAudioMetadata(value: unknown): value is { kind: 'scene-audio'; label: string; deliveryKind?: SceneAudioBroadcastState['deliveryKind'] } {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'scene-audio');
}

function applyMusicContentHint(stream: MediaStream): void {
  stream.getAudioTracks().forEach((track) => {
    track.contentHint = 'music';
  });
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
