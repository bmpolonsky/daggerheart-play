/** @jsxImportSource preact */
import { Plus } from 'lucide-react';
import type { Character, EncounterState, SceneTableState } from '../../../../domain/rules/types';
import { sceneTableService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { SceneEditorRow } from './SceneEditorRow';

export function SharedToolsScenesTab({
  scenes
}: {
  characters: Record<string, Character>;
  encounter: EncounterState;
  scenes: Array<SceneTableState['scenes'][string]>;
}) {
  return (
    <section className="player-tools-section">
      <header>
        <strong>Сцены</strong>
        <div className="player-tools-actions">
          <Button variant="primary" size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => sceneTableService.createScene({ name: `Сцена ${scenes.length + 1}` })}>
            Новая
          </Button>
        </div>
      </header>
      <div className="player-tools-list player-tools-scene-grid">
        {scenes.map((scene) => (
          <SceneEditorRow key={scene.id} scene={scene} canDelete={scenes.length > 1} />
        ))}
      </div>
    </section>
  );
}
