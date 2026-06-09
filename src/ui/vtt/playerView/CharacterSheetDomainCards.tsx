/** @jsxImportSource preact */
import { TrackDots } from "./PlayerSheetControls";
import type { PlayerViewDomainCard } from "./domainCards/types";
import { AssetImage } from "../../components/common/AssetImage";
import { ListItem } from "../../components/common/ListItem";

type EventWithTarget = {
  target: EventTarget | null;
};

export function CharacterSheetDomainCards({
  cards,
  onPreview,
  onTokenChange
}: {
  cards: PlayerViewDomainCard[];
  onPreview: (cardId: string) => void;
  onTokenChange: (cardId: string, value: number) => void;
}) {
  const openCardPreview = (event: EventWithTarget, cardId: string) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, select, textarea, a')) return;
    onPreview(cardId);
  };

  return (
    <>
      {cards.map((card) => (
        <ListItem
          key={card.id}
          align="start"
          tone="featured"
          title={card.name}
          subtitle={`${card.domainLabel} ${card.level}`}
          leftAccessory={card.imageUrl ? <AssetImage className="player-domain-card-thumb" src={card.imageUrl} alt="" /> : undefined}
          detail={card.tokens.max > 0 && (
            <TrackDots
              value={card.tokens.value}
              max={card.tokens.max}
              tone="hope"
              onSet={(next) => onTokenChange(card.id, next)}
            />
          )}
          onClick={(event) => openCardPreview(event, card.id)}
          onKeyDown={(event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('button, input, select, textarea, a')) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onPreview(card.id);
          }}
        />
      ))}
    </>
  );
}
