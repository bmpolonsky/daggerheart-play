/** @jsxImportSource preact */
import type { GeneratedNpc } from '../../../domain/generators/npc';
import { PlayerRailTabs } from './PlayerRailTabs';
import { PlayerRailHeaderActions } from './PlayerRailHeaderActions';
import { SharedToolsGeneratorsTab } from './sharedTools/SharedToolsGeneratorsTab';
import type { SharedToolsTab } from './types';

export function QuickToolsRail({ npc, onNpcChange, onClose, onOpenTool }: {
  npc: GeneratedNpc;
  onNpcChange: (npc: GeneratedNpc) => void;
  onClose: () => void;
  onOpenTool: (tab: SharedToolsTab) => void;
}) {
  return (
    <aside className="player-left-rail player-quick-tools-rail" aria-label="Быстрые инструменты">
      <header className="player-chronicle-header">
        <PlayerRailTabs active="npc" role="gm" onSelect={(tab) => {
          if (tab === 'chronicle') onClose();
          if (tab === 'library') onOpenTool('library');
        }} />
        <PlayerRailHeaderActions role="gm" onOpenTool={onOpenTool} />
      </header>
      <section className="player-activity-card player-quick-tools-card">
        <div className="player-quick-tools-card__body">
          <SharedToolsGeneratorsTab npc={npc} onNpcChange={onNpcChange} />
        </div>
      </section>
    </aside>
  );
}
