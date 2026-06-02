/** @jsxImportSource preact */
import { parseDomainCardTextMacros } from '../../../../../domain/rules/domainCards';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { DomainCardMacroText } from '../../domainCards/DomainCardMacroText';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../../domainCards/types';
import type { TableViewRole } from '../../types';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function FeatureFeedCard({
  item,
  role,
  onMacro
}: {
  item: TableFeedItem;
  role: TableViewRole;
  onMacro?: (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro) => void;
}) {
  const feature = item.feature;
  if (!feature) {
    return (
      <>
        <FeedCardHeader item={item} label={item.kicker} />
        <strong>{item.title}</strong>
        <p>{renderRulesText(item.body)}</p>
      </>
    );
  }
  const previewCard = toFeaturePreviewCard(feature);
  const hasText = Boolean(feature.text.trim());
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <div className="feed-feature-card">
        <strong>{feature.name}</strong>
        {feature.subtitle && <span>{feature.subtitle}</span>}
        {hasText && (
          <p>
            {onMacro
              ? <DomainCardMacroText card={previewCard} role={role} onMacro={onMacro} />
              : renderRulesText(feature.text)}
          </p>
        )}
      </div>
    </>
  );
}

function toFeaturePreviewCard(feature: NonNullable<TableFeedItem['feature']>): PlayerViewDomainCard {
  return {
    id: feature.id,
    name: feature.name,
    domain: 'Codex',
    domainLabel: 'Особенность',
    level: 1,
    cost: '',
    recallCost: '',
    text: feature.text,
    imageUrl: '',
    tokens: { value: 0, max: 0 },
    macros: parseDomainCardTextMacros(feature.text)
  };
}
