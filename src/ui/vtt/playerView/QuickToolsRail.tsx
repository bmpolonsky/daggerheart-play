/** @jsxImportSource preact */
import type { GeneratedNpc } from '../../../domain/generators/npc';
import { PlayerRailTabs } from './PlayerRailTabs';
import { PlayerRailHeaderActions } from './PlayerRailHeaderActions';
import { SharedToolsGeneratorsTab } from './sharedTools/SharedToolsGeneratorsTab';
import { NameGenerator } from './sharedTools/NameGenerator';
import type { SharedToolsTab } from './types';

export function QuickToolsRail({ tab, npc, onNpcChange, onClose, onOpenTool }: {
  tab: 'names' | 'generators';
  npc: GeneratedNpc;
  onNpcChange: (npc: GeneratedNpc) => void;
  onClose: () => void;
  onOpenTool: (tab: SharedToolsTab) => void;
}) {
  return (
    <aside className="player-left-rail player-quick-tools-rail" aria-label="Быстрые инструменты">
      <header className="player-chronicle-header">
        <PlayerRailTabs active={tab === 'names' ? 'names' : 'npc'} role="gm" onSelect={(next) => {
          if (next === 'chronicle') onClose();
          else onOpenTool(next === 'npc' ? 'generators' : next);
        }} />
        <PlayerRailHeaderActions role="gm" onOpenTool={onOpenTool} />
      </header>
      <section className="player-activity-card player-quick-tools-card">
        <div className="player-quick-tools-card__body">
          {tab === 'names' ? <NameGenerator /> : <SharedToolsGeneratorsTab npc={npc} onNpcChange={onNpcChange} />}
        </div>
      </section>
    </aside>
  );
}
