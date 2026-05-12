/** @jsxImportSource preact */
import { parseDomainCardTextMacros } from "../../../../domain/rules/domainCards";
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
  onMacro: (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro) => void;
}) {
  const text = cleanRulesTextForInlineMacros(card.text);
  const parsedCard = { ...card, text };
  return <RulesMacroText text={text} macros={parseDomainCardTextMacros(text)} onMacro={(macro) => onMacro(parsedCard, macro)} />;
}
