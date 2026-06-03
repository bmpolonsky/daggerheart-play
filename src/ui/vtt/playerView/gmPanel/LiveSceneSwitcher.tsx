/** @jsxImportSource preact */
import type { SceneTableState } from "../../../../domain/rules/types";
import { gameService, sceneTableService } from "../../../../services/serviceRegistry";
import { ChoiceCard } from "../../../components/common/ChoiceCard";

export function LiveSceneSwitcher({ sceneTable }: { sceneTable: SceneTableState }) {
  const scenes = sceneTable.sceneOrder.map((id) => sceneTable.scenes[id]).filter(Boolean);
  if (scenes.length === 0) return null;
  return (
    <section className="player-scene-switcher" aria-label="Смена сцены">
      {scenes.map((scene) => (
        <ChoiceCard
          selected={sceneTable.liveSceneId === scene.id}
          key={scene.id}
          onClick={() => {
            if (sceneTableService.publishScene(scene.id)) gameService.startScene(scene.name);
          }}
        >
          <span>
            <strong>{scene.name}</strong>
          </span>
        </ChoiceCard>
      ))}
    </section>
  );
}
