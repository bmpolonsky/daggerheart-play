import type { PlayerViewCharacterSummary } from "../../../../domain/tabletop/playerView";
import type { DamageType, RollPublication } from "../../../../domain/rules/types";
import { cleanMarkdownText } from "../../../../core/utils/markdownText";
import { planDomainCardResourceMacro, resolveDomainCardDiceFormula } from "../../../../domain/rules/domainCards";
import { characterService, gameService, diceService, feedService, p2pSessionService } from "../../../../services/serviceRegistry";
import type { PlayerRollDraft, TableViewRole } from "../types";
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from "./types";

export interface DomainCardMacroActionContext {
  character: PlayerViewCharacterSummary;
  role: TableViewRole;
  publication?: RollPublication;
  sourceLabel?: string;
  openRollDraft: (draft: PlayerRollDraft) => void;
  afterAction?: () => void;
}

export function runDomainCardMacroAction(
  card: PlayerViewDomainCard,
  macro: PlayerViewDomainCardMacro,
  context: DomainCardMacroActionContext
): void {
  const { character, role } = context;
  const sourceLabel = context.sourceLabel ?? 'Карта';
  if (macro.kind === 'actionRoll') {
    context.openRollDraft({
      kind: 'card',
      title: macro.label,
      subtitle: `${card.name}${macro.difficulty ? ` / Сложность ${macro.difficulty}` : ''}`,
      trait: macro.traitHint === 'spellcast' && character.spellcastTrait ? character.spellcastTrait : character.traits[0]?.id ?? 'presence',
      cardId: card.id,
      difficulty: macro.difficulty ?? 0,
      notes: `${sourceLabel}: ${card.name}. ${macro.label}`
    });
    context.afterAction?.();
    return;
  }
  if (macro.kind === 'damageRoll') {
    if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
      void p2pSessionService.submitPlayerRollIntent({
        actorId: character.id,
        actorName: character.name,
        intent: {
          type: 'damage',
          formula: macro.formula,
          damageType: macro.damageType as DamageType | undefined,
          notes: `${sourceLabel}: ${card.name}. ${macro.label}`
        }
      });
      context.afterAction?.();
      return;
    }
    diceService.rollDamage({
      actorId: character.id,
      actorName: character.name,
      formula: macro.formula,
      damageType: macro.damageType as DamageType | undefined,
      notes: `${sourceLabel}: ${card.name}. ${macro.label}`
    });
    context.afterAction?.();
    return;
  }
  if (macro.kind === 'diceRoll') {
    const formula = resolveDomainCardDiceFormula(macro, character.proficiency);
    const label = formula === macro.formula ? macro.label : `${macro.label} -> ${formula}`;
    if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
      void p2pSessionService.submitPlayerRollIntent({
        actorId: character.id,
        actorName: character.name,
        intent: {
          type: 'manualDice',
          formula,
          label,
          notes: `${sourceLabel}: ${card.name}. ${macro.label}`
        }
      });
      context.afterAction?.();
      return;
    }
    diceService.rollManualDice({
      actorId: character.id,
      actorName: character.name,
      formula,
      label,
      notes: `${sourceLabel}: ${card.name}. ${macro.label}`
    });
    context.afterAction?.();
    return;
  }
  if (!('amount' in macro)) return;
  const actionCard = normalizeMacroActionCard(card);
  const plan = planDomainCardResourceMacro(actionCard, macro, role);
  if (!plan?.canApply) {
    if (plan?.warning) {
      logDomainCardResourceUse(character.name, card.name, `не применено: ${compactResourceMacroLabel(macro)}`, context.publication, sourceLabel);
    }
    return;
  }
  const applied = applySourceResourceMacro(character, actionCard, macro, role);
  logDomainCardResourceUse(
    character.name,
    card.name,
    applied ? compactResourceMacroLabel(macro) : `не хватает: ${compactResourceMacroLabel(macro)}`,
    context.publication,
    sourceLabel
  );
  if (applied) context.afterAction?.();
}

function normalizeMacroActionCard(card: PlayerViewDomainCard): PlayerViewDomainCard {
  return {
    ...card,
    text: cleanMarkdownText(card.text, { stripEmphasis: true, stripCodeTicks: true })
  };
}

function applySourceResourceMacro(
  character: PlayerViewCharacterSummary,
  card: PlayerViewDomainCard,
  macro: Extract<PlayerViewDomainCardMacro, { amount: number }>,
  role: TableViewRole
): boolean {
  if (macro.kind === 'spendHope') return characterService.spendHope(character.id, macro.amount);
  if (macro.kind === 'gainHope') {
    characterService.adjustHope(character.id, macro.amount);
    return true;
  }
  if (macro.kind === 'markStress') {
    characterService.markStress(character.id, macro.amount);
    return true;
  }
  if (macro.kind === 'clearStress') {
    characterService.clearStress(character.id, macro.amount);
    return true;
  }
  if (macro.kind === 'clearHp') {
    characterService.markSlots(character.id, 'hp', -macro.amount);
    return true;
  }
  if (macro.kind === 'markHp') {
    characterService.markSlots(character.id, 'hp', macro.amount);
    return true;
  }
  if (macro.kind === 'spendToken') {
    if (card.tokens.value < macro.amount) return false;
    characterService.updateDomainCardTokens(character.id, card.id, card.tokens.value - macro.amount);
    return true;
  }
  if (macro.kind === 'spendFear') return gameService.spendFear(macro.amount);
  if (macro.kind === 'gainFear') {
    gameService.gainFear(macro.amount);
    return true;
  }
  return false;
}

function logDomainCardResourceUse(actorName: string, cardName: string, detail: string, publication: RollPublication = 'public', sourceLabel = 'Карта'): void {
  feedService.addMessage(actorName, `${cardName} · ${detail}`, { title: sourceLabel, publication });
}

function compactResourceMacroLabel(macro: Extract<PlayerViewDomainCardMacro, { amount: number }>): string {
  if (macro.kind === 'spendHope') return `-${macro.amount} Надежды`;
  if (macro.kind === 'gainHope') return `+${macro.amount} Надежды`;
  if (macro.kind === 'spendFear') return `-${macro.amount} Страх`;
  if (macro.kind === 'gainFear') return `+${macro.amount} Страх`;
  if (macro.kind === 'markStress') return `+${macro.amount} Стресс`;
  if (macro.kind === 'clearStress') return `-${macro.amount} Стресс`;
  if (macro.kind === 'markHp') return `+${macro.amount} Рана`;
  if (macro.kind === 'clearHp') return `-${macro.amount} Рана`;
  return `-${macro.amount} жетон`;
}
