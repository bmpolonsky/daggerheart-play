/** @jsxImportSource preact */
import type { GameState, Character } from '../../../domain/rules/types';
import type { TableParticipant } from '../../../domain/tabletop/types';
import { SharedToolsGamesTab } from './SharedToolsGamesTab';
import {
  SharedToolsConnectionSettingsPanel,
  SharedToolsDiagnosticsSettingsPanel,
  SharedToolsGameSettingsPanel,
  SharedToolsPlayersSettingsPanel
} from './SharedToolsSettingsPanels';
import type { TableViewRole } from './types';

export type SettingsSectionId = 'game' | 'projectGames' | 'players' | 'connection' | 'diagnostics';

export const GM_SETTINGS_SECTIONS: SettingsSectionId[] = ['game', 'projectGames', 'players', 'connection', 'diagnostics'];
export const PLAYER_SETTINGS_SECTIONS: SettingsSectionId[] = ['connection', 'diagnostics'];

export function settingsSectionsForRole(role: TableViewRole): SettingsSectionId[] {
  return role === 'gm' ? GM_SETTINGS_SECTIONS : PLAYER_SETTINGS_SECTIONS;
}

export function normalizeSettingsSection(section: SettingsSectionId, role: TableViewRole): SettingsSectionId {
  const sections = settingsSectionsForRole(role);
  return sections.includes(section) ? section : sections[0];
}

export function settingsSectionLabel(section: SettingsSectionId): string {
  const labels: Record<SettingsSectionId, string> = {
    game: 'Игра',
    projectGames: 'Игры проекта',
    players: 'Игроки',
    connection: 'Подключение',
    diagnostics: 'Диагностика'
  };
  return labels[section];
}

export function SharedToolsSettingsTab({
  activeSection,
  characterOptions,
  game,
  playerSeats,
  role
}: {
  activeSection: SettingsSectionId;
  game: GameState;
  characterOptions: Character[];
  playerSeats: TableParticipant[];
  role: TableViewRole;
}) {
  const section = normalizeSettingsSection(activeSection, role);

  return (
    <section className="player-tools-section player-tools-settings-section">
      <header><strong>Настройки</strong></header>
      <div className="player-tools-settings-body">
        {section === 'game' && role === 'gm' && (
          <SharedToolsGameSettingsPanel game={game} />
        )}
        {section === 'projectGames' && role === 'gm' && (
          <SharedToolsGamesTab />
        )}
        {section === 'players' && role === 'gm' && (
          <SharedToolsPlayersSettingsPanel
            characterOptions={characterOptions}
            playerSeats={playerSeats}
          />
        )}
        {section === 'connection' && (
          <SharedToolsConnectionSettingsPanel game={game} role={role} />
        )}
        {section === 'diagnostics' && (
          <SharedToolsDiagnosticsSettingsPanel role={role} />
        )}
      </div>
    </section>
  );
}
