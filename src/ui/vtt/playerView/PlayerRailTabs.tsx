/** @jsxImportSource preact */
import { BookOpenText, LibraryBig, CaseSensitive, ContactRound } from 'lucide-react';
import { TabButton, Tabs } from '../../components/common';
import type { TableViewRole } from './types';

export type PlayerRailTab = 'chronicle' | 'library' | 'npc' | 'names';

export function PlayerRailTabs({ active, role, onSelect }: {
  active: PlayerRailTab;
  role: TableViewRole;
  onSelect: (tab: PlayerRailTab) => void;
}) {
  return (
    <Tabs align="start" className="player-left-rail-tabs" label="Режим левой панели">
      <TabButton active={active === 'chronicle'} title="Чат" aria-label="Чат" onClick={() => onSelect('chronicle')}>
        <BookOpenText size={16} aria-hidden="true" />
      </TabButton>
      <TabButton active={active === 'library'} title="Справочник" aria-label="Справочник" onClick={() => onSelect('library')}>
        <LibraryBig size={16} aria-hidden="true" />
      </TabButton>
      {role === 'gm' && <>
        <TabButton active={active === 'names'} title="Имена и названия" aria-label="Имена и названия" onClick={() => onSelect('names')}>
          <CaseSensitive size={16} aria-hidden="true" />
        </TabButton>
        <TabButton active={active === 'npc'} title="NPC" aria-label="NPC" onClick={() => onSelect('npc')}>
          <ContactRound size={16} aria-hidden="true" />
        </TabButton>
      </>}
    </Tabs>
  );
}
