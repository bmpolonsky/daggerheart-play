import { Store } from '../core/store/Store';
import { effectiveSceneMusicPosition, sceneMusicDisplayTitle } from '../domain/audio/sceneAudio';
import type { SceneMusicState } from '../domain/audio/sceneAudio';

export type SceneAudioStatus = 'idle' | 'locked' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';

export interface AudioLayerState {
  sceneAudioUnlocked: boolean;
  sceneAudioStatus: SceneAudioStatus;
  sceneAudioMessage: string;
}

const initialAudioLayerState: AudioLayerState = {
  sceneAudioUnlocked: false,
  sceneAudioStatus: 'idle',
  sceneAudioMessage: 'Звук сцены выключен.'
};

/** Scene music only. Voice and video live in MediaCallService. */
export class AudioService {
  private audioStore = new Store<AudioLayerState>(initialAudioLayerState);
  readonly audio$ = this.audioStore.toStream();
  private sceneAudioElement: HTMLAudioElement | null = null;
  private lastSceneMusic: SceneMusicState | null = null;

  attachSceneAudioElement(element: HTMLAudioElement | null): () => void {
    this.sceneAudioElement = element;
    if (element) {
      element.autoplay = true;
      element.preload = 'auto';
      element.loop = true;
      element.addEventListener('playing', this.handleScenePlaying);
      element.addEventListener('pause', this.handleScenePause);
      element.addEventListener('error', this.handleSceneError);
      if (this.lastSceneMusic) void this.syncSceneMusic(this.lastSceneMusic);
    }
    return () => {
      if (this.sceneAudioElement === element) this.sceneAudioElement = null;
      element?.removeEventListener('playing', this.handleScenePlaying);
      element?.removeEventListener('pause', this.handleScenePause);
      element?.removeEventListener('error', this.handleSceneError);
    };
  }

  async unlockSceneAudio(): Promise<void> {
    this.patchAudio({ sceneAudioUnlocked: true });
    if (this.lastSceneMusic) await this.syncSceneMusic(this.lastSceneMusic);
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
      try { element.currentTime = desiredPosition; } catch { /* Some streams cannot seek before metadata loads. */ }
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
      this.patchAudio({ sceneAudioStatus: 'blocked', sceneAudioMessage: autoplayBlockedMessage(error) });
    }
  }

  getSceneMusicPosition(): number {
    return Math.max(0, this.sceneAudioElement?.currentTime ?? this.lastSceneMusic?.position ?? 0);
  }

  private handleScenePlaying = () => this.patchAudio({ sceneAudioStatus: 'playing' });
  private handleScenePause = () => {
    if (!this.lastSceneMusic?.playing) this.patchAudio({ sceneAudioStatus: this.lastSceneMusic?.sourceUrl ? 'paused' : 'idle' });
  };
  private handleSceneError = () => this.patchAudio({ sceneAudioStatus: 'error', sceneAudioMessage: 'Не удалось загрузить музыку сцены.' });
  private patchAudio(patch: Partial<AudioLayerState>): void {
    this.audioStore.update((state) => ({ ...state, ...patch }));
  }
}

function autoplayBlockedMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'Браузер заблокировал автозапуск музыки. Нажмите, чтобы включить звук сцены.';
  }
  return error instanceof Error ? error.message : 'Браузер заблокировал автозапуск музыки.';
}
