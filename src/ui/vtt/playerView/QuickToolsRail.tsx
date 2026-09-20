/** @jsxImportSource preact */
import { PlayerRailTabs } from './PlayerRailTabs';
import { PlayerRailHeaderActions } from './PlayerRailHeaderActions';
import { NpcGenerator } from './sharedTools/NpcGenerator';
import { NameGenerator } from './sharedTools/NameGenerator';
import type { SharedToolsTab } from './types';

export function QuickToolsRail({ tab, onClose, onOpenTool }: {
  tab: 'names' | 'npc';
  onClose: () => void;
  onOpenTool: (tab: SharedToolsTab) => void;
}) {
  return (
    <aside className="player-left-rail player-quick-tools-rail" aria-label="Быстрые инструменты">
      <header className="player-chronicle-header">
        <PlayerRailTabs active={tab} role="gm" onSelect={(next) => {
          if (next === 'chronicle') onClose();
          else onOpenTool(next);
        }} />
        <PlayerRailHeaderActions role="gm" onOpenTool={onOpenTool} />
      </header>
      <section className="player-activity-card player-quick-tools-card">
        <div className="player-quick-tools-card__body">
          {tab === 'names' ? <NameGenerator /> : <NpcGenerator />}
        </div>
      </section>
    </aside>
  );
}
