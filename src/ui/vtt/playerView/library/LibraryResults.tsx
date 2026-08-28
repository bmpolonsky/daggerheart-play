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
  const entries = useMemo(
    () => buildLibraryEntries(libraryView, targetCharacterId, targetRule),
    [encounter, libraryView, sceneTable, targetCharacterId, targetRule]
  );
  const [selectedId, setSelectedId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const previousSearchTerm = useRef('');
  const copiedRouteRef = useRef('');
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedEntrySlug || entries.some((entry) => entry.routeSlug === selectedEntrySlug)) return;
    if (libraryView.searchTerm) contentService.setSearchTerm('');
    if (libraryView.sourceFilter !== 'all') contentService.setSourceFilter('all');
    if (libraryView.tierFilter !== 'all') contentService.setTierFilter('all');
    if (libraryView.levelFilter !== 'all') contentService.setLevelFilter('all');
  }, [entries, libraryView.levelFilter, libraryView.searchTerm, libraryView.sourceFilter, libraryView.tierFilter, selectedEntrySlug]);

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
    setSelectedId((current) => {
      if (selectedEntrySlug) {
        return entries.find((entry) => entry.routeSlug === selectedEntrySlug)?.id ?? '';
      }
      if (searchTerm && (searchChanged || !entries.some((entry) => entry.id === current))) {
        return entries[0]?.id ?? '';
      }
      return entries.some((entry) => entry.id === current) ? current : '';
    });
    setActionMessage('');
  }, [entries, libraryView.searchTerm, selectedEntrySlug]);

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
            if (slug !== undefined) onEntrySelectionChange?.(String(slug));
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
            setSelectedId('');
            setActionMessage('');
            if (selectedEntry.routeSlug) onEntrySelectionChange?.(null);
          }}
        />
      )}
    />
  );
}
