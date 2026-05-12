/** @jsxImportSource preact */
import type { GameState, SceneTableState } from "../../../../domain/rules/types";
import { GmActionsPanel } from "./GmActionsPanel";
import { GmHandoutsPanel } from "./GmHandoutsPanel";
import { LiveSceneSwitcher } from "./LiveSceneSwitcher";
import type { GmDockTab } from "./types";

export function RosterGmDock({
  activeTab,
  handouts,
  sceneTable,
  onTabChange
}: {
  activeTab: GmDockTab;
  handouts: GameState['handouts'];
  sceneTable: SceneTableState;
  onTabChange: (tab: GmDockTab) => void;
}) {
  return (
    <section className="player-roster-gm-dock" aria-label="Библиотека">
      <nav className="player-roster-gm-dock__tabs" aria-label="Разделы мастера">
        <button className={activeTab === 'scenes' ? 'dh-is-active' : ''} type="button" onClick={() => onTabChange('scenes')}>
          Сцены
        </button>
        <button className={activeTab === 'actions' ? 'dh-is-active' : ''} type="button" onClick={() => onTabChange('actions')}>
          Действия
        </button>
        <button className={activeTab === 'handouts' ? 'dh-is-active' : ''} type="button" onClick={() => onTabChange('handouts')}>
          Раздатка
        </button>
      </nav>
      {activeTab === 'scenes' ? (
        <LiveSceneSwitcher sceneTable={sceneTable} />
      ) : activeTab === 'actions' ? (
        <GmActionsPanel />
      ) : (
        <GmHandoutsPanel handouts={handouts} />
      )}
    </section>
  );
}
