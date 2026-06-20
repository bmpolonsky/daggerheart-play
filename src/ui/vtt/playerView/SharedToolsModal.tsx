/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { ChevronDown, ExternalLink, X } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { Character, DaggerheartClass } from '../../../domain/rules/types';
import { characterService, contentService, encounterService, gameService, sceneTableService, tabletopService } from '../../../services/serviceRegistry';
import { IconButton } from '../../components/common/IconButton';
import { NavButton } from '../../components/common/NavButton';
import { Surface } from '../../components/common/Surface';
import { TabButton, Tabs } from '../../components/common/Tabs';
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
import type { ContentCollectionKey } from '../../../domain/content/types';
import './player-tools.css';

const PLAYER_COMPENDIUM_COLLECTIONS = COMPENDIUM_COLLECTIONS.filter((collection) => collection.key !== 'adversaries' && collection.key !== 'environments');
const GM_GAME_LIBRARY_TABS: SharedToolsTab[] = ['scenes', 'notes', 'handouts'];
const PLAYER_GAME_LIBRARY_TABS: SharedToolsTab[] = ['handouts'];

export function SharedToolsModal({
  role,
  tab,
  targetCharacterId,
  onClose,
  onLibraryCollectionChange,
  onSettingsSectionChange,
  routedSettingsSection,
  onTabChange
}: {
  role: TableViewRole;
  tab: SharedToolsTab;
  targetCharacterId?: string | null;
  onClose: () => void;
  onLibraryCollectionChange?: (collection: ContentCollectionKey) => void;
  onSettingsSectionChange?: (section: SettingsSectionId) => void;
  routedSettingsSection?: string | null;
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
  const [gameNavCollapsed, setGameNavCollapsed] = useState(!gameLibraryTabs.includes(activeTab));
  const [compendiumNavCollapsed, setCompendiumNavCollapsed] = useState(activeTab !== 'library');
  const [settingsNavCollapsed, setSettingsNavCollapsed] = useState(activeTab !== 'settings');
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>(
    normalizeSettingsSection((routedSettingsSection as SettingsSectionId | null) ?? (role === 'gm' ? 'game' : 'connection'), role)
  );
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
  useEffect(() => {
    if (!routedSettingsSection) return;
    const nextSection = normalizeSettingsSection(routedSettingsSection as SettingsSectionId, role);
    if (nextSection !== activeSettingsSection) setActiveSettingsSection(nextSection);
  }, [activeSettingsSection, role, routedSettingsSection]);

  const changeSettingsSection = (section: SettingsSectionId) => {
    setActiveSettingsSection(section);
    if (onSettingsSectionChange) {
      onSettingsSectionChange(section);
    } else {
      onTabChange('settings');
    }
  };
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
      <Surface as="div" className="player-tools-modal__panel" padding="none">
        <header className="player-tools-modal__header">
          <div>
            <span>Библиотека</span>
          </div>
          <IconButton variant="ghost" type="button" title="Закрыть" aria-label="Закрыть" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </header>
        <nav className="player-tools-modal__nav" aria-label="Разделы инструментов">
          <div className="player-tools-modal__nav-stack">
            <div className="player-tools-modal__nav-group">
              <NavButton
                aria-expanded={!gameNavCollapsed}
                active={gameLibraryTabs.includes(activeTab)}
                className="player-tools-modal__nav-label"
                collapsed={gameNavCollapsed}
                type="button"
                onClick={() => setGameNavCollapsed((current) => !current)}
              >
                <span>Игра</span>
                <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
              </NavButton>
              {!gameNavCollapsed && (
                <div className="player-tools-modal__subnav" aria-label="Разделы игры">
                  {gameLibraryTabs.map((item) => (
                    <NavButton
                      active={activeTab === item}
                      key={item}
                      type="button"
                      onClick={() => onTabChange(item)}
                    >
                      <span>{toolTabLabel(item)}</span>
                    </NavButton>
                  ))}
                </div>
              )}
            </div>
            {standaloneTabs.map((item) => item === 'library'
              ? renderLibraryNavItem(item, activeTab, libraryView, compendiumCollections, onTabChange, onLibraryCollectionChange, compendiumNavCollapsed, () => setCompendiumNavCollapsed((current) => !current))
              : item === 'settings'
                ? renderSettingsNavItem(
                  item,
                  activeTab,
                  settingsSections,
                  normalizedSettingsSection,
                  onTabChange,
                  changeSettingsSection,
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
        <Tabs className="player-tools-modal__mobile-tabs" label="Разделы библиотеки">
          {tabs.map((item) => renderMobileTabItem(
            item,
            activeTab,
            libraryView,
            compendiumCollections,
            settingsSections,
            normalizedSettingsSection,
            onTabChange,
            changeSettingsSection,
            onLibraryCollectionChange
          ))}
          {specialTabs.map((item) => (
            <TabButton
              key={`external-${item}`}
              type="button"
              onClick={() => {
                if (item === 'combat' || item === 'cards') openWorkspaceInNewTab(item);
              }}
            >
              {toolTabLabel(item)}
            </TabButton>
          ))}
        </Tabs>
        <div className="player-tools-modal__body" role="region" aria-label="Содержимое библиотеки">
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
      </Surface>
    </section>
  );
}

function renderMobileTabItem(
  item: SharedToolsTab,
  activeTab: SharedToolsTab,
  libraryView: ReturnType<typeof contentService.buildLibraryView>,
  compendiumCollections: typeof COMPENDIUM_COLLECTIONS,
  settingsSections: SettingsSectionId[],
  activeSettingsSection: SettingsSectionId,
  onTabChange: (tab: SharedToolsTab) => void,
  onSettingsSectionChange: (section: SettingsSectionId) => void,
  onLibraryCollectionChange?: (collection: ContentCollectionKey) => void
) {
  if (item === 'library') {
    return compendiumCollections.map((collection) => (
      <TabButton
        active={activeTab === 'library' && libraryView.selectedCollection === collection.key}
        key={`library-${collection.key}`}
        type="button"
        onClick={() => {
          contentService.setSelectedCollection(collection.key);
          if (onLibraryCollectionChange) {
            onLibraryCollectionChange(collection.key);
          } else {
            onTabChange('library');
          }
        }}
      >
        {collection.shortLabel}
      </TabButton>
    ));
  }
  if (item === 'settings') {
    return settingsSections.map((section) => (
      <TabButton
        active={activeTab === 'settings' && activeSettingsSection === section}
        key={`settings-${section}`}
        type="button"
        onClick={() => {
          onSettingsSectionChange(section);
          onTabChange('settings');
        }}
      >
        {settingsSectionLabel(section)}
      </TabButton>
    ));
  }
  return (
    <TabButton
      active={activeTab === item}
      key={item}
      type="button"
      onClick={() => onTabChange(item)}
    >
      {toolTabLabel(item)}
    </TabButton>
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
      <NavButton
        aria-expanded={!collapsed}
        active={isActive}
        className="player-tools-modal__nav-label"
        collapsed={collapsed}
        type="button"
        onClick={onToggle}
      >
        <span>{toolTabLabel(item)}</span>
        <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
      </NavButton>
      {!collapsed && (
        <div className="player-tools-modal__subnav" aria-label="Разделы настроек">
          {settingsSections.map((section) => (
            <NavButton
              active={isActive && activeSettingsSection === section}
              key={section}
              type="button"
              onClick={() => {
                onSettingsSectionChange(section);
              }}
            >
              <span>{settingsSectionLabel(section)}</span>
            </NavButton>
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
  onLibraryCollectionChange: ((collection: ContentCollectionKey) => void) | undefined,
  collapsed: boolean,
  onToggle: () => void
) {
  const isActive = activeTab === item;
  return (
    <div className="player-tools-modal__nav-group" key={item}>
      <NavButton
        aria-expanded={!collapsed}
        active={isActive}
        className="player-tools-modal__nav-label"
        collapsed={collapsed}
        type="button"
        onClick={onToggle}
      >
        <span>{toolTabLabel(item)}</span>
        <ChevronDown className="player-tools-modal__nav-chevron" size={14} aria-hidden="true" />
      </NavButton>
      {!collapsed && (
        <div className="player-tools-modal__subnav" aria-label="Разделы компендиума">
          {compendiumCollections.map((collection) => (
            <NavButton
              active={libraryView.selectedCollection === collection.key}
              key={collection.key}
              type="button"
              onClick={() => {
                contentService.setSelectedCollection(collection.key);
                if (onLibraryCollectionChange) {
                  onLibraryCollectionChange(collection.key);
                } else {
                  onTabChange(item);
                }
              }}
            >
              <span>{collection.shortLabel}</span>
              <small>{libraryView.collectionCounts[collection.key] ?? 0}</small>
            </NavButton>
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
      <NavButton
        active={!external && activeTab === item}
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
      </NavButton>
    </div>
  );
}
