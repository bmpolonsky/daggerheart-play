/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ExternalLink, X } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { Character, DaggerheartClass } from '../../../domain/rules/types';
import { characterService, contentService, encounterService, gameService, sceneTableService, tabletopService } from '../../../services/serviceRegistry';
import { openWorkspaceInNewTab, toolTabLabel } from './helpers';
import { COMPENDIUM_COLLECTIONS } from './library/compendiumCollections';
import { SharedToolsLibraryTab } from './library/SharedToolsLibraryTab';
import {
  normalizeSettingsSection,
  settingsSectionLabel,
  settingsSectionsForRole,
  SharedToolsSettingsTab,
  type SettingsSectionId
} from './SharedToolsSettingsTab';
import { sharedToolsTabsForRole } from './routedUiState';
import {
  SharedToolsCharactersTab,
  SharedToolsHandoutsTab,
  SharedToolsNotesTab,
  SharedToolsScenesTab
} from './SharedToolsTabs';
import type { SharedToolsTab, TableViewRole } from './types';
import './player-tools.css';

const PLAYER_COMPENDIUM_COLLECTIONS = COMPENDIUM_COLLECTIONS.filter((collection) => collection.key !== 'adversaries' && collection.key !== 'environments');
const GM_GAME_LIBRARY_TABS: SharedToolsTab[] = ['scenes', 'notes', 'handouts'];
const PLAYER_GAME_LIBRARY_TABS: SharedToolsTab[] = ['handouts'];

export function SharedToolsModal({
  role,
  tab,
  targetCharacterId,
  onClose,
  onTabChange
}: {
  role: TableViewRole;
  tab: SharedToolsTab;
  targetCharacterId?: string | null;
  onClose: () => void;
  onTabChange: (tab: SharedToolsTab) => void;
}) {
  const tabs: SharedToolsTab[] = sharedToolsTabsForRole(role);
  const specialTabs: SharedToolsTab[] = role === 'gm' ? ['combat', 'cards'] : [];
  const gameLibraryTabs = role === 'gm' ? GM_GAME_LIBRARY_TABS : PLAYER_GAME_LIBRARY_TABS;
  const standaloneTabs = tabs.filter((item) => !gameLibraryTabs.includes(item));
  const game = useStream(gameService.game$);
  const characters = useStream(characterService.characters$);
  const encounter = useStream(encounterService.encounter$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const content = useStream(contentService.content$);
  const libraryView = contentService.buildLibraryView(content);
  const compendiumCollections = role === 'player' ? PLAYER_COMPENDIUM_COLLECTIONS : COMPENDIUM_COLLECTIONS;
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const characterOptions = characters.order.map((id) => characters.entities[id]).filter(Boolean);
  const playerSeats = Object.values(sceneTable.participants).filter((participant) => participant.role === 'player');
  const scenes = sceneTable.sceneOrder.map((id) => sceneTable.scenes[id]).filter(Boolean);
  const [characterBuilderOpen, setCharacterBuilderOpen] = useState(false);
  const [gameNavCollapsed, setGameNavCollapsed] = useState(true);
  const [compendiumNavCollapsed, setCompendiumNavCollapsed] = useState(true);
  const [settingsNavCollapsed, setSettingsNavCollapsed] = useState(true);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>(role === 'gm' ? 'game' : 'connection');
  const settingsSections = settingsSectionsForRole(role);
  const normalizedSettingsSection = normalizeSettingsSection(activeSettingsSection, role);

  useEffect(() => {
    if (activeTab !== 'library') return;
    if (compendiumCollections.some((collection) => collection.key === libraryView.selectedCollection)) return;
    const fallback = compendiumCollections[0];
    if (fallback) contentService.setSelectedCollection(fallback.key);
  }, [activeTab, compendiumCollections, libraryView.selectedCollection]);

  useEffect(() => {
    if (normalizedSettingsSection === activeSettingsSection) return;
    setActiveSettingsSection(normalizedSettingsSection);
  }, [activeSettingsSection, normalizedSettingsSection]);
  const createCharacterFromBuilder = (input: Partial<Character> & { className?: DaggerheartClass }) => {
    const { character } = tabletopService.createCharacterOnActiveScene(input);
    sceneTableService.createPlayerSeat({
      name: character.name,
      characterId: character.id
    });
    setCharacterBuilderOpen(false);
  };

  return (
    <section className="player-tools-modal" role="dialog" aria-modal="true" aria-label="Библиотека">
      <div className="player-tools-modal__backdrop" onClick={onClose} />
      <div className="player-tools-modal__panel">
        <header className="player-tools-modal__header">
          <div>
            <span>Библиотека</span>
          </div>
          <button type="button" title="Закрыть" onClick={onClose}><X size={18} /></button>
        </header>
        <nav className="player-tools-modal__nav" aria-label="Разделы инструментов">
          <div className="player-tools-modal__nav-stack">
            <div className="player-tools-modal__nav-group">
              <button
                aria-expanded={!gameNavCollapsed}
                className={[
                  'player-tools-modal__nav-label',
                  gameLibraryTabs.includes(activeTab) ? 'dh-is-active' : '',
                  gameNavCollapsed ? 'dh-is-collapsed' : ''
                ].filter(Boolean).join(' ')}
                type="button"
                onClick={() => setGameNavCollapsed((current) => !current)}
              >
                <span>Игра</span>
                <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
              </button>
              {!gameNavCollapsed && (
                <div className="player-tools-modal__subnav" aria-label="Разделы игры">
                  {gameLibraryTabs.map((item) => (
                    <button
                      className={activeTab === item ? 'dh-is-active' : ''}
                      key={item}
                      type="button"
                      onClick={() => onTabChange(item)}
                    >
                      <span>{toolTabLabel(item)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {standaloneTabs.map((item) => item === 'library'
              ? renderLibraryNavItem(item, activeTab, libraryView, compendiumCollections, onTabChange, compendiumNavCollapsed, () => setCompendiumNavCollapsed((current) => !current))
              : item === 'settings'
                ? renderSettingsNavItem(
                  item,
                  activeTab,
                  settingsSections,
                  normalizedSettingsSection,
                  onTabChange,
                  setActiveSettingsSection,
                  settingsNavCollapsed,
                  () => setSettingsNavCollapsed((current) => !current)
                )
              : renderNavItem(item, activeTab, onTabChange))}
          </div>
          {specialTabs.length > 0 && (
            <div className="player-tools-modal__nav-stack player-tools-modal__nav-stack--external" aria-label="Внешние инструменты">
              {specialTabs.map((item) => renderNavItem(item, activeTab, onTabChange, true))}
            </div>
          )}
        </nav>
        <nav className="player-tools-modal__mobile-tabs" aria-label="Разделы библиотеки">
          {gameLibraryTabs.map((item) => (
            <button
              className={activeTab === item ? 'dh-is-active' : ''}
              key={item}
              type="button"
              onClick={() => onTabChange(item)}
            >
              {toolTabLabel(item)}
            </button>
          ))}
          {standaloneTabs.filter((item) => item !== 'library' && item !== 'settings').map((item) => (
            <button
              className={activeTab === item ? 'dh-is-active' : ''}
              key={item}
              type="button"
              onClick={() => onTabChange(item)}
            >
              {toolTabLabel(item)}
            </button>
          ))}
          {compendiumCollections.map((collection) => (
            <button
              className={activeTab === 'library' && libraryView.selectedCollection === collection.key ? 'dh-is-active' : ''}
              key={`library-${collection.key}`}
              type="button"
              onClick={() => {
                contentService.setSelectedCollection(collection.key);
                onTabChange('library');
              }}
            >
              {collection.shortLabel}
            </button>
          ))}
          {settingsSections.map((section) => (
            <button
              className={activeTab === 'settings' && normalizedSettingsSection === section ? 'dh-is-active' : ''}
              key={`settings-${section}`}
              type="button"
              onClick={() => {
                setActiveSettingsSection(section);
                onTabChange('settings');
              }}
            >
              {settingsSectionLabel(section)}
            </button>
          ))}
          {specialTabs.map((item) => (
            <button
              key={`external-${item}`}
              type="button"
              onClick={() => {
                if (item === 'combat' || item === 'cards') openWorkspaceInNewTab(item);
              }}
            >
              {toolTabLabel(item)}
            </button>
          ))}
        </nav>
        <div className="player-tools-modal__body">
          {activeTab === 'scenes' && (
            <SharedToolsScenesTab
              characters={characters.entities}
              encounter={encounter}
              scenes={scenes}
            />
          )}
          {activeTab === 'characters' && role === 'gm' && (
            <SharedToolsCharactersTab
              characterBuilderOpen={characterBuilderOpen}
              characterOptions={characterOptions}
              content={content}
              onCharacterBuilderClose={() => setCharacterBuilderOpen(false)}
              onCharacterBuilderCreate={createCharacterFromBuilder}
              onCharacterBuilderOpen={() => setCharacterBuilderOpen(true)}
              playerSeats={playerSeats}
              sceneTable={sceneTable}
            />
          )}
          {activeTab === 'library' && (
            <SharedToolsLibraryTab libraryView={libraryView} targetCharacterId={targetCharacterId} />
          )}
          {activeTab === 'notes' && role === 'gm' && (
            <SharedToolsNotesTab game={game} />
          )}
          {activeTab === 'handouts' && (
            <SharedToolsHandoutsTab game={game} role={role} />
          )}
          {activeTab === 'settings' && (
            <SharedToolsSettingsTab
              activeSection={normalizedSettingsSection}
              game={game}
              characterOptions={characterOptions}
              playerSeats={playerSeats}
              role={role}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function renderSettingsNavItem(
  item: Extract<SharedToolsTab, 'settings'>,
  activeTab: SharedToolsTab,
  settingsSections: SettingsSectionId[],
  activeSettingsSection: SettingsSectionId,
  onTabChange: (tab: SharedToolsTab) => void,
  onSettingsSectionChange: (section: SettingsSectionId) => void,
  collapsed: boolean,
  onToggle: () => void
) {
  const isActive = activeTab === item;
  return (
    <div className="player-tools-modal__nav-group" key={item}>
      <button
        aria-expanded={!collapsed}
        className={[
          'player-tools-modal__nav-label',
          isActive ? 'dh-is-active' : '',
          collapsed ? 'dh-is-collapsed' : ''
        ].filter(Boolean).join(' ')}
        type="button"
        onClick={onToggle}
      >
        <span>{toolTabLabel(item)}</span>
        <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
      </button>
      {!collapsed && (
        <div className="player-tools-modal__subnav" aria-label="Разделы настроек">
          {settingsSections.map((section) => (
            <button
              className={isActive && activeSettingsSection === section ? 'dh-is-active' : ''}
              key={section}
              type="button"
              onClick={() => {
                onSettingsSectionChange(section);
                onTabChange(item);
              }}
            >
              <span>{settingsSectionLabel(section)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function renderLibraryNavItem(
  item: Extract<SharedToolsTab, 'library'>,
  activeTab: SharedToolsTab,
  libraryView: ReturnType<typeof contentService.buildLibraryView>,
  compendiumCollections: typeof COMPENDIUM_COLLECTIONS,
  onTabChange: (tab: SharedToolsTab) => void,
  collapsed: boolean,
  onToggle: () => void
) {
  const isActive = activeTab === item;
  return (
    <div className="player-tools-modal__nav-group" key={item}>
      <button
        aria-expanded={!collapsed}
        className={[
          'player-tools-modal__nav-label',
          isActive ? 'dh-is-active' : '',
          collapsed ? 'dh-is-collapsed' : ''
        ].filter(Boolean).join(' ')}
        type="button"
        onClick={onToggle}
      >
        <span>{toolTabLabel(item)}</span>
        <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
      </button>
      {!collapsed && (
        <div className="player-tools-modal__subnav" aria-label="Разделы компендиума">
          {compendiumCollections.map((collection) => (
            <button
              className={libraryView.selectedCollection === collection.key ? 'dh-is-active' : ''}
              key={collection.key}
              type="button"
              onClick={() => {
                contentService.setSelectedCollection(collection.key);
                onTabChange(item);
              }}
            >
              <span>{collection.shortLabel}</span>
              <small>{libraryView.collectionCounts[collection.key] ?? 0}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function renderNavItem(
  item: SharedToolsTab,
  activeTab: SharedToolsTab,
  onTabChange: (tab: SharedToolsTab) => void,
  external = false
) {
  return (
    <div className="player-tools-modal__nav-group" key={item}>
      <button
        className={!external && activeTab === item ? 'dh-is-active' : ''}
        type="button"
        onClick={() => {
          if (external && (item === 'combat' || item === 'cards')) {
            openWorkspaceInNewTab(item);
            return;
          }
          onTabChange(item);
        }}
      >
        <span>{toolTabLabel(item)}</span>
        {external && <ExternalLink size={14} aria-hidden="true" />}
      </button>
    </div>
  );
}
