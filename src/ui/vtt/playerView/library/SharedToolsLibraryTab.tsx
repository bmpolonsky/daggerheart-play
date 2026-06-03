/** @jsxImportSource preact */
import type { ContentLibraryView } from '../../../../services/ContentService';
import { contentService } from '../../../../services/serviceRegistry';
import { TextControl } from '../../../components/common/Field';
import { compendiumCollectionLabel } from './compendiumCollections';
import { LibraryResults } from './LibraryResults';

export function SharedToolsLibraryTab({ libraryView, targetCharacterId }: { libraryView: ContentLibraryView; targetCharacterId?: string | null }) {
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
      </div>

      <LibraryResults libraryView={libraryView} targetCharacterId={targetCharacterId} />
    </section>
  );
}

function formatSourceMode(mode: ContentLibraryView['sourceMode']): string {
  if (mode === 'api') return 'live /api';
  if (mode === 'cache') return 'cache';
  if (mode === 'mixed') return 'mixed';
  return 'empty';
}
