/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Volume2 } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { SceneMusicState } from '../../../domain/audio/sceneAudio';
import { audioService, sceneAudioBroadcastService } from '../../../services/serviceRegistry';
import { Button } from '../../components/common/Button';
import type { TableViewRole } from './types';

export function SceneAudioRuntime({ music, role }: { music: SceneMusicState; role: TableViewRole }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioState = useStream(audioService.audio$);
  const broadcastState = useStream(sceneAudioBroadcastService.broadcast$);

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
    const playsLocally = role === 'gm' || music.deliveryMode === 'download';
    const localMusic = playsLocally ? music : { ...music, sourceUrl: '', assetId: undefined, playing: false };
    void audioService.syncSceneMusic(localMusic).then(() => {
      if (role !== 'gm') return;
      const broadcast = sceneAudioBroadcastService.broadcast$.get();
      if (music.deliveryMode !== 'broadcast' && broadcast.deliveryKind === 'scene-player') {
        sceneAudioBroadcastService.stopBroadcast();
      } else if (music.deliveryMode === 'broadcast' && music.playing && broadcast.deliveryKind !== 'scene-player') {
        void sceneAudioBroadcastService.startScenePlayerBroadcast(music.title || 'Музыка сцены');
      } else if (music.deliveryMode === 'broadcast' && !music.playing && broadcast.deliveryKind === 'scene-player') {
        sceneAudioBroadcastService.stopBroadcast();
      }
    });
  }, [music, role]);

  const needsGesture = (role === 'gm' || music.deliveryMode === 'download') && music.playing && Boolean(music.sourceUrl || music.assetId) && (
    audioState.sceneAudioStatus === 'locked' ||
    audioState.sceneAudioStatus === 'blocked' ||
    audioState.sceneAudioStatus === 'error'
  );
  const needsBroadcastGesture = role === 'player' && music.deliveryMode === 'broadcast' && broadcastState.remotePlaybackBlocked;
  const actionLabel = audioState.sceneAudioStatus === 'error' ? 'Повторить музыку' : 'Включить музыку';

  return (
    <>
      <audio ref={audioRef} aria-hidden="true" data-scene-audio-status={audioState.sceneAudioStatus} />
      {(needsGesture || needsBroadcastGesture) && (
        <aside className="scene-audio-runtime" role="status" aria-live="polite" data-scene-audio-status={needsBroadcastGesture ? 'blocked' : audioState.sceneAudioStatus}>
          <span className="scene-audio-runtime__message">{needsBroadcastGesture ? broadcastState.message : audioState.sceneAudioMessage}</span>
          <Button size="sm" variant="primary" noWrap type="button" onClick={() => void (needsBroadcastGesture ? sceneAudioBroadcastService.unlockRemotePlayback() : audioService.unlockSceneAudio())} title={actionLabel} aria-label={actionLabel}>
            <Volume2 size={15} aria-hidden="true" />
            <span>{actionLabel}</span>
          </Button>
        </aside>
      )}
    </>
  );
}
