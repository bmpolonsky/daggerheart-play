/** @jsxImportSource preact */
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { contentService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { SelectControl, TextControl } from '../../../components/common/Field';
import { SharedToolsCustomCompendiumEditor } from '../sharedTools/SharedToolsCustomCompendiumEditor';
import { compendiumCollectionLabel } from './compendiumCollections';
import type { LibraryEntry } from './libraryDetailTypes';
import { LibraryResults } from './LibraryResults';

export function SharedToolsLibraryTab({ libraryView, targetCharacterId }: { libraryView: ContentLibraryView; targetCharacterId?: string | null }) {
  const editableKind = editableKindForCollection(libraryView.selectedCollection);
  const [editorState, setEditorState] = useState<NonNullable<LibraryEntry['custom']> | null>(null);
  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'Все' },
    { value: 'core', label: 'Corebook' },
    { value: 'void', label: 'Void' },
    { value: 'homebrew', label: 'Homebrew' }
  ] as const, []);

  useEffect(() => {
    setEditorState((current) => {
      if (!editableKind) return null;
      if (current && current.kind !== editableKind) return null;
      return current;
    });
  }, [editableKind]);

  const openCustomEditor = (custom: NonNullable<LibraryEntry['custom']>) => {
    contentService.setSourceFilter('homebrew');
    setEditorState(custom);
  };

  return (
    <section className="player-tools-section player-library-section">
      <header className="player-library-heading">
        <div>
          <strong>Компендиумы</strong>
          <span>{compendiumCollectionLabel(libraryView.selectedCollection)}</span>
        </div>
        <div className="player-library-source">
          <span>{formatSourceMode(libraryView.sourceMode)}</span>
          <span>{libraryView.lastLoadedAt ? new Date(libraryView.lastLoadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '/api'}</span>
        </div>
      </header>

      <div className="player-library-controls">
        <label className="player-tools-field">
          <span>Поиск</span>
          <TextControl value={libraryView.searchTerm} onInput={(event) => contentService.setSearchTerm(event.currentTarget.value)} placeholder="Название, текст, тип..." />
        </label>
        <label className="player-tools-field">
          <span>Источник</span>
          <SelectControl value={libraryView.sourceFilter} onChange={(event) => contentService.setSourceFilter(event.currentTarget.value as ContentLibraryView['sourceFilter'])}>
            {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectControl>
        </label>
        {libraryView.tierOptions.length > 0 && (
          <label className="player-tools-field">
            <span>Ранг</span>
            <SelectControl value={String(libraryView.tierFilter)} onChange={(event) => contentService.setTierFilter(event.currentTarget.value === 'all' ? 'all' : Number(event.currentTarget.value))}>
              <option value="all">Любой ранг</option>
              {libraryView.tierOptions.map((tier) => <option key={tier} value={tier}>Ранг {tier}</option>)}
            </SelectControl>
          </label>
        )}
        {libraryView.levelOptions.length > 0 && (
          <label className="player-tools-field">
            <span>Уровень</span>
            <SelectControl value={String(libraryView.levelFilter)} onChange={(event) => contentService.setLevelFilter(event.currentTarget.value === 'all' ? 'all' : Number(event.currentTarget.value))}>
              <option value="all">Любой уровень</option>
              {libraryView.levelOptions.map((level) => <option key={level} value={level}>Уровень {level}</option>)}
            </SelectControl>
          </label>
        )}
        {editableKind && (
          <Button
            className="player-library-create"
            size="sm"
            type="button"
            variant="primary"
            iconBefore={<Plus size={15} aria-hidden="true" />}
            onClick={() => openCustomEditor({ kind: editableKind, id: 'new' })}
          >
            Создать
          </Button>
        )}
      </div>

      {editorState && (
        <SharedToolsCustomCompendiumEditor
          key={`${editorState.kind}:${editorState.id}`}
          kind={editorState.kind}
          initialId={editorState.id}
          onClose={() => setEditorState(null)}
        />
      )}

      <LibraryResults
        libraryView={libraryView}
        targetCharacterId={targetCharacterId}
        onEditCustom={openCustomEditor}
      />
    </section>
  );
}

function formatSourceMode(mode: ContentLibraryView['sourceMode']): string {
  if (mode === 'api') return 'live /api';
  if (mode === 'cache') return 'cache';
  if (mode === 'mixed') return 'mixed';
  return 'empty';
}

function editableKindForCollection(collection: ContentLibraryView['selectedCollection']): NonNullable<LibraryEntry['custom']>['kind'] | null {
  if (collection === 'adversaries') return 'adversary';
  if (collection === 'environments') return 'environment';
  return null;
}
