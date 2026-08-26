/** @jsxImportSource preact */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ExternalLink, X } from 'lucide-react';
import { useStream } from '../../../core/hooks/useStream';
import type { Character, DaggerheartClass } from '../../../domain/rules/types';
import { characterService, contentService, gameService, sceneTableService, tabletopService } from '../../../services/serviceRegistry';
import { Dialog } from '../../components/common/Dialog';
import { IconButton } from '../../components/common/IconButton';
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
import { SharedToolsCombatTab } from './sharedTools/SharedToolsCombatTab';
import { CharacterEditor } from '../../characters/CharacterEditor';
import { EmptyState } from '../../components/common/EmptyState';
import type { SharedToolsTab, TableViewRole } from './types';
import type { ContentCollectionKey } from '../../../domain/content/types';
import './player-tools.css';

const PLAYER_COMPENDIUM_COLLECTIONS = COMPENDIUM_COLLECTIONS.filter((collection) => collection.key !== 'adversaries' && collection.key !== 'environments');

export function SharedToolsModal({
  role,
  tab,
  targetCharacterId,
  onClose,
  onEditorDirtyChange,
  onLibraryCollectionChange,
  onLibraryCopyConsumed,
  onLibraryEntryChange,
  onSettingsSectionChange,
  routedLibraryEntrySlug,
  routedLibraryCopySlug,
  routedSettingsSection,
  routedHandoutId,
  onHandoutChange,
  onTabChange
}: {
  role: TableViewRole;
  tab: SharedToolsTab;
  targetCharacterId?: string | null;
  onClose: () => void;
  onEditorDirtyChange?: (dirty: boolean) => void;
  onLibraryCollectionChange?: (collection: ContentCollectionKey) => void;
  onLibraryCopyConsumed?: () => void;
  onLibraryEntryChange?: (slug: string | null) => void;
  onSettingsSectionChange?: (section: SettingsSectionId) => void;
  routedLibraryEntrySlug?: string | null;
  routedLibraryCopySlug?: string | null;
  routedSettingsSection?: string | null;
  routedHandoutId?: string | null;
  onHandoutChange?: (handoutId: string) => void;
  onTabChange: (tab: SharedToolsTab) => void;
}) {
  const tabs: SharedToolsTab[] = sharedToolsTabsForRole(role).filter((item) => item !== 'generators');
  const content = useStream(contentService.content$);
  const game = useStream(gameService.game$);
  const libraryView = contentService.buildLibraryView(content);
  const compendiumCollections = role === 'player' ? PLAYER_COMPENDIUM_COLLECTIONS : COMPENDIUM_COLLECTIONS;
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>(
    normalizeSettingsSection((routedSettingsSection as SettingsSectionId | null) ?? (role === 'gm' ? 'game' : 'connection'), role)
  );
  const [libraryEditorDirty, setLibraryEditorDirty] = useState(false);
  const settingsSections = settingsSectionsForRole(role);
  const normalizedSettingsSection = normalizeSettingsSection(activeSettingsSection, role);
  const targetedRule = routedLibraryEntrySlug
    ? content.rules.find((rule) => rule.slug === routedLibraryEntrySlug) ?? null
    : null;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);
  useEffect(() => () => onEditorDirtyChange?.(false), [onEditorDirtyChange]);

  const updateLibraryEditorDirty = useCallback((dirty: boolean) => {
    setLibraryEditorDirty(dirty);
    onEditorDirtyChange?.(dirty);
  }, [onEditorDirtyChange]);

  useEffect(() => {
    contentService.applyGameSourceDefaults(game.id, game.includeVoidContent);
  }, [game.id, game.includeVoidContent]);

  useEffect(() => {
    if (activeTab !== 'library') return;
    // A direct rule-article route is already authoritative. The parent will
    // synchronize the rules collection; applying the ordinary fallback here
    // would erase the targeted article slug during the first render.
    if (routedLibraryEntrySlug) return;
    if (compendiumCollections.some((collection) => collection.key === libraryView.selectedCollection)) return;
    const fallback = compendiumCollections[0];
    if (!fallback) return;
    contentService.setSelectedCollection(fallback.key);
    onLibraryCollectionChange?.(fallback.key);
  }, [activeTab, compendiumCollections, libraryView.selectedCollection, onLibraryCollectionChange, routedLibraryEntrySlug]);

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
  const changeLibraryCollection = (collection: ContentCollectionKey) => {
    if (libraryEditorDirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return;
    updateLibraryEditorDirty(false);
    contentService.setSelectedCollection(collection);
    if (onLibraryCollectionChange) {
      onLibraryCollectionChange(collection);
    } else {
      onTabChange('library');
    }
  };
  const changeTab = (nextTab: SharedToolsTab) => {
    if (libraryEditorDirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return;
    updateLibraryEditorDirty(false);
    onTabChange(nextTab);
  };
  const close = () => {
    if (libraryEditorDirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return;
    onClose();
  };

  return (
    <Dialog aria-label="Библиотека игры" className="player-tools-modal__panel" onClose={close}>
        <header className="player-tools-modal__header">
          <Tabs align="start" className="player-tools-modal__primary-nav" label="Разделы библиотеки">
            {tabs.map((item) => (
              <TabButton active={activeTab === item} key={item} onClick={() => changeTab(item)}>
                {toolTabLabel(item)}
              </TabButton>
            ))}
            {role === 'gm' && (
              <TabButton className="player-tools-modal__external-action" aria-label="Редактор карт" onClick={() => openWorkspaceInNewTab('cards')}>
                <span>Редактор карт</span>
                <ExternalLink size={13} aria-hidden="true" />
              </TabButton>
            )}
          </Tabs>
          <IconButton autoFocus variant="ghost" type="button" title="Закрыть" aria-label="Закрыть библиотеку" onClick={close}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </header>

        {activeTab === 'library' && (
          <Tabs align="start" className="player-tools-modal__context-nav" label="Коллекции справочника">
            {compendiumCollections.map((collection) => (
              <TabButton
                active={libraryView.selectedCollection === collection.key}
                key={collection.key}
                onClick={() => changeLibraryCollection(collection.key)}
              >
                {collection.shortLabel}
              </TabButton>
            ))}
          </Tabs>
        )}

        {activeTab === 'settings' && (
          <Tabs align="start" className="player-tools-modal__context-nav" label="Разделы настроек">
            {settingsSections.map((section) => (
              <TabButton active={normalizedSettingsSection === section} key={section} onClick={() => changeSettingsSection(section)}>
                {settingsSectionLabel(section)}
              </TabButton>
            ))}
          </Tabs>
        )}

        <div
          ref={bodyRef}
          className={`player-tools-modal__body ${activeTab === 'library' ? 'player-tools-modal__body--managed-scroll' : ''}`}
          role="region"
          aria-label="Содержимое библиотеки"
        >
          {activeTab === 'scenes' && (
            <SharedToolsScenesTabHost />
          )}
          {activeTab === 'characters' && role === 'gm' && (
            <SharedToolsCharactersTabHost />
          )}
          {activeTab === 'characters' && role === 'player' && (
            <SharedToolsPlayerCharacterTabHost characterId={targetCharacterId ?? null} />
          )}
          {activeTab === 'combat' && role === 'gm' && (
            <SharedToolsCombatTab />
          )}
          {activeTab === 'library' && (
            <SharedToolsLibraryTab
              copyEntrySlug={routedLibraryCopySlug}
              editable={role === 'gm'}
              libraryView={libraryView}
              onEditorDirtyChange={updateLibraryEditorDirty}
              onCopyEntryConsumed={onLibraryCopyConsumed}
              onEntrySelectionChange={onLibraryEntryChange}
              selectedEntrySlug={routedLibraryEntrySlug}
              targetCharacterId={targetCharacterId}
              targetRule={targetedRule}
            />
          )}
          {activeTab === 'notes' && role === 'gm' && (
            <SharedToolsNotesTabHost />
          )}
          {activeTab === 'handouts' && (
            <SharedToolsHandoutsTabHost role={role} handoutId={routedHandoutId} onHandoutChange={onHandoutChange} />
          )}
          {activeTab === 'settings' && (
            <SharedToolsSettingsTabHost activeSection={normalizedSettingsSection} role={role} />
          )}
        </div>
    </Dialog>
  );
}

function SharedToolsPlayerCharacterTabHost({ characterId }: { characterId: string | null }) {
  const characters = useStream(characterService.characters$);
  const content = useStream(contentService.content$);
  const character = characterId ? characters.entities[characterId] ?? null : null;

  if (!character) {
    return (
      <section className="player-tools-section player-tools-character-editor">
        <EmptyState
          tone="transparent"
          title="Персонаж не выбран"
          body="Выберите своё место игрока, чтобы открыть лист персонажа."
        />
      </section>
    );
  }

  return (
    <section className="player-tools-section player-tools-character-editor" aria-label="Мой персонаж">
      <CharacterEditor character={character} content={content} role="player" />
    </section>
  );
}

function SharedToolsScenesTabHost() {
  const sceneTable = useStream(sceneTableService.sceneTable$);
  return <SharedToolsScenesTab sceneTable={sceneTable} />;
}

function SharedToolsCharactersTabHost() {
  const characters = useStream(characterService.characters$);
  const content = useStream(contentService.content$);
  const game = useStream(gameService.game$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const characterOptions = characters.order.map((id) => characters.entities[id]).filter(Boolean);
  const playerSeats = Object.values(sceneTable.participants).filter((participant) => participant.role === 'player');
  const [characterBuilderOpen, setCharacterBuilderOpen] = useState(false);
  const createCharacterFromBuilder = (input: Partial<Character> & { className?: DaggerheartClass }) => {
    const { character } = tabletopService.createCharacterOnActiveScene(input);
    sceneTableService.createPlayerSeat({
      name: character.name,
      characterId: character.id
    });
    setCharacterBuilderOpen(false);
  };

  return (
    <SharedToolsCharactersTab
      actor={{ id: 'local-gm', name: game.gmName || 'Мастер', role: 'gm' }}
      characterBuilderOpen={characterBuilderOpen}
      characterOptions={characterOptions}
      content={content}
      includePlaytest={game.includeVoidContent}
      onCharacterBuilderClose={() => setCharacterBuilderOpen(false)}
      onCharacterBuilderCreate={createCharacterFromBuilder}
      onCharacterBuilderOpen={() => setCharacterBuilderOpen(true)}
      playerSeats={playerSeats}
      sceneTable={sceneTable}
    />
  );
}

function SharedToolsNotesTabHost() {
  const game = useStream(gameService.game$);
  return <SharedToolsNotesTab game={game} />;
}

function SharedToolsHandoutsTabHost({ role, handoutId, onHandoutChange }: { role: TableViewRole; handoutId?: string | null; onHandoutChange?: (handoutId: string) => void }) {
  const game = useStream(gameService.game$);
  return <SharedToolsHandoutsTab game={game} role={role} initialHandoutId={handoutId} onHandoutChange={onHandoutChange} />;
}

function SharedToolsSettingsTabHost({
  activeSection,
  role
}: {
  activeSection: SettingsSectionId;
  role: TableViewRole;
}) {
  const game = useStream(gameService.game$);
  const characters = useStream(characterService.characters$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const characterOptions = characters.order.map((id) => characters.entities[id]).filter(Boolean);
  const playerSeats = Object.values(sceneTable.participants).filter((participant) => participant.role === 'player');

  return (
    <SharedToolsSettingsTab
      activeSection={activeSection}
      game={game}
      characterOptions={characterOptions}
      playerSeats={playerSeats}
      role={role}
    />
  );
}
