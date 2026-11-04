/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { LibraryRuleEntry } from '../../../../domain/content/types';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { useStream } from '../../../../core/hooks/useStream';
import { contentService, encounterService, sceneTableService } from '../../../../services/serviceRegistry';
import { ListDetailLayout } from '../../../components/common';
import { LibraryDetailPanel } from './LibraryDetailPanel';
import { buildLibraryEntries } from './libraryEntries';
import { LibraryMiniCard } from './LibraryMiniCard';
import type { LibraryEntry } from './libraryDetailTypes';
import { CompendiumEntityEditor, type CompendiumEditorTarget } from './CompendiumEntityEditor';
import { shouldRecoverLibraryFilters } from '../../../../domain/content/libraryPresentation';

export function LibraryResults({
  libraryView,
  editable = false,
  editorTarget,
  editorDirty,
  copyEntrySlug,
  onEditorDirtyChange,
  onEditorTargetChange,
  onCopyEntryConsumed,
  onDetailOpenChange,
  onEntrySelectionChange,
  selectedEntrySlug,
  targetRule,
  targetCharacterId
}: {
  libraryView: ContentLibraryView;
  editable?: boolean;
  editorTarget?: CompendiumEditorTarget | null;
  editorDirty?: boolean;
  copyEntrySlug?: string | null;
  onEditorDirtyChange?: (dirty: boolean) => void;
  onEditorTargetChange?: (target: CompendiumEditorTarget | null) => void;
  onCopyEntryConsumed?: () => void;
  onDetailOpenChange?: (open: boolean) => void;
  onEntrySelectionChange?: (slug: string | null) => void;
  selectedEntrySlug?: string | null;
  targetRule?: LibraryRuleEntry | null;
  targetCharacterId?: string | null;
}) {
  const encounter = useStream(encounterService.encounter$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const content = useStream(contentService.content$);
  const entries = useMemo(
    () => buildLibraryEntries(libraryView, targetCharacterId, targetRule),
    [encounter, libraryView, sceneTable, targetCharacterId, targetRule]
  );
  const [selectedId, setSelectedId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const previousSearchTerm = useRef('');
  const closedSearchContext = useRef<string | null>(null);
  const searchContext = JSON.stringify([libraryView.selectedCollection, libraryView.searchTerm.trim(), libraryView.sourceFilter, libraryView.tierFilter, libraryView.levelFilter]);
  const copiedRouteRef = useRef('');
  const [savedEntrySlug, setSavedEntrySlug] = useState<string | null>(null);
  useEffect(() => setSavedEntrySlug(null), [libraryView.selectedCollection]);
  const savedEntry = useMemo(() => {
    if (!savedEntrySlug) return null;
    const unfilteredView = contentService.buildLibraryView({
      ...content,
      selectedCollection: libraryView.selectedCollection,
      searchTerm: '', sourceFilter: 'all', tierFilter: 'all', levelFilter: 'all'
    });
    return buildLibraryEntries(unfilteredView, targetCharacterId, targetRule)
      .find((entry) => entry.routeSlug === savedEntrySlug) ?? null;
  }, [content, libraryView.selectedCollection, savedEntrySlug, targetCharacterId, targetRule]);
  const selectedEntry = entries.find((entry) => entry.id === selectedId)
    ?? (selectedEntrySlug === savedEntrySlug ? savedEntry : null);

  useEffect(() => {
    if (!shouldRecoverLibraryFilters({ selectedSlug: selectedEntrySlug, visibleSlugs: entries.map((entry) => entry.routeSlug), editorOpen: Boolean(editorTarget), savedSlug: savedEntrySlug })) return;
    if (libraryView.searchTerm) contentService.setSearchTerm('');
    if (libraryView.sourceFilter !== 'all') contentService.setSourceFilter('all');
    if (libraryView.tierFilter !== 'all') contentService.setTierFilter('all');
    if (libraryView.levelFilter !== 'all') contentService.setLevelFilter('all');
  }, [editorTarget, entries, libraryView.levelFilter, libraryView.searchTerm, libraryView.sourceFilter, libraryView.tierFilter, savedEntrySlug, selectedEntrySlug]);

  useEffect(() => {
    if (!copyEntrySlug || copyEntrySlug !== selectedEntrySlug) return;
    const entry = entries.find((candidate) => candidate.routeSlug === copyEntrySlug);
    const copyKey = `${entry?.editable?.collection ?? ''}:${copyEntrySlug}`;
    if (!entry?.editable || copiedRouteRef.current === copyKey) return;
    copiedRouteRef.current = copyKey;
    onEditorTargetChange?.({
      collection: entry.editable.collection,
      raw: contentService.createCustomCopy(entry.editable.collection, entry.editable.raw),
      persisted: false
    });
    onCopyEntryConsumed?.();
  }, [copyEntrySlug, entries, onCopyEntryConsumed, onEditorTargetChange, selectedEntrySlug]);

  useEffect(() => {
    const searchTerm = libraryView.searchTerm.trim();
    const searchChanged = searchTerm !== previousSearchTerm.current;
    previousSearchTerm.current = searchTerm;
    if (searchChanged || closedSearchContext.current !== searchContext) closedSearchContext.current = null;
    setSelectedId((current) => {
      if (selectedEntrySlug) {
        return entries.find((entry) => entry.routeSlug === selectedEntrySlug)?.id
          ?? (selectedEntrySlug === savedEntrySlug ? savedEntry?.id : '') ?? '';
      }
      // An explicit close is not a missing result: keep this filtered list open
      // until another selection, search/filter change or routed entry opens it.
      if (closedSearchContext.current === searchContext) return '';
      if (searchTerm && (searchChanged || !entries.some((entry) => entry.id === current))) {
        return entries[0]?.id ?? '';
      }
      return entries.some((entry) => entry.id === current) ? current : '';
    });
    setActionMessage('');
  }, [entries, libraryView.searchTerm, savedEntry, savedEntrySlug, searchContext, selectedEntrySlug]);

  useEffect(() => {
    onDetailOpenChange?.(Boolean(selectedEntry || editorTarget));
  }, [editorTarget, onDetailOpenChange, selectedEntry]);

  const leaveEditor = () => {
    if (editorDirty && typeof window !== 'undefined' && !window.confirm('Отменить несохранённые изменения?')) return false;
    onEditorTargetChange?.(null);
    return true;
  };

  return (
    <ListDetailLayout
      className="player-library-workspace"
      listLabel="Записи компендиума"
      detailLabel="Детали записи"
      listClassName="player-library-list"
      list={(
        <>
          {entries.length === 0 && <p className="player-tools-empty">Ничего не найдено.</p>}
          {entries.map((entry) => (
            <LibraryMiniCard
              body={entry.preview}
              imageUrl={entry.imageUrl}
              isSelected={selectedEntry?.id === entry.id}
              key={entry.id}
              kicker={entry.kicker}
              stats={entry.listStats ?? entry.stats}
              title={entry.title}
              onSelect={() => {
                if (editorTarget && !leaveEditor()) return;
                closedSearchContext.current = null;
                setSelectedId(entry.id);
                if (entry.routeSlug) onEntrySelectionChange?.(entry.routeSlug);
              }}
            />
          ))}
        </>
      )}
      detail={editorTarget ? (
        <CompendiumEntityEditor
          key={`${editorTarget.collection}:${String(editorTarget.raw.id ?? editorTarget.raw.slug ?? '')}`}
          target={editorTarget}
          onDirtyChange={onEditorDirtyChange}
          onSaved={(target) => {
            onEditorTargetChange?.(target);
            const slug = target.raw.slug ?? target.raw.id;
            if (slug !== undefined) {
              setSavedEntrySlug(String(slug));
              onEntrySelectionChange?.(String(slug));
            }
          }}
          onClose={() => onEditorTargetChange?.(null)}
        />
      ) : selectedEntry && (
        <LibraryDetailPanel
          actionMessage={actionMessage}
          entry={selectedEntry}
          onAction={setActionMessage}
          onEdit={editable ? (target) => onEditorTargetChange?.({ collection: target.collection, raw: target.raw, persisted: true }) : undefined}
          onCopy={editable ? (target) => onEditorTargetChange?.({ collection: target.collection, raw: contentService.createCustomCopy(target.collection, target.raw), persisted: false }) : undefined}
          onClose={() => {
            closedSearchContext.current = searchContext;
            setSelectedId('');
            setActionMessage('');
            if (selectedEntry.routeSlug) onEntrySelectionChange?.(null);
          }}
        />
      )}
    />
  );
}
