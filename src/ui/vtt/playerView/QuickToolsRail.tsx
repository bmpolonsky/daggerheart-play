/** @jsxImportSource preact */
import { LibraryBig } from 'lucide-react';
import type { GeneratedNpc } from '../../../domain/generators/npc';
import { IconButton } from '../../components/common';
import { PlayerRailTabs } from './PlayerRailTabs';
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
      <section className="player-activity-card player-quick-tools-card">
        <header className="player-chronicle-header">
          <PlayerRailTabs active="npc" role="gm" onSelect={(tab) => {
            if (tab === 'chronicle') onClose();
          }} />
          <div className="player-chronicle-header__actions">
            <IconButton variant="ghost" size="sm" title="Библиотека игры" aria-label="Библиотека игры" onClick={() => onOpenTool('library')}>
              <LibraryBig size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        <div className="player-quick-tools-card__body">
          <SharedToolsGeneratorsTab npc={npc} onNpcChange={onNpcChange} />
        </div>
      </section>
    </aside>
  );
}
