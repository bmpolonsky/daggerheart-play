/** @jsxImportSource preact */
import { X } from 'lucide-react';
import { IconButton, SectionHeader, Surface } from '../components/common';
import { WorldLibraryPanel } from '../worlds/WorldLibraryPanel';

export function StoredGamesCard({ onClose }: { onClose: () => void }) {
  return (
    <Surface className="role-entry__card role-entry__games-card" aria-label="Миры">
      <SectionHeader title="Миры" actions={(
        <IconButton autoFocus size="sm" variant="ghost" title="Закрыть" aria-label="Закрыть миры" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )} />
      <WorldLibraryPanel onOpen={onClose} />
    </Surface>
  );
}
