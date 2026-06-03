/** @jsxImportSource preact */
import type { GameState, SceneTableState } from "../../../../domain/rules/types";
import { GmActionsPanel } from "./GmActionsPanel";
import { GmHandoutsPanel } from "./GmHandoutsPanel";
import { LiveSceneSwitcher } from "./LiveSceneSwitcher";
import type { GmDockTab } from "./types";
import { TabButton, Tabs } from "../../../components/common/Tabs";

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
      <Tabs className="player-roster-gm-dock__tabs" label="Разделы мастера">
        <TabButton active={activeTab === 'scenes'} onClick={() => onTabChange('scenes')}>
          Сцены
        </TabButton>
        <TabButton active={activeTab === 'actions'} onClick={() => onTabChange('actions')}>
          Действия
        </TabButton>
        <TabButton active={activeTab === 'handouts'} onClick={() => onTabChange('handouts')}>
          Раздатка
        </TabButton>
      </Tabs>
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
