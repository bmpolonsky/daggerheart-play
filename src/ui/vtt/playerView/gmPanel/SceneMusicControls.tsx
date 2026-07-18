/** @jsxImportSource preact */
import { FileAudio, Pause, Play, Radio, Square } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import type { SceneTableState } from '../../../../domain/rules/types';
import { audioService, sceneAudioBroadcastService, sceneTableService } from '../../../../services/serviceRegistry';
import { Button, Notice, RangeField, Surface } from '../../../components/common';

export function SceneMusicControls({ sceneTable }: { sceneTable: SceneTableState }) {
  const broadcastState = useStream(sceneAudioBroadcastService.broadcast$);
  const scene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? null;
  if (!scene) return null;

  const hasMusicFile = Boolean(scene.music.sourceUrl || scene.music.assetId);
  const musicTitle = scene.music.title || 'Файл не выбран';
  const sceneTransferFailed = sceneTable.musicDeliveryMode === 'broadcast'
    && broadcastState.requestedKind === 'scene-player'
    && (broadcastState.status === 'error' || broadcastState.status === 'unsupported');
  const sceneTransferPausedByTab = sceneTable.musicDeliveryMode === 'broadcast' && scene.music.playing && (
    broadcastState.deliveryKind === 'display' || broadcastState.requestedKind === 'display'
  );
  const musicStatus = sceneTransferPausedByTab
    ? 'Играет у мастера — передача игрокам приостановлена звуком вкладки'
    : sceneTransferFailed
    ? broadcastState.message
    : hasMusicFile
      ? (scene.music.playing ? 'Играет файл сцены' : 'Готов к запуску')
      : 'Выберите файл в сценах';
  const tabAudioStarting = broadcastState.tabAudioStatus === 'starting';
  const tabAudioLive = broadcastState.deliveryKind === 'display' && broadcastState.tabAudioStatus === 'live';
  const tabAudioFailed = broadcastState.tabAudioStatus === 'error' || broadcastState.tabAudioStatus === 'unsupported';
  const tabAudioStatus = broadcastState.tabAudioMessage;

  const toggleSceneMusic = () => {
    if (scene.music.playing) {
      sceneTableService.pauseSceneMusic(scene.id, audioService.getSceneMusicPosition());
      return;
    }
    sceneTableService.playSceneMusic(scene.id);
  };

  return (
    <div className="player-scene-audio">
      <Surface as="section" tone="subtle" padding="sm" className="player-scene-audio__block" aria-label="Музыка сцены">
        <div className="player-scene-audio__header">
          <FileAudio size={16} aria-hidden="true" />
          <div>
            <strong>Музыка сцены</strong>
            <span title={musicTitle}>{musicTitle}</span>
          </div>
        </div>
        <div className="player-scene-audio__controls" aria-label="Управление музыкой сцены">
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={!hasMusicFile}
            title={scene.music.playing ? 'Пауза' : 'Играть'}
            onClick={toggleSceneMusic}
            iconBefore={scene.music.playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          >
            {scene.music.playing ? 'Пауза' : 'Играть'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={!hasMusicFile}
            title="Остановить"
            onClick={() => sceneTableService.stopSceneMusic(scene.id)}
            iconBefore={<Square size={14} aria-hidden="true" />}
          >
            Стоп
          </Button>
        </div>
        <RangeField
          className="player-scene-audio__volume"
          label="Громкость"
          valueLabel={`${Math.round(scene.music.volume * 100)}%`}
          min="0"
          max="1"
          step="0.01"
          value={scene.music.volume}
          disabled={!hasMusicFile}
          aria-label="Громкость музыки сцены"
          onInput={(event) => sceneTableService.setSceneMusicVolume(scene.id, Number(event.currentTarget.value))}
        />
        <p className={`player-scene-audio__status ${sceneTransferFailed ? 'is-error' : ''}`} role="status">{musicStatus}</p>
      </Surface>

      <Surface as="section" tone="subtle" padding="sm" className="player-scene-audio__block" aria-label="Звук вкладки">
        <div className="player-scene-audio__header">
          <Radio size={16} aria-hidden="true" />
          <div>
            <strong>Звук вкладки</strong>
            <span title={tabAudioLive ? broadcastState.sourceLabel : undefined}>{tabAudioLive ? broadcastState.sourceLabel : 'Отдельная трансляция'}</span>
          </div>
        </div>
        <div className="player-scene-audio__controls">
          <Button
            size="sm"
            variant={tabAudioLive || tabAudioStarting ? 'danger' : 'secondary'}
            type="button"
            onClick={() => {
              if (tabAudioLive || tabAudioStarting) {
                sceneAudioBroadcastService.stopBroadcast('display');
                return;
              }
              void sceneAudioBroadcastService.startDisplayAudioBroadcast('Звук вкладки');
            }}
            iconBefore={tabAudioLive || tabAudioStarting ? <Square size={14} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
          >
            {tabAudioLive || tabAudioStarting ? 'Остановить трансляцию' : 'Начать трансляцию'}
          </Button>
        </div>
        <RangeField
          className="player-scene-audio__volume"
          label="Громкость"
          valueLabel={`${Math.round(broadcastState.tabAudioVolume * 100)}%`}
          min="0"
          max="1"
          step="0.01"
          value={broadcastState.tabAudioVolume}
          aria-label="Громкость звука вкладки"
          onInput={(event) => sceneAudioBroadcastService.setTabAudioVolume(Number(event.currentTarget.value))}
        />
        {tabAudioFailed
          ? <Notice tone="error">{tabAudioStatus}</Notice>
          : <p className="player-scene-audio__status" role="status">{tabAudioStatus}</p>}
      </Surface>
    </div>
  );
}
