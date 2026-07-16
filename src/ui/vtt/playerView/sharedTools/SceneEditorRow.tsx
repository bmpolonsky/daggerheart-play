/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Eye, LocateFixed, Trash2 } from 'lucide-react';
import type { SceneTableState } from '../../../../domain/rules/types';
import { DEFAULT_SCENE_BACKGROUND_FRAMING, normalizeSceneBackgroundFraming, sceneBackgroundTransform } from '../../../../domain/tabletop/sceneBackground';
import { assetService, gameService, sceneTableService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { IconButton } from '../../../components/common/IconButton';
import { FilePicker, ImageFilePicker } from '../../../components/common/ImageFilePicker';
import { RangeField } from '../../../components/common/RangeField';
import { TextField } from '../../../components/common/Field';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { SectionHeader } from '../../../components/common/SectionHeader';
import { Toolbar } from '../../../components/common/Toolbar';

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
  const framingIsDefault = backgroundFraming.fit === DEFAULT_SCENE_BACKGROUND_FRAMING.fit
    && backgroundFraming.zoom === DEFAULT_SCENE_BACKGROUND_FRAMING.zoom
    && backgroundFraming.offsetX === DEFAULT_SCENE_BACKGROUND_FRAMING.offsetX
    && backgroundFraming.offsetY === DEFAULT_SCENE_BACKGROUND_FRAMING.offsetY;

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
            label="Фон сцены"
            imageUrl={previewUrl}
            aspectRatio="16 / 9"
            previewStyle={{
              objectFit: backgroundFraming.fit === 'fill' ? 'cover' : 'contain',
              objectPosition: 'center',
              transform: sceneBackgroundTransform(backgroundFraming),
              transformOrigin: 'center'
            }}
            onFileSelect={selectBackgroundImage}
            onClear={clearBackgroundImage}
          />
          {previewUrl && (
            <div className="player-tools-scene-framing">
              <SegmentedControl
                label="Размещение фона"
                value={backgroundFraming.fit}
                options={[
                  { value: 'fit', label: 'Вписать' },
                  { value: 'fill', label: 'Заполнить' }
                ]}
                onChange={(fit) => updateBackgroundFraming({ fit })}
              />
              <details className="player-tools-scene-framing__advanced" key={scene.id}>
                <summary>Настроить кадр</summary>
                <div className="player-tools-scene-framing__controls">
                  <RangeField
                    label="Масштаб"
                    aria-label="Масштаб фона"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={backgroundFraming.zoom}
                    valueLabel={`${Math.round(backgroundFraming.zoom * 100)}%`}
                    onInput={(event) => updateBackgroundFraming({ zoom: event.currentTarget.valueAsNumber })}
                  />
                  <RangeField
                    label="По горизонтали"
                    aria-label="Положение фона по горизонтали"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={backgroundFraming.offsetX}
                    valueLabel={framingOffsetLabel(backgroundFraming.offsetX)}
                    onInput={(event) => updateBackgroundFraming({ offsetX: event.currentTarget.valueAsNumber })}
                  />
                  <RangeField
                    label="По вертикали"
                    aria-label="Положение фона по вертикали"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={backgroundFraming.offsetY}
                    valueLabel={framingOffsetLabel(backgroundFraming.offsetY)}
                    onInput={(event) => updateBackgroundFraming({ offsetY: event.currentTarget.valueAsNumber })}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    disabled={framingIsDefault}
                    onClick={() => sceneTableService.updateScene(scene.id, { backgroundFraming: { ...DEFAULT_SCENE_BACKGROUND_FRAMING } })}
                  >
                    Сбросить кадр
                  </Button>
                </div>
              </details>
            </div>
          )}
        </div>
        <div className="player-tools-scene-editor__fields">
          <TextField label="Название" value={scene.name} onInput={(event) => sceneTableService.updateScene(scene.id, { name: event.currentTarget.value })} />
          <TextField label="Подзаголовок" value={scene.subtitle} placeholder="Короткая строка для игроков" onInput={(event) => sceneTableService.updateScene(scene.id, { subtitle: event.currentTarget.value })} />
          <FilePicker
            className="player-tools-scene-music-picker"
            label="Музыка сцены"
            accept="audio/*"
            valueLabel={scene.music.assetId || scene.music.sourceUrl || scene.music.title ? musicTitle : ''}
            emptyLabel="Выбрать трек"
            aspectRatio="1 / 1"
            icon="music"
            onFileSelect={selectMusicFile}
            onClear={clearMusicFile}
          />
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

function framingOffsetLabel(value: number): string {
  if (Math.abs(value) < 0.001) return 'По центру';
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}
