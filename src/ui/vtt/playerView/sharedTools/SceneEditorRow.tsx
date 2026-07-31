/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Eye, LocateFixed, RotateCcw, Trash2 } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import type { SceneTableState } from '../../../../domain/rules/types';
import { DEFAULT_SCENE_HEIGHT, DEFAULT_SCENE_WIDTH } from '../../../../domain/tabletop/logic';
import { buildPlayerTokens, type PlayerViewToken } from '../../../../domain/tabletop/playerView';
import {
  DEFAULT_SCENE_BACKGROUND_FRAMING,
  MAX_SCENE_BACKGROUND_ZOOM,
  MIN_SCENE_BACKGROUND_ZOOM,
  normalizeSceneBackgroundFraming,
  sceneBackgroundTransform
} from '../../../../domain/tabletop/sceneBackground';
import { assetService, characterService, encounterService, gameService, sceneTableService } from '../../../../services/serviceRegistry';
import {
  Button,
  ConfirmDialog,
  FilePicker,
  IconButton,
  ImageFilePicker,
  RangeField,
  SectionHeader,
  SelectField,
  TextField,
  Toolbar
} from '../../../components/common';
import { cssImageUrl } from '../helpers';

export function SceneEditorRow({
  scene,
  canDelete,
  isActive,
  isLive
}: {
  scene: SceneTableState['scenes'][string];
  canDelete: boolean;
  isActive: boolean;
  isLive: boolean;
}) {
  const [backgroundObjectUrl, setBackgroundObjectUrl] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const characters = useStream(characterService.characters$);
  const encounter = useStream(encounterService.encounter$);

  useEffect(() => {
    if (!scene.backgroundAssetId) {
      setBackgroundObjectUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void assetService.getObjectUrl(scene.backgroundAssetId).then((url) => {
      objectUrl = url;
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      setBackgroundObjectUrl(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scene.backgroundAssetId]);

  const selectBackgroundImage = async (file: File | null | undefined) => {
    if (!file) return;
    const asset = await assetService.saveFile(file);
    sceneTableService.updateScene(scene.id, { backgroundAssetId: asset.id, backgroundUrl: '' });
  };

  const selectMusicFile = async (file: File | null | undefined) => {
    if (!file) return;
    const asset = await assetService.saveFile(file);
    sceneTableService.setSceneMusicTrack(scene.id, { assetId: asset.id, sourceUrl: '', title: file.name });
  };
  const clearBackgroundImage = () => {
    sceneTableService.updateScene(scene.id, { backgroundAssetId: undefined, backgroundUrl: '' });
  };
  const clearMusicFile = () => {
    sceneTableService.setSceneMusicTrack(scene.id, { sourceUrl: '', title: '' });
  };
  const previewUrl = backgroundObjectUrl || scene.backgroundUrl;
  const previewTokens = buildPlayerTokens(scene.tokens, characters.entities, encounter, 'gm');
  const backgroundFraming = normalizeSceneBackgroundFraming(scene.backgroundFraming);
  const musicTitle = scene.music.title || 'Не выбрана';
  const publishScene = () => {
    if (sceneTableService.publishScene(scene.id)) gameService.startScene(scene.name);
  };
  const updateBackgroundFraming = (patch: Partial<typeof backgroundFraming>) => {
    sceneTableService.updateScene(scene.id, {
      backgroundFraming: normalizeSceneBackgroundFraming({ ...backgroundFraming, ...patch })
    });
  };
  const framingIsCustom = backgroundFraming.fit !== DEFAULT_SCENE_BACKGROUND_FRAMING.fit
    || backgroundFraming.zoom !== DEFAULT_SCENE_BACKGROUND_FRAMING.zoom
    || backgroundFraming.offsetX !== DEFAULT_SCENE_BACKGROUND_FRAMING.offsetX
    || backgroundFraming.offsetY !== DEFAULT_SCENE_BACKGROUND_FRAMING.offsetY;

  return (
    <section className="player-tools-detail-editor player-tools-scene-editor" aria-label={`Редактор сцены ${scene.name}`}>
      <SectionHeader
        eyebrow={isLive ? 'Показана игрокам' : isActive ? 'Рабочая сцена' : 'Сцена подготовки'}
        title={scene.name || 'Без названия'}
        actions={(
          <Toolbar aria-label="Действия сцены">
            {!isActive && (
              <Button
                variant="secondary"
                size="sm"
                title="Добавлять персонажей и противников на эту сцену, не переключая экран игроков"
                iconBefore={<LocateFixed size={15} aria-hidden="true" />}
                onClick={() => sceneTableService.setActiveScene(scene.id)}
              >
                Сделать рабочей
              </Button>
            )}
            {!isLive && <Button variant="primary" size="sm" iconBefore={<Eye size={15} />} onClick={publishScene}>Показать игрокам</Button>}
            <Button size="sm" iconBefore={<Copy size={14} />} onClick={() => sceneTableService.duplicateScene(scene.id)}>Копия</Button>
            <IconButton variant="danger" size="sm" type="button" onClick={() => setDeleteOpen(true)} disabled={!canDelete} title={canDelete ? 'Удалить сцену' : 'Нельзя удалить последнюю сцену'} aria-label="Удалить сцену">
              <Trash2 size={14} aria-hidden="true" />
            </IconButton>
          </Toolbar>
        )}
      />
      <div className="player-tools-scene-editor__workspace">
        <div className="player-tools-scene-visual">
          <ImageFilePicker
            className="player-tools-scene-preview"
            label={scene.mode === 'tactical' ? 'Карта поля' : 'Фон сцены'}
            imageUrl={previewUrl}
            aspectRatio="16 / 9"
            previewContent={previewUrl ? <SceneDisplayPreview imageUrl={previewUrl} scene={scene} tokens={previewTokens} /> : undefined}
            onFileSelect={selectBackgroundImage}
            onClear={clearBackgroundImage}
          />
        </div>
        <div className="player-tools-scene-editor__fields">
          <section className="player-tools-scene-editor__section" aria-label="Основное">
            <SectionHeader title="Основное" />
            <TextField label="Название" value={scene.name} onInput={(event) => sceneTableService.updateScene(scene.id, { name: event.currentTarget.value })} />
            <TextField label="Подзаголовок" value={scene.subtitle} placeholder="Короткая строка для игроков" onInput={(event) => sceneTableService.updateScene(scene.id, { subtitle: event.currentTarget.value })} />
          </section>
          <section className="player-tools-scene-editor__section" aria-label="Изображение">
            <SectionHeader title="Изображение" />
            <div className="player-tools-scene-framing">
              <SelectField
                label="Размещение"
                hint={scene.mode === 'tactical'
                  ? 'Привязано к полю и токенам.'
                  : 'Заполняет экран за интерфейсом.'}
                value={scene.mode}
                onChange={(event) => sceneTableService.updateScene(scene.id, {
                  mode: event.currentTarget.value === 'tactical' ? 'tactical' : 'scene'
                })}
              >
                <option value="scene">Фон экрана</option>
                <option value="tactical">Поле с токенами</option>
              </SelectField>
              {previewUrl && (
                <div className="player-tools-scene-framing__frame">
                  <SelectField
                    label="Базовый размер"
                    hint="От него считаются масштаб и положение."
                    value={backgroundFraming.fit}
                    onChange={(event) => updateBackgroundFraming({
                      fit: event.currentTarget.value === 'fit' ? 'fit' : 'fill'
                    })}
                  >
                    <option value="fit">Показать целиком</option>
                    <option value="fill">Заполнить область</option>
                  </SelectField>
                  <div className="player-tools-scene-framing__sliders">
                    <RangeField
                      label="Масштаб"
                      aria-label="Масштаб фона"
                      min={MIN_SCENE_BACKGROUND_ZOOM}
                      max={MAX_SCENE_BACKGROUND_ZOOM}
                      step={0.05}
                      value={backgroundFraming.zoom}
                      valueLabel={`${Math.round(backgroundFraming.zoom * 100)}%`}
                      size="compact"
                      onInput={(event) => updateBackgroundFraming({ zoom: event.currentTarget.valueAsNumber })}
                    />
                    <RangeField
                      label="Горизонталь"
                      aria-label="Положение фона по горизонтали"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={backgroundFraming.offsetX}
                      valueLabel={framingOffsetLabel(backgroundFraming.offsetX, '←', '→')}
                      size="compact"
                      onInput={(event) => updateBackgroundFraming({ offsetX: event.currentTarget.valueAsNumber })}
                    />
                    <RangeField
                      label="Вертикаль"
                      aria-label="Положение фона по вертикали"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={backgroundFraming.offsetY}
                      valueLabel={framingOffsetLabel(backgroundFraming.offsetY, '↑', '↓')}
                      size="compact"
                      onInput={(event) => updateBackgroundFraming({ offsetY: event.currentTarget.valueAsNumber })}
                    />
                  </div>
                  {framingIsCustom && (
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      iconBefore={<RotateCcw size={13} aria-hidden="true" />}
                      onClick={() => updateBackgroundFraming({
                        ...DEFAULT_SCENE_BACKGROUND_FRAMING
                      })}
                    >
                      Сбросить
                    </Button>
                  )}
                </div>
              )}
            </div>
          </section>
          <section className="player-tools-scene-editor__section" aria-label="Музыка">
            <SectionHeader title="Музыка" />
            <FilePicker
              className="player-tools-scene-music-picker"
              label="Трек"
              accept="audio/*"
              valueLabel={scene.music.assetId || scene.music.sourceUrl || scene.music.title ? musicTitle : ''}
              emptyLabel="Выбрать трек"
              aspectRatio="1 / 1"
              icon="music"
              onFileSelect={selectMusicFile}
              onClear={clearMusicFile}
            />
          </section>
        </div>
      </div>
      {deleteOpen && (
        <ConfirmDialog
          title={`Удалить сцену «${scene.name || 'Без названия'}»?`}
          body="Сцена и размещённые на ней токены будут удалены. Это действие нельзя отменить."
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            sceneTableService.deleteScene(scene.id);
          }}
        />
      )}
    </section>
  );
}

function framingOffsetLabel(value: number, negative: string, positive: string): string {
  if (Math.abs(value) < 0.001) return '0%';
  return `${value < 0 ? negative : positive} ${Math.round(Math.abs(value) * 100)}%`;
}

function SceneDisplayPreview({
  imageUrl,
  scene,
  tokens
}: {
  imageUrl: string;
  scene: SceneTableState['scenes'][string];
  tokens: PlayerViewToken[];
}) {
  const framing = normalizeSceneBackgroundFraming(scene.backgroundFraming);
  const imageStyle = {
    backgroundImage: `url("${cssImageUrl(imageUrl)}")`,
    backgroundSize: framing.fit === 'fit' ? 'contain' : 'cover',
    transform: sceneBackgroundTransform(framing)
  };

  return (
    <div className={`player-tools-scene-display-preview player-tools-scene-display-preview--${scene.mode}`} aria-hidden="true">
      {scene.mode === 'scene' && <div className="player-tools-scene-display-preview__image" style={imageStyle} />}
      <div className="player-tools-scene-display-preview__board">
        {scene.mode === 'tactical' && <div className="player-tools-scene-display-preview__image" style={imageStyle} />}
        {tokens.map((token) => (
          <i
            className={`player-tools-scene-display-preview__token player-tools-scene-display-preview__token--${token.kind}`}
            key={token.id}
            style={{
              left: `${(token.x / DEFAULT_SCENE_WIDTH) * 100}%`,
              top: `${(token.y / DEFAULT_SCENE_HEIGHT) * 100}%`,
              width: `${Math.max(4, (token.width / DEFAULT_SCENE_WIDTH) * 100)}%`
            }}
          />
        ))}
      </div>
      <i className="player-tools-scene-display-preview__topbar" />
      <i className="player-tools-scene-display-preview__rail player-tools-scene-display-preview__rail--left" />
      <i className="player-tools-scene-display-preview__rail player-tools-scene-display-preview__rail--right" />
      <i className="player-tools-scene-display-preview__controls" />
    </div>
  );
}
