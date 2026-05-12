/** @jsxImportSource preact */
import { Plus } from 'lucide-react';
import type { Character, EncounterState, SceneTableState } from '../../../../domain/rules/types';
import { sceneTableService } from '../../../../services/serviceRegistry';
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
          <button className="dh-button dh-variant-primary" type="button" onClick={() => sceneTableService.createScene({ name: `Сцена ${scenes.length + 1}` })}>
            <Plus size={15} /> Новая
          </button>
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
