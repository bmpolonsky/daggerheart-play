/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { ListDetailLayout } from '../../../components/common';
import { LibraryDetailPanel } from './LibraryDetailPanel';
import { buildLibraryEntries } from './libraryEntries';
import { LibraryMiniCard } from './LibraryMiniCard';
import type { LibraryEntry } from './libraryDetailTypes';

export function LibraryResults({
  libraryView,
  onEditCustom,
  onDetailOpenChange,
  targetCharacterId
}: {
  libraryView: ContentLibraryView;
  onEditCustom?: (custom: NonNullable<LibraryEntry['custom']>) => void;
  onDetailOpenChange?: (open: boolean) => void;
  targetCharacterId?: string | null;
}) {
  const entries = useMemo(() => buildLibraryEntries(libraryView, targetCharacterId), [libraryView, targetCharacterId]);
  const [selectedId, setSelectedId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId((current) => entries.some((entry) => entry.id === current) ? current : '');
    setActionMessage('');
  }, [entries]);

  useEffect(() => {
    onDetailOpenChange?.(Boolean(selectedEntry));
  }, [onDetailOpenChange, selectedEntry]);

  if (entries.length === 0) {
    return <p className="player-tools-empty">Ничего не найдено.</p>;
  }

  return (
    <ListDetailLayout
      listLabel="Записи компендиума"
      detailLabel="Детали записи"
      listClassName="player-library-list"
      list={(
        <>
          {entries.map((entry) => (
            <LibraryMiniCard
              body={entry.preview}
              imageUrl={entry.imageUrl}
              isSelected={selectedEntry?.id === entry.id}
              key={entry.id}
              kicker={entry.kicker}
              stats={entry.stats}
              title={entry.title}
              onSelect={() => setSelectedId(entry.id)}
            />
          ))}
        </>
      )}
      detail={selectedEntry && (
        <LibraryDetailPanel
          actionMessage={actionMessage}
          entry={selectedEntry}
          onAction={setActionMessage}
          onEditCustom={onEditCustom}
          onClose={() => {
            setSelectedId('');
            setActionMessage('');
          }}
        />
      )}
    />
  );
}
