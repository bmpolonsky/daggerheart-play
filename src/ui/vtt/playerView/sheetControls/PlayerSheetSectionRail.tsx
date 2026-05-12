/** @jsxImportSource preact */
import { PLAYER_SHEET_SECTIONS } from '../constants';
import type { PlayerSheetSectionId } from '../types';

export function PlayerSheetSectionRail({ activeSheetSection, onSelect }: { activeSheetSection: PlayerSheetSectionId; onSelect: (sectionId: PlayerSheetSectionId) => void }) {
  return (
    <div className="player-character-panel__section-rail" aria-label="Позиция в листе персонажа">
      {PLAYER_SHEET_SECTIONS.map((section) => (
        <button
          aria-current={activeSheetSection === section.id ? 'step' : undefined}
          aria-label={section.label}
          className={activeSheetSection === section.id ? 'dh-is-active' : ''}
          key={section.id}
          title={section.label}
          type="button"
          onClick={() => onSelect(section.id)}
        >
          <i />
          <span>{section.label}</span>
        </button>
      ))}
    </div>
  );
}
