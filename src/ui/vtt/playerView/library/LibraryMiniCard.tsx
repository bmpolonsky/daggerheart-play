/** @jsxImportSource preact */
import { cleanMarkdownText } from '../../../../core/utils/markdownText';
import { cssImageUrl } from '../helpers';

export function LibraryMiniCard({
  body,
  imageUrl,
  isSelected,
  kicker,
  stats = [],
  title,
  onSelect
}: {
  body: string;
  imageUrl?: string | null;
  isSelected: boolean;
  kicker: string;
  stats?: string[];
  title: string;
  onSelect: () => void;
}) {
  const resolvedImageUrl = imageUrl?.trim() ?? '';
  const hasImage = Boolean(resolvedImageUrl);
  return (
    <button className={`player-library-card ${isSelected ? 'dh-is-selected' : ''} ${hasImage ? 'player-library-card--with-art' : ''}`} type="button" onClick={onSelect}>
      {hasImage && (
        <div className="player-library-card__art" aria-hidden="true">
          <img src={cssImageUrl(resolvedImageUrl)} alt="" loading="lazy" />
        </div>
      )}
      <div className="player-library-card__body">
        <span className="player-library-card__kicker">{kicker}</span>
        <strong>{title}</strong>
        <p>{compactLibraryText(body)}</p>
        {stats.length > 0 && (
          <div className="player-library-card__stats">
            {stats.filter(Boolean).slice(0, 5).map((stat) => <span key={stat}>{stat}</span>)}
          </div>
        )}
      </div>
    </button>
  );
}

function compactLibraryText(value: string): string {
  const normalized = cleanMarkdownText(value, { stripEmphasis: true })
    .replace(/^#+\s*/gm, '')
    .replace(/\|{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'Описание отсутствует в импортированных данных.';
  return normalized.length > 190 ? `${normalized.slice(0, 187).trim()}...` : normalized;
}
