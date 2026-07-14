/** @jsxImportSource preact */
import { PLAYER_SHEET_SECTIONS } from '../constants';
import { StepRailButton } from '../../../components/common/StepRailButton';
import type { PlayerSheetSectionId } from '../types';

export function PlayerSheetSectionRail({ activeSheetSection, onSelect }: { activeSheetSection: PlayerSheetSectionId; onSelect: (sectionId: PlayerSheetSectionId) => void }) {
  return (
    <div className="player-character-panel__section-rail" aria-label="Разделы листа персонажа">
      {PLAYER_SHEET_SECTIONS.map((section) => (
        <StepRailButton
          active={activeSheetSection === section.id}
          key={section.id}
          label={section.label}
          onClick={() => onSelect(section.id)}
        />
      ))}
    </div>
  );
}
