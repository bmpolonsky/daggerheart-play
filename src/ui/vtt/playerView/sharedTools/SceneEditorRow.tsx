/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Trash2 } from 'lucide-react';
import type { SceneTableState } from '../../../../domain/rules/types';
import { assetService, sceneTableService } from '../../../../services/serviceRegistry';
import { IconButton } from '../../../components/common/IconButton';
import { FilePicker, ImageFilePicker } from '../../../components/common/ImageFilePicker';
import { Surface } from '../../../components/common/Surface';
import { TextControl } from '../../../components/common/Field';

export function SceneEditorRow({ scene, canDelete }: { scene: SceneTableState['scenes'][string]; canDelete: boolean }) {
  const [backgroundObjectUrl, setBackgroundObjectUrl] = useState<string | null>(null);

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

  return (
    <Surface as="article" tone="subtle" className="player-tools-row player-tools-scene-row">
      <ImageFilePicker
        className="player-tools-scene-preview"
        label="Фон"
        imageUrl={previewUrl}
        aspectRatio="4 / 3"
        onFileSelect={selectBackgroundImage}
        onClear={clearBackgroundImage}
      />
      <div className="player-tools-scene-main player-tools-edit-grid">
        <label className="player-tools-scene-name">
          <span>Название</span>
          <TextControl value={scene.name} onInput={(event) => sceneTableService.updateScene(scene.id, { name: event.currentTarget.value })} />
        </label>
        <FilePicker
          className="player-tools-scene-music-picker"
          label="Музыка"
          accept="audio/*"
          valueLabel={scene.music.assetId || scene.music.sourceUrl || scene.music.title ? musicTitle : ''}
          emptyLabel="Выбрать трек"
          aspectRatio="1 / 1"
          icon="music"
          onFileSelect={selectMusicFile}
          onClear={clearMusicFile}
        />
        <div className="player-tools-scene-actions">
          <IconButton
            className="player-tools-scene-delete"
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => sceneTableService.deleteScene(scene.id)}
            disabled={!canDelete}
            title={canDelete ? 'Удалить сцену' : 'Нельзя удалить последнюю сцену'}
            aria-label="Удалить сцену"
          >
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </Surface>
  );
}
