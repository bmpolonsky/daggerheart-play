/** @jsxImportSource preact */
import { compactLibraryText } from '../../../../domain/content/libraryPresentation';
import { AssetImage } from '../../../components/common/AssetImage';
import { ChoiceCard } from '../../../components/common/ChoiceCard';

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
    <ChoiceCard className={`player-library-card ${hasImage ? 'player-library-card--with-art' : ''}`} selected={isSelected} onClick={onSelect}>
      {hasImage && (
        <div className="player-library-card__art" aria-hidden="true">
          <AssetImage src={resolvedImageUrl} alt="" />
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
    </ChoiceCard>
  );
}
