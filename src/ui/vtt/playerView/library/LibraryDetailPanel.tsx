/** @jsxImportSource preact */
import { cssImageUrl } from '../helpers';
import type { LibraryEntry } from './libraryDetailTypes';
import { RichText } from './RichText';

export function LibraryDetailPanel({
  actionMessage,
  entry,
  onAction
}: {
  actionMessage: string;
  entry: LibraryEntry | null;
  onAction: (message: string) => void;
}) {
  if (!entry) return null;

  return (
    <aside className="player-library-detail" aria-label="Полная запись компендиума">
      <div className="player-library-detail__body">
        <div className={`player-library-detail__header ${entry.imageUrl ? 'player-library-detail__header--with-art' : ''}`}>
          <div className="player-library-detail__identity">
            <span className="player-library-card__kicker">{entry.kicker}</span>
            <h3>{entry.title}</h3>
            {entry.stats.length > 0 && (
              <div className="player-library-card__stats">
                {entry.stats.map((stat) => <span key={stat}>{stat}</span>)}
              </div>
            )}
          </div>
          {entry.imageUrl && (
            <div className="player-library-detail__art" aria-hidden="true">
              <img src={cssImageUrl(entry.imageUrl)} alt="" loading="lazy" />
            </div>
          )}
        </div>
        <div className="player-library-detail__sections">
          {entry.sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              <RichText text={section.body} />
            </section>
          ))}
        </div>
        {entry.actions.length > 0 && (
          <div className="player-library-detail__actions">
            {entry.actions.map((action) => (
              <button type="button" key={action.label} onClick={() => {
                const message = action.onClick();
                if (message) onAction(message);
              }}>{action.label}</button>
            ))}
          </div>
        )}
        {actionMessage && <p className="player-library-detail__status" role="status">{actionMessage}</p>}
      </div>
    </aside>
  );
}
