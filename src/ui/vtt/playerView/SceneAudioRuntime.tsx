/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Volume2 } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { SceneMusicState } from '../../../domain/audio/sceneAudio';
import { audioService, sceneAudioBroadcastService } from '../../../services/serviceRegistry';

export function SceneAudioRuntime({ music }: { music: SceneMusicState }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioState = useStream(audioService.audio$);

  useEffect(() => {
    const detachAudio = audioService.attachSceneAudioElement(audioRef.current);
    const detachBroadcast = sceneAudioBroadcastService.attachSceneAudioElement(audioRef.current);
    return () => {
      detachAudio();
      detachBroadcast();
    };
  }, []);

  useEffect(() => {
    sceneAudioBroadcastService.setSceneMusicContext(music);
    void audioService.syncSceneMusic(music);
  }, [music]);

  const needsGesture = music.playing && Boolean(music.sourceUrl || music.assetId) && (
    audioState.sceneAudioStatus === 'locked' ||
    audioState.sceneAudioStatus === 'blocked' ||
    audioState.sceneAudioStatus === 'error'
  );
  const actionLabel = audioState.sceneAudioStatus === 'error' ? 'Повторить музыку' : 'Включить музыку';

  return (
    <>
      <audio ref={audioRef} aria-hidden="true" data-scene-audio-status={audioState.sceneAudioStatus} />
      {needsGesture && (
        <aside className="scene-audio-runtime" role="status" aria-live="polite" data-scene-audio-status={audioState.sceneAudioStatus}>
          <span className="scene-audio-runtime__message">{audioState.sceneAudioMessage}</span>
          <button type="button" onClick={() => void audioService.unlockSceneAudio()} title={actionLabel} aria-label={actionLabel}>
            <Volume2 size={15} />
            <span>{actionLabel}</span>
          </button>
        </aside>
      )}
    </>
  );
}
