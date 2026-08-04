/** @jsxImportSource preact */
import { BookOpenText, LibraryBig, WandSparkles } from 'lucide-react';
import { TabButton, Tabs } from '../../components/common';
import type { TableViewRole } from './types';

export type PlayerRailTab = 'chronicle' | 'library' | 'npc';

export function PlayerRailTabs({ active, role, onSelect }: {
  active: PlayerRailTab;
  role: TableViewRole;
  onSelect: (tab: PlayerRailTab) => void;
}) {
  return (
    <Tabs align="start" className="player-left-rail-tabs" label="Режим левой панели">
      <TabButton active={active === 'chronicle'} title="Хроника" aria-label="Хроника" onClick={() => onSelect('chronicle')}>
        <BookOpenText size={16} aria-hidden="true" />
      </TabButton>
      <TabButton active={active === 'library'} title="Библиотека игры" aria-label="Библиотека игры" onClick={() => onSelect('library')}>
        <LibraryBig size={16} aria-hidden="true" />
      </TabButton>
      {role === 'gm' && (
        <TabButton active={active === 'npc'} title="Генератор NPC" aria-label="Генератор NPC" onClick={() => onSelect('npc')}>
          <WandSparkles size={16} aria-hidden="true" />
        </TabButton>
      )}
    </Tabs>
  );
}
