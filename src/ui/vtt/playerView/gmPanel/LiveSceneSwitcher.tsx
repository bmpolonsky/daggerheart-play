/** @jsxImportSource preact */
import type { SceneTableState } from "../../../../domain/rules/types";
import { gameService, sceneTableService } from "../../../../services/serviceRegistry";

export function LiveSceneSwitcher({ sceneTable }: { sceneTable: SceneTableState }) {
  const scenes = sceneTable.sceneOrder.map((id) => sceneTable.scenes[id]).filter(Boolean);
  if (scenes.length === 0) return null;
  return (
    <section className="player-scene-switcher" aria-label="Смена сцены">
      {scenes.map((scene) => (
        <button
          className={sceneTable.liveSceneId === scene.id ? 'dh-is-active' : ''}
          key={scene.id}
          type="button"
          onClick={() => {
            if (sceneTableService.publishScene(scene.id)) gameService.startScene(scene.name);
          }}
        >
          <span>
            <strong>{scene.name}</strong>
          </span>
        </button>
      ))}
    </section>
  );
}
