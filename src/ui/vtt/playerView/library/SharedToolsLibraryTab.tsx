/** @jsxImportSource preact */
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { contentService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { SelectControl } from '../../../components/common/Field';
import { SearchField } from '../../../components/common/SearchField';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { Toolbar } from '../../../components/common/Toolbar';
import { SharedToolsCustomCompendiumEditor } from '../sharedTools/SharedToolsCustomCompendiumEditor';
import type { LibraryEntry } from './libraryDetailTypes';
import { LibraryResults } from './LibraryResults';

export function SharedToolsLibraryTab({ libraryView, targetCharacterId }: { libraryView: ContentLibraryView; targetCharacterId?: string | null }) {
  const editableKind = editableKindForCollection(libraryView.selectedCollection);
  const [editorState, setEditorState] = useState<NonNullable<LibraryEntry['custom']> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'Все' },
    { value: 'core', label: 'Core' },
    { value: 'void', label: 'Void' },
    { value: 'homebrew', label: 'Homebrew' }
  ], []);
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
    <section className={`player-tools-section player-library-section ${editableKind ? 'player-library-section--has-actions' : ''} ${editorState ? 'player-library-section--editing' : ''} ${detailOpen ? 'player-library-section--detail-open' : ''}`.trim()}>
      {editableKind && (
        <Toolbar className="player-tools-section-actions" aria-label="Действия справочника">
          <Button size="sm" type="button" variant="primary" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => openCustomEditor({ kind: editableKind, id: 'new' })}>
            Создать
          </Button>
        </Toolbar>
      )}

      <div className="player-library-controls">
        <SearchField
          className="player-library-search"
          aria-label="Поиск по справочнику"
          value={libraryView.searchTerm}
          onInput={(event) => contentService.setSearchTerm(event.currentTarget.value)}
          placeholder="Найти по названию, эффекту или типу..."
        />
        <SegmentedControl
          className="player-library-source-filter"
          label="Источник материалов"
          value={libraryView.sourceFilter}
          options={sourceOptions}
          onChange={(value) => contentService.setSourceFilter(value as ContentLibraryView['sourceFilter'])}
        />
        {(libraryView.tierOptions.length > 0 || libraryView.levelOptions.length > 0) && (
          <Toolbar className="player-library-scope" aria-label="Дополнительные фильтры">
            {libraryView.tierOptions.length > 0 && (
              <SelectControl aria-label="Фильтр по рангу" value={String(libraryView.tierFilter)} onChange={(event) => contentService.setTierFilter(event.currentTarget.value === 'all' ? 'all' : Number(event.currentTarget.value))}>
                <option value="all">Любой ранг</option>
                {libraryView.tierOptions.map((tier) => <option key={tier} value={tier}>Ранг {tier}</option>)}
              </SelectControl>
            )}
            {libraryView.levelOptions.length > 0 && (
              <SelectControl aria-label="Фильтр по уровню" value={String(libraryView.levelFilter)} onChange={(event) => contentService.setLevelFilter(event.currentTarget.value === 'all' ? 'all' : Number(event.currentTarget.value))}>
                <option value="all">Любой уровень</option>
                {libraryView.levelOptions.map((level) => <option key={level} value={level}>Уровень {level}</option>)}
              </SelectControl>
            )}
          </Toolbar>
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

      {!editorState && (
        <LibraryResults
          libraryView={libraryView}
          targetCharacterId={targetCharacterId}
          onEditCustom={openCustomEditor}
          onDetailOpenChange={setDetailOpen}
        />
      )}
    </section>
  );
}

function editableKindForCollection(collection: ContentLibraryView['selectedCollection']): NonNullable<LibraryEntry['custom']>['kind'] | null {
  if (collection === 'adversaries') return 'adversary';
  if (collection === 'environments') return 'environment';
  return null;
}
