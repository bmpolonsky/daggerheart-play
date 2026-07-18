/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Volume2 } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { SceneMusicDeliveryMode, SceneMusicState } from '../../../domain/audio/sceneAudio';
import { audioService, sceneAudioBroadcastService } from '../../../services/serviceRegistry';
import { Button } from '../../components/common/Button';
import type { TableViewRole } from './types';

export function SceneAudioRuntime({
  music,
  musicDeliveryMode,
  role
}: {
  music: SceneMusicState;
  musicDeliveryMode: SceneMusicDeliveryMode;
  role: TableViewRole;
}) {
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
    const playsLocally = role === 'gm' || musicDeliveryMode === 'download';
    const localMusic = playsLocally ? music : { ...music, sourceUrl: '', assetId: undefined, playing: false };
    void audioService.syncSceneMusic(localMusic);
  }, [music, musicDeliveryMode, role]);

  useEffect(() => {
    if (role !== 'gm') return;
    const tabAudioOwnsTransport = broadcastState.deliveryKind === 'display' || broadcastState.requestedKind === 'display';
    const localFileOwnsTransport = broadcastState.deliveryKind === 'local-file' || broadcastState.requestedKind === 'local-file';
    if (tabAudioOwnsTransport || localFileOwnsTransport) return;
    if (musicDeliveryMode !== 'broadcast') {
      sceneAudioBroadcastService.stopBroadcast('scene-player');
      return;
    }
    if (music.playing) {
      if (broadcastState.deliveryKind !== 'scene-player' && broadcastState.requestedKind !== 'scene-player') {
        void sceneAudioBroadcastService.startScenePlayerBroadcast(music.title || 'Музыка сцены');
      } else {
        sceneAudioBroadcastService.setSceneMusicBroadcastVolume(music.volume);
      }
      return;
    }
    sceneAudioBroadcastService.stopBroadcast('scene-player');
  }, [broadcastState.deliveryKind, broadcastState.requestedKind, music.playing, music.title, music.volume, musicDeliveryMode, role]);

  const needsGesture = (role === 'gm' || musicDeliveryMode === 'download') && music.playing && Boolean(music.sourceUrl || music.assetId) && (
    audioState.sceneAudioStatus === 'locked' ||
    audioState.sceneAudioStatus === 'blocked' ||
    audioState.sceneAudioStatus === 'error'
  );
  const needsBroadcastGesture = role === 'player' && broadcastState.remotePlaybackBlocked;
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
