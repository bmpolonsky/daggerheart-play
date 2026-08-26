/** @jsxImportSource preact */
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { ContentLibraryView } from '../../../../services/ContentService';
import type { LibraryRuleEntry } from '../../../../domain/content/types';
import { contentService } from '../../../../services/serviceRegistry';
import { Button } from '../../../components/common/Button';
import { SelectControl } from '../../../components/common/Field';
import { SearchField } from '../../../components/common/SearchField';
import { SegmentedControl } from '../../../components/common/SegmentedControl';
import { Toolbar } from '../../../components/common/Toolbar';
import type { CompendiumEditorTarget } from './CompendiumEntityEditor';
import { LibraryResults } from './LibraryResults';

export function SharedToolsLibraryTab({
  libraryView,
  copyEntrySlug,
  editable = false,
  onEditorDirtyChange,
  onCopyEntryConsumed,
  onEntrySelectionChange,
  selectedEntrySlug,
  targetCharacterId,
  targetRule
}: {
  libraryView: ContentLibraryView;
  copyEntrySlug?: string | null;
  editable?: boolean;
  onEditorDirtyChange?: (dirty: boolean) => void;
  onCopyEntryConsumed?: () => void;
  onEntrySelectionChange?: (slug: string | null) => void;
  selectedEntrySlug?: string | null;
  targetCharacterId?: string | null;
  targetRule?: LibraryRuleEntry | null;
}) {
  const editableCollection = editable && libraryView.selectedCollection !== 'rules' ? libraryView.selectedCollection : null;
  const [editorTarget, setEditorTarget] = useState<CompendiumEditorTarget | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'Все' },
    { value: 'core', label: 'Основная книга' },
    { value: 'void', label: 'The Void' },
    { value: 'homebrew', label: 'Свои' }
  ], []);
  useEffect(() => {
    setEditorTarget((current) => current && current.collection !== libraryView.selectedCollection ? null : current);
  }, [libraryView.selectedCollection]);
  const updateDirty = useCallback((dirty: boolean) => {
    setEditorDirty(dirty);
    onEditorDirtyChange?.(dirty);
  }, [onEditorDirtyChange]);
  const createEntry = () => {
    if (!editableCollection) return;
    if (editorDirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return;
    setEditorTarget({ collection: editableCollection, raw: contentService.createCustomCopy(editableCollection), persisted: false });
  };

  return (
    <section className={`player-tools-section player-library-section ${editableCollection ? 'player-library-section--has-actions' : ''} ${editorTarget ? 'player-library-section--editing' : ''} ${detailOpen ? 'player-library-section--detail-open' : ''}`.trim()}>
      {editableCollection && (
        <Toolbar className="player-tools-section-actions" aria-label="Действия справочника">
          <Button size="sm" type="button" variant="primary" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={createEntry}>
            Создать
          </Button>
        </Toolbar>
      )}

      <div className="player-library-controls">
        <SearchField
          className="player-library-search"
          aria-label="Поиск по справочнику"
          value={libraryView.searchTerm}
          onInput={(event) => {
            onEntrySelectionChange?.(null);
            contentService.setSearchTerm(event.currentTarget.value);
          }}
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

      <LibraryResults
          copyEntrySlug={copyEntrySlug}
          editable={editable}
          libraryView={libraryView}
          targetCharacterId={targetCharacterId}
          editorTarget={editorTarget}
          editorDirty={editorDirty}
          onEditorDirtyChange={updateDirty}
          onEditorTargetChange={setEditorTarget}
          onCopyEntryConsumed={onCopyEntryConsumed}
          onDetailOpenChange={setDetailOpen}
          onEntrySelectionChange={onEntrySelectionChange}
          selectedEntrySlug={selectedEntrySlug}
          targetRule={targetRule}
      />
    </section>
  );
}
