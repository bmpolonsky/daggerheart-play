/** @jsxImportSource preact */
import { contextualFeatureOrigin, parseContextualDiceMacros } from '../../../../../domain/rules/contextualDiceBindings';
import { analyzeFeatureRules } from '../../../../../domain/rules/featureEffects';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { RulesMacroText } from '../../domainCards/RulesMacroText';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../../domainCards/types';
import type { TableViewRole } from '../../types';
import { renderRulesText } from '../../sheetText';
import { FeedCardHeader } from './RollFeedCard';

export function FeatureFeedCard({
  item,
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
        <p>{renderRulesText(item.body, { cleanHtml: true })}</p>
      </>
    );
  }
  const analysis = analyzeFeatureRules(feature.text);
  const previewCard = toFeaturePreviewCard(feature, analysis.text);
  const hasText = Boolean(analysis.text.trim());
  return (
    <>
      <FeedCardHeader item={item} label={item.kicker} />
      <div className="feed-feature-card">
        <strong>{feature.name}</strong>
        {feature.subtitle && <span>{feature.subtitle}</span>}
        {hasText && (
          <p>
            <RulesMacroText
              text={analysis.text}
              macros={previewCard.macros}
              effects={analysis.effects}
              onMacro={onMacro ? (macro) => onMacro(previewCard, macro) : undefined}
            />
          </p>
        )}
      </div>
    </>
  );
}

function toFeaturePreviewCard(feature: NonNullable<TableFeedItem['feature']>, text = feature.text): PlayerViewDomainCard {
  return {
    id: feature.id,
    ...contextualFeatureOrigin(feature),
    sourceId: feature.sourceId,
    featureId: feature.featureId ?? contextualFeatureOrigin(feature).featureId,
    collection: feature.collection ?? contextualFeatureOrigin(feature).collection,
    slug: feature.slug ?? contextualFeatureOrigin(feature).slug,
    weaponFormula: feature.weaponFormula,
    name: feature.name,
    domain: 'Codex',
    domainLabel: 'Особенность',
    level: 1,
    cost: '',
    recallCost: '',
    text,
    imageUrl: '',
    inHand: false,
    permanentlyVaulted: false,
    tokens: { value: 0, max: 0 },
    macros: parseContextualDiceMacros({ cardId: feature.id, sourceId: feature.sourceId, featureId: feature.featureId ?? contextualFeatureOrigin(feature).featureId, collection: feature.collection ?? contextualFeatureOrigin(feature).collection, slug: feature.slug ?? contextualFeatureOrigin(feature).slug, weaponFormula: feature.weaponFormula, text })
  };
}
