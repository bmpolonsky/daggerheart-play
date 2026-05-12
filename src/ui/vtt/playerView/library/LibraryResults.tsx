/** @jsxImportSource preact */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ContentLibraryView } from '../../../../services/ContentService';
import { LibraryDetailPanel } from './LibraryDetailPanel';
import { buildLibraryEntries } from './libraryEntries';
import { LibraryMiniCard } from './LibraryMiniCard';

export function LibraryResults({ libraryView, targetCharacterId }: { libraryView: ContentLibraryView; targetCharacterId?: string | null }) {
  const entries = useMemo(() => buildLibraryEntries(libraryView, targetCharacterId), [libraryView, targetCharacterId]);
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? '');
  const [actionMessage, setActionMessage] = useState('');
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  useEffect(() => {
    setSelectedId((current) => entries.some((entry) => entry.id === current) ? current : entries[0]?.id ?? '');
    setActionMessage('');
  }, [entries]);

  if (entries.length === 0) {
    return <p className="player-tools-empty">Ничего не найдено.</p>;
  }

  return (
    <div className="player-library-browser">
      <div className="player-library-list" aria-label="Записи компендиума">
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
      </div>
      <LibraryDetailPanel actionMessage={actionMessage} entry={selectedEntry} onAction={setActionMessage} />
    </div>
  );
}
