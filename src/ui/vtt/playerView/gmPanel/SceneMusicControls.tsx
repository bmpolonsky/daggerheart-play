/** @jsxImportSource preact */
import { FileAudio, Pause, Play, Radio, Square, Volume2 } from "lucide-react";
import { useStream } from "../../../../core/hooks/useStream";
import type { SceneTableState } from "../../../../domain/rules/types";
import { audioService, sceneAudioBroadcastService, sceneTableService } from "../../../../services/serviceRegistry";
import { Button } from "../../../components/common/Button";

export function SceneMusicControls({ sceneTable }: { sceneTable: SceneTableState }) {
  const broadcastState = useStream(sceneAudioBroadcastService.broadcast$);
  const scene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? null;
  const broadcastStarting = broadcastState.status === 'starting';
  const broadcastLive = broadcastState.status === 'live';
  if (!scene) return null;

  const hasMusicFile = Boolean(scene.music.sourceUrl || scene.music.assetId);
  const musicTitle = scene.music.title || 'Файл не выбран';
  const musicStatus = hasMusicFile ? (scene.music.playing ? 'Играет файл сцены' : 'Готов к запуску') : 'Выберите файл в сценах';
  const toggleSceneMusic = () => {
    if (scene.music.playing) {
      sceneTableService.pauseSceneMusic(scene.id, audioService.getSceneMusicPosition());
      sceneAudioBroadcastService.stopBroadcast();
      return;
    }
    sceneTableService.playSceneMusic(scene.id);
    window.setTimeout(() => {
      sceneAudioBroadcastService.setVolume(scene.music.volume);
      void sceneAudioBroadcastService.startScenePlayerBroadcast(musicTitle);
    }, 0);
  };

  return (
    <section className="player-scene-audio" aria-label="Музыка сцены">
      <div className="player-scene-audio__row player-scene-audio__row--file">
        <div className="player-scene-audio__header">
          <FileAudio size={16} />
          <div>
            <strong>Файл сцены</strong>
            <span title={musicTitle}>{musicTitle}</span>
          </div>
        </div>
        <div className="player-scene-audio__controls" aria-label="Управление файлом сцены">
          <Button size="sm" variant="secondary" type="button" disabled={!hasMusicFile} title={scene.music.playing ? 'Pause' : 'Play'} onClick={toggleSceneMusic} iconBefore={scene.music.playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}>
            {scene.music.playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="ghost" type="button" disabled={!hasMusicFile} title="Stop" onClick={() => {
            sceneTableService.stopSceneMusic(scene.id);
            sceneAudioBroadcastService.stopBroadcast();
          }} iconBefore={<Square size={14} aria-hidden="true" />}>
            Stop
          </Button>
          <label className="player-scene-audio__volume" title="Громкость файла сцены">
            <Volume2 size={13} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={scene.music.volume}
              disabled={!hasMusicFile}
              aria-label="Громкость файла сцены"
              onInput={(event) => {
                const nextVolume = Number(event.currentTarget.value);
                sceneTableService.setSceneMusicVolume(scene.id, nextVolume);
                sceneAudioBroadcastService.setVolume(nextVolume);
              }}
            />
          </label>
        </div>
        <p className="player-scene-audio__status">{musicStatus}</p>
        <div className="player-scene-audio__stream" aria-label="Управление стримом">
          <Button
            size="sm"
            variant={broadcastLive || broadcastStarting ? 'danger' : 'secondary'}
            type="button"
            title={broadcastLive || broadcastStarting ? 'Остановить стрим' : 'Транслировать системный звук/вкладку'}
            onClick={() => {
              if (broadcastLive || broadcastStarting) {
                sceneAudioBroadcastService.stopBroadcast();
                return;
              }
                void sceneAudioBroadcastService.startDisplayAudioBroadcast('Стрим');
              }}
            iconBefore={broadcastLive || broadcastStarting ? <Square size={14} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
          >
            {broadcastLive || broadcastStarting ? 'Stop' : 'Стрим'}
          </Button>
        </div>
      </div>
    </section>
  );
}
