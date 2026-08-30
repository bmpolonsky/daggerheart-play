/** @jsxImportSource preact */
import { parseDomainCardTextMacros } from "../../../../domain/rules/domainCards";
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
      macros={parseDomainCardTextMacros(text)}
      effects={effects}
      onMacro={onMacro ? (macro) => onMacro(parsedCard, macro) : undefined}
    />
  );
}
