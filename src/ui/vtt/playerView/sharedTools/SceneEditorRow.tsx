/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Eye, LocateFixed, Trash2 } from 'lucide-react';
import type { SceneTableState } from '../../../../domain/rules/types';
import { assetService, gameService, sceneTableService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { IconButton } from '../../../components/common/IconButton';
import { FilePicker, ImageFilePicker } from '../../../components/common/ImageFilePicker';
import { TextField } from '../../../components/common/Field';
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
  const musicTitle = scene.music.title || 'Не выбрана';
  const publishScene = () => {
    if (sceneTableService.publishScene(scene.id)) gameService.startScene(scene.name);
  };

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
        <ImageFilePicker
          className="player-tools-scene-preview"
          label="Фон сцены"
          imageUrl={previewUrl}
          aspectRatio="16 / 9"
          onFileSelect={selectBackgroundImage}
          onClear={clearBackgroundImage}
        />
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
