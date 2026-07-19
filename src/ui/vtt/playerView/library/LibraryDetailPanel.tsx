/** @jsxImportSource preact */
import { X } from 'lucide-react';
import { AssetImage } from '../../../components/common/AssetImage';
import { Button } from '../../../components/common/Button';
import { IconButton } from '../../../components/common/IconButton';
import type { LibraryEntry } from './libraryDetailTypes';
import { RichText } from './RichText';

export function LibraryDetailPanel({
  actionMessage,
  entry,
  onAction,
  onEditCustom,
  onClose
}: {
  actionMessage: string;
  entry: LibraryEntry | null;
  onAction: (message: string) => void;
  onEditCustom?: (custom: NonNullable<LibraryEntry['custom']>) => void;
  onClose: () => void;
}) {
  if (!entry) return null;

  const hasFooter = entry.actions.length > 0 || Boolean(entry.custom && onEditCustom) || Boolean(actionMessage);

  return (
    <aside className="player-library-detail" aria-label="Полная запись компендиума">
      <div className="player-library-detail__body">
        <IconButton
          className="player-library-detail__close"
          type="button"
          variant="ghost"
          size="sm"
          title="Закрыть описание"
          aria-label="Закрыть описание"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </IconButton>
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
              <AssetImage src={entry.imageUrl} alt="" />
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
      </div>
      {hasFooter && (
        <footer className="player-library-detail__footer">
          {(entry.actions.length > 0 || (entry.custom && onEditCustom)) && (
            <div className="player-library-detail__actions">
              {entry.custom && onEditCustom && (
                <Button size="sm" variant="primary" type="button" onClick={() => {
                  if (entry.custom) onEditCustom(entry.custom);
                }}>
                  Редактировать
                </Button>
              )}
              {entry.actions.map((action) => (
                <Button size="sm" variant="secondary" type="button" key={action.label} onClick={() => {
                  const message = action.onClick();
                  if (message) onAction(message);
                }}>{action.label}</Button>
              ))}
            </div>
          )}
          {actionMessage && <p className="player-library-detail__status" role="status">{actionMessage}</p>}
        </footer>
      )}
    </aside>
  );
}
