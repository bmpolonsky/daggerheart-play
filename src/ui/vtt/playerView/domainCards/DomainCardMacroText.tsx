/** @jsxImportSource preact */
import { parseContextualDiceMacros } from '../../../../domain/rules/contextualDiceBindings';
import { analyzeFeatureRules } from "../../../../domain/rules/featureEffects";
import { cleanRulesTextForInlineMacros } from "../sheetText";
import type { TableViewRole } from "../types";
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from "./types";
import { RulesMacroText } from "./RulesMacroText";

export function DomainCardMacroText({
  card,
  onMacro
}: {
  card: PlayerViewDomainCard;
  role: TableViewRole;
  onMacro?: (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro) => void;
}) {
  const analysis = analyzeFeatureRules(cleanRulesTextForInlineMacros(card.text));
  const { text, effects } = analysis;
  const parsedCard = { ...card, text };
  return (
    <RulesMacroText
      text={text}
      macros={parseContextualDiceMacros({ cardId: card.id, sourceId: card.sourceId, featureId: card.featureId, collection: card.collection ?? 'domain-cards', slug: card.slug, weaponFormula: card.weaponFormula, text })}
      effects={effects}
      onMacro={onMacro ? (macro) => onMacro(parsedCard, macro) : undefined}
    />
  );
}
