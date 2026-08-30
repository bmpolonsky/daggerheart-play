/** @jsxImportSource preact */
import { parseDomainCardTextMacros } from '../../../../../domain/rules/domainCards';
import { domainLabel } from '../../../../../domain/rules/constants';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { AssetImage } from '../../../../components/common/AssetImage';
import { DomainCardMacroText } from '../../domainCards/DomainCardMacroText';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../../domainCards/types';
import type { TableViewRole } from '../../types';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function DomainCardFeedCard({
  item,
  role,
  onMacro
}: {
  item: TableFeedItem;
  role: TableViewRole;
  onMacro?: (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro) => void;
}) {
  const card = item.card;
  if (!card) return <MessageFeedFallback item={item} />;
  const previewCard = toPreviewCard(card);
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker || 'Карта'} />
      <div className="feed-domain-card">
        {card.imageUrl && <AssetImage src={card.imageUrl} alt="" />}
        <div className="feed-domain-card__body">
          <span>{domainLabel(card.domain)} — уровень {card.level}</span>
          <strong>{card.name}</strong>
          <p>
            {previewCard.text
              ? <DomainCardMacroText card={previewCard} role={role} onMacro={onMacro} />
              : renderRulesText(item.body)}
          </p>
        </div>
      </div>
    </>
  );
}

function toPreviewCard(card: NonNullable<TableFeedItem['card']>): PlayerViewDomainCard {
  return {
    id: card.id,
    name: card.name,
    domain: card.domain,
    domainLabel: domainLabel(card.domain),
    level: card.level,
    cost: card.cost?.trim() ?? '',
    recallCost: card.recallCost?.trim() ?? '',
    text: card.text,
    imageUrl: card.imageUrl ?? '',
    inHand: false,
    permanentlyVaulted: false,
    loadoutChoicePending: false,
    tokens: card.tokens,
    macros: parseDomainCardTextMacros(card.text)
  };
}

function MessageFeedFallback({ item }: { item: TableFeedItem }) {
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <strong>{item.title}</strong>
      <p>{renderRulesText(item.body)}</p>
    </>
  );
}
