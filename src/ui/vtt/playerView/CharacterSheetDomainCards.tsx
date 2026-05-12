/** @jsxImportSource preact */
import type { JSX } from "preact";
import { cssImageUrl } from "./helpers";
import { TrackDots } from "./PlayerSheetControls";
import type { PlayerViewDomainCard } from "./domainCards/types";

export function CharacterSheetDomainCards({
  cards,
  onPreview,
  onTokenChange
}: {
  cards: PlayerViewDomainCard[];
  onPreview: (cardId: string) => void;
  onTokenChange: (cardId: string, value: number) => void;
}) {
  const openCardPreview = (event: JSX.TargetedMouseEvent<HTMLElement>, cardId: string) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, select, textarea, a')) return;
    onPreview(cardId);
  };

  return (
    <>
      {cards.map((card) => (
        <article
          className={`player-sheet-row player-sheet-row--featured ${card.imageUrl ? 'player-domain-card-preview' : ''}`}
          key={card.id}
          role="button"
          tabIndex={0}
          onClick={(event) => openCardPreview(event, card.id)}
          onKeyDown={(event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('button, input, select, textarea, a')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onPreview(card.id);
          }}
        >
          {card.imageUrl && <img src={cssImageUrl(card.imageUrl)} alt="" />}
          <div>
            <strong>{card.name}</strong>
            <span>{card.domainLabel} {card.level}</span>
            {card.tokens.max > 0 && (
              <TrackDots
                value={card.tokens.value}
                max={card.tokens.max}
                tone="hope"
                onSet={(next) => onTokenChange(card.id, next)}
              />
            )}
          </div>
        </article>
      ))}
    </>
  );
}
