/** @jsxImportSource preact */
import { Clapperboard, Plus } from 'lucide-react';
import { useEffect, useState } from 'preact/hooks';
import type { SceneTableState } from '../../../../domain/rules/types';
import { sceneTableService } from '../../../../services/serviceRegistry';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { EmptyState } from '../../../components/common/EmptyState';
import { ListItem } from '../../../components/common/ListItem';
import { Toolbar } from '../../../components/common/Toolbar';
import { SceneEditorRow } from './SceneEditorRow';

export function SharedToolsScenesTab({
  sceneTable
}: {
  sceneTable: SceneTableState;
}) {
  const scenes = sceneTable.sceneOrder.map((id) => sceneTable.scenes[id]).filter(Boolean);
  const [selectedSceneId, setSelectedSceneId] = useState(sceneTable.activeSceneId || scenes[0]?.id || '');
  const selectedScene = sceneTable.scenes[selectedSceneId] ?? scenes[0] ?? null;

  useEffect(() => {
    if (selectedSceneId && sceneTable.scenes[selectedSceneId]) return;
    setSelectedSceneId(sceneTable.activeSceneId || scenes[0]?.id || '');
  }, [sceneTable.activeSceneId, sceneTable.scenes, scenes, selectedSceneId]);

  const createScene = () => {
    const scene = sceneTableService.createScene({ name: `Сцена ${scenes.length + 1}` });
    setSelectedSceneId(scene.id);
  };

  const selectScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
  };

  return (
    <section className="player-tools-section player-tools-scenes-section">
      <Toolbar className="player-tools-section-actions" aria-label="Действия со сценами">
        <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={createScene}>
          Новая сцена
        </Button>
      </Toolbar>
      <div className="player-tools-master-detail">
        <nav className="player-tools-master-detail__list" aria-label="Список сцен">
          {scenes.map((scene) => (
            <ListItem
              className={selectedScene?.id === scene.id ? 'dh-is-selected' : ''}
              key={scene.id}
              title={scene.name || 'Без названия'}
              subtitle={scene.music.title || undefined}
              leftAccessory={<Clapperboard size={17} aria-hidden="true" />}
              rightAccessory={sceneTable.liveSceneId === scene.id
                ? <Badge tone="gold">У игроков</Badge>
                : sceneTable.activeSceneId === scene.id
                  ? <Badge tone="neutral">Рабочая</Badge>
                  : undefined}
              onClick={() => selectScene(scene.id)}
            />
          ))}
        </nav>
        <div className="player-tools-master-detail__detail">
          {selectedScene ? (
            <SceneEditorRow
              scene={selectedScene}
              canDelete={scenes.length > 1}
              isActive={sceneTable.activeSceneId === selectedScene.id}
              isLive={sceneTable.liveSceneId === selectedScene.id}
            />
          ) : (
            <EmptyState tone="transparent" icon={<Clapperboard size={20} />} title="Создайте первую сцену" />
          )}
        </div>
      </div>
    </section>
  );
}
