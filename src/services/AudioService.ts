import { Store } from '../core/store/Store';
import { effectiveSceneMusicPosition, sceneMusicDisplayTitle } from '../domain/audio/sceneAudio';
import type { SceneMusicState } from '../domain/audio/sceneAudio';
import type { SyncTransport } from '../domain/tabletop/types';

export type SceneAudioStatus = 'idle' | 'locked' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
export type VoiceChatStatus = 'idle' | 'connecting' | 'live' | 'muted' | 'permission-denied' | 'unsupported' | 'error';

export interface AudioLayerState {
  sceneAudioUnlocked: boolean;
  sceneAudioStatus: SceneAudioStatus;
  sceneAudioMessage: string;
  voiceStatus: VoiceChatStatus;
  voiceMuted: boolean;
  voiceMessage: string;
  remoteVoicePeerIds: string[];
}

interface VoiceMediaTransport {
  publishMediaStream(stream: MediaStream, metadata?: { kind: 'voice'; label: string }): Promise<void>;
  removeMediaStream(stream: MediaStream): void;
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void;
}

const initialAudioLayerState: AudioLayerState = {
  sceneAudioUnlocked: false,
  sceneAudioStatus: 'idle',
  sceneAudioMessage: 'Звук сцены выключен.',
  voiceStatus: 'idle',
  voiceMuted: true,
  voiceMessage: 'Микрофон выключен.',
  remoteVoicePeerIds: []
};

export class AudioService {
  private audioStore = new Store<AudioLayerState>(initialAudioLayerState);
  readonly audio$ = this.audioStore.toStream();

  private sceneAudioElement: HTMLAudioElement | null = null;
  private lastSceneMusic: SceneMusicState | null = null;
  private voiceTransport: VoiceMediaTransport | null = null;
  private unsubscribeVoiceStreams: (() => void) | null = null;
  private localVoiceStream: MediaStream | null = null;
  private remoteAudioElements = new Map<string, HTMLAudioElement>();

  attachSceneAudioElement(element: HTMLAudioElement | null): () => void {
    this.sceneAudioElement = element;
    if (element) {
      element.autoplay = true;
      element.preload = 'auto';
      element.loop = true;
      element.addEventListener('playing', this.handleScenePlaying);
      element.addEventListener('pause', this.handleScenePause);
      element.addEventListener('error', this.handleSceneError);
      if (this.lastSceneMusic) {
        void this.syncSceneMusic(this.lastSceneMusic);
      }
    }
    return () => {
      if (this.sceneAudioElement === element) {
        this.sceneAudioElement = null;
      }
      element?.removeEventListener('playing', this.handleScenePlaying);
      element?.removeEventListener('pause', this.handleScenePause);
      element?.removeEventListener('error', this.handleSceneError);
    };
  }

  async unlockSceneAudio(): Promise<void> {
    this.patchAudio({ sceneAudioUnlocked: true });
    if (this.lastSceneMusic) {
      await this.syncSceneMusic(this.lastSceneMusic);
    }
  }

  async syncSceneMusic(music: SceneMusicState): Promise<void> {
    this.lastSceneMusic = music;
    const element = this.sceneAudioElement;
    if (!music.sourceUrl) {
      element?.pause();
      if (element) {
        element.removeAttribute('src');
        element.load();
      }
      this.patchAudio({
        sceneAudioStatus: music.assetId && music.playing ? 'loading' : 'idle',
        sceneAudioMessage: music.assetId && music.playing ? 'Загружаем музыку сцены.' : 'Музыка сцены не задана.'
      });
      return;
    }

    if (!element) {
      this.patchAudio({ sceneAudioStatus: music.playing ? 'loading' : 'paused', sceneAudioMessage: sceneMusicDisplayTitle(music) });
      return;
    }

    if (element.getAttribute('src') !== music.sourceUrl) {
      element.src = music.sourceUrl;
      element.load();
    }
    element.volume = music.volume;

    const desiredPosition = effectiveSceneMusicPosition(music);
    if (Number.isFinite(desiredPosition) && Math.abs(element.currentTime - desiredPosition) > 1.5) {
      try {
        element.currentTime = desiredPosition;
      } catch {
        // Some streams cannot seek until metadata is ready.
      }
    }

    if (!music.playing) {
      element.pause();
      this.patchAudio({ sceneAudioStatus: 'paused', sceneAudioMessage: sceneMusicDisplayTitle(music) });
      return;
    }

    this.patchAudio({ sceneAudioStatus: 'loading', sceneAudioMessage: sceneMusicDisplayTitle(music) });
    if (!element.paused) {
      this.patchAudio({ sceneAudioUnlocked: true, sceneAudioStatus: 'playing', sceneAudioMessage: sceneMusicDisplayTitle(music) });
      return;
    }
    try {
      await element.play();
      this.patchAudio({ sceneAudioUnlocked: true, sceneAudioStatus: 'playing', sceneAudioMessage: sceneMusicDisplayTitle(music) });
    } catch (error) {
      this.patchAudio({
        sceneAudioStatus: 'blocked',
        sceneAudioMessage: autoplayBlockedMessage(error)
      });
    }
  }

  getSceneMusicPosition(): number {
    return Math.max(0, this.sceneAudioElement?.currentTime ?? this.lastSceneMusic?.position ?? 0);
  }

  setVoiceTransport(transport: SyncTransport | null): void {
    const previousTransport = this.voiceTransport;
    const nextTransport = isVoiceMediaTransport(transport) ? transport : null;
    this.unsubscribeVoiceStreams?.();
    this.unsubscribeVoiceStreams = null;
    if (previousTransport && previousTransport !== nextTransport && this.localVoiceStream) {
      previousTransport.removeMediaStream(this.localVoiceStream);
    }
    if (previousTransport !== nextTransport) {
      this.clearRemoteVoiceStreams();
    }
    this.voiceTransport = nextTransport;
    if (!this.voiceTransport) {
      if (this.localVoiceStream) {
        this.stopLocalVoiceTracks();
      }
      this.patchAudio({
        voiceStatus: transport ? 'unsupported' : 'idle',
        voiceMuted: true,
        voiceMessage: transport ? 'P2P transport не поддерживает voice media.' : 'Микрофон выключен.'
      });
      return;
    }
    this.unsubscribeVoiceStreams = this.voiceTransport?.subscribeMediaStreams((stream, peerId, metadata) => {
      if (!isVoiceMetadata(metadata)) return;
      this.attachRemoteVoiceStream(peerId, stream);
    }) ?? null;
    if (this.localVoiceStream && this.voiceTransport) {
      void this.publishLocalVoiceStream();
    }
  }

  async toggleVoiceChat(label = 'Игрок'): Promise<void> {
    const state = this.audio$.get();
    if (state.voiceStatus === 'live' || state.voiceStatus === 'connecting') {
      this.muteVoiceChat();
      return;
    }
    if (state.voiceStatus === 'muted' && this.localVoiceStream) {
      await this.unmuteVoiceChat(label);
      return;
    }
    await this.startVoiceChat(label);
  }

  async startVoiceChat(label = 'Игрок'): Promise<void> {
    if (!this.voiceTransport) {
      this.patchAudio({ voiceStatus: 'unsupported', voiceMuted: true, voiceMessage: 'Сначала подключитесь к серверу мастера.' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.patchAudio({ voiceStatus: 'unsupported', voiceMuted: true, voiceMessage: 'Браузер не поддерживает getUserMedia.' });
      return;
    }
    await this.resumeRemoteVoicePlayback();
    this.patchAudio({ voiceStatus: 'connecting', voiceMuted: false, voiceMessage: 'Запрашиваем микрофон...' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      this.localVoiceStream = stream;
      await this.publishLocalVoiceStream(label);
      this.patchAudio({ voiceStatus: 'live', voiceMuted: false, voiceMessage: 'Микрофон включен.' });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.stopLocalVoiceTracks();
      this.patchAudio({
        voiceStatus: denied ? 'permission-denied' : 'error',
        voiceMuted: true,
        voiceMessage: denied ? 'Доступ к микрофону запрещен.' : error instanceof Error ? error.message : 'Не удалось включить микрофон.'
      });
    }
  }

  muteVoiceChat(): void {
    if (!this.localVoiceStream) {
      this.patchAudio({ voiceStatus: 'idle', voiceMuted: true, voiceMessage: 'Микрофон выключен.' });
      return;
    }
    this.localVoiceStream.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    this.patchAudio({ voiceStatus: 'muted', voiceMuted: true, voiceMessage: 'Микрофон заглушен.' });
  }

  async unmuteVoiceChat(label = 'Игрок'): Promise<void> {
    if (!this.localVoiceStream) {
      await this.startVoiceChat(label);
      return;
    }
    await this.resumeRemoteVoicePlayback();
    this.localVoiceStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    await this.publishLocalVoiceStream(label);
    this.patchAudio({ voiceStatus: 'live', voiceMuted: false, voiceMessage: 'Микрофон включен.' });
  }

  stopVoiceChat(): void {
    if (this.localVoiceStream) {
      this.voiceTransport?.removeMediaStream(this.localVoiceStream);
    }
    this.stopLocalVoiceTracks();
    this.patchAudio({ voiceStatus: 'idle', voiceMuted: true, voiceMessage: 'Микрофон выключен.' });
  }

  removeRemoteVoicePeer(peerId: string): void {
    const element = this.remoteAudioElements.get(peerId);
    if (!element) return;
    element.pause();
    element.srcObject = null;
    this.remoteAudioElements.delete(peerId);
    this.patchAudio((state) => ({
      ...state,
      remoteVoicePeerIds: state.remoteVoicePeerIds.filter((item) => item !== peerId)
    }));
  }

  private async publishLocalVoiceStream(label = 'Игрок'): Promise<void> {
    if (!this.voiceTransport || !this.localVoiceStream) return;
    await this.voiceTransport.publishMediaStream(this.localVoiceStream, { kind: 'voice', label });
  }

  private attachRemoteVoiceStream(peerId: string, stream: MediaStream): void {
    const current = this.remoteAudioElements.get(peerId) ?? new Audio();
    current.autoplay = true;
    current.setAttribute('playsinline', 'true');
    current.srcObject = stream;
    this.remoteAudioElements.set(peerId, current);
    void this.playRemoteVoiceElement(current);
    this.patchAudio((state) => ({
      ...state,
      remoteVoicePeerIds: state.remoteVoicePeerIds.includes(peerId) ? state.remoteVoicePeerIds : [...state.remoteVoicePeerIds, peerId]
    }));
  }

  private stopLocalVoiceTracks(): void {
    this.localVoiceStream?.getTracks().forEach((track) => track.stop());
    this.localVoiceStream = null;
  }

  private clearRemoteVoiceStreams(): void {
    this.remoteAudioElements.forEach((element) => {
      element.pause();
      element.srcObject = null;
    });
    this.remoteAudioElements.clear();
    this.patchAudio({ remoteVoicePeerIds: [] });
  }

  private async resumeRemoteVoicePlayback(): Promise<void> {
    await Promise.all(Array.from(this.remoteAudioElements.values(), (element) => this.playRemoteVoiceElement(element)));
  }

  private async playRemoteVoiceElement(element: HTMLAudioElement): Promise<void> {
    try {
      await element.play();
    } catch {
      this.patchAudio({ voiceMessage: 'Нажмите микрофон, чтобы разблокировать входящий голос.' });
    }
  }

  private handleScenePlaying = () => {
    this.patchAudio({ sceneAudioStatus: 'playing' });
  };

  private handleScenePause = () => {
    if (this.lastSceneMusic?.playing) return;
    this.patchAudio({ sceneAudioStatus: this.lastSceneMusic?.sourceUrl ? 'paused' : 'idle' });
  };

  private handleSceneError = () => {
    this.patchAudio({ sceneAudioStatus: 'error', sceneAudioMessage: 'Не удалось загрузить музыку сцены.' });
  };

  private patchAudio(patch: Partial<AudioLayerState> | ((state: AudioLayerState) => AudioLayerState)): void {
    if (typeof patch === 'function') {
      this.audioStore.update(patch);
      return;
    }
    this.audioStore.update((state) => ({ ...state, ...patch }));
  }
}

function isVoiceMediaTransport(transport: SyncTransport | null): transport is SyncTransport & VoiceMediaTransport {
  return Boolean(
    transport &&
    'publishMediaStream' in transport &&
    'removeMediaStream' in transport &&
    'subscribeMediaStreams' in transport
  );
}

function isVoiceMetadata(value: unknown): value is { kind: 'voice'; label?: string } {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'voice');
}

function autoplayBlockedMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'Браузер заблокировал автозапуск музыки. Нажмите, чтобы включить звук сцены.';
  }
  return error instanceof Error ? error.message : 'Браузер заблокировал автозапуск музыки.';
}
