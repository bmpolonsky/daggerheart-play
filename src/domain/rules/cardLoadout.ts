import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { characterHandSize, type CharacterRuleModifier } from './characterRuleModifiers';
import { parseDomainCardCost } from './domainCards';
import type { Character, DomainCardRecord } from './types';

export type DomainCardMoveContext = 'rest' | 'adventure' | 'levelUp';
export type DomainCardZone = 'hand' | 'vault';

export interface DomainCardMoveRequest {
  cardId: string;
  to: DomainCardZone;
  context: DomainCardMoveContext;
  replaceCardId?: string;
  modifiers?: CharacterRuleModifier[];
}

export type DomainCardMoveIssueCode =
  | 'card.notFound'
  | 'card.alreadyInZone'
  | 'card.permanentlyVaulted'
  | 'hand.full'
  | 'replacement.notFound'
  | 'replacement.invalid'
  | 'stress.insufficient';

export interface DomainCardMoveIssue {
  code: DomainCardMoveIssueCode;
  message: string;
}

export interface DomainCardMovePlan {
  canApply: boolean;
  cardId: string;
  to: DomainCardZone;
  context: DomainCardMoveContext;
  replacementCardId: string | null;
  handSize: number;
  handLimit: number;
  stressCost: number;
  issues: DomainCardMoveIssue[];
}

export interface DomainCardMoveResult {
  character: Character;
  plan: DomainCardMovePlan;
  applied: boolean;
}

export function planDomainCardMove(character: Character, request: DomainCardMoveRequest): DomainCardMovePlan {
  const card = character.domainCards.find((item) => item.id === request.cardId);
  const handLimit = characterHandSize(request.modifiers ?? character.ruleModifiers);
  const handSize = character.domainCards.filter((item) => item.inLoadout).length;
  const issues: DomainCardMoveIssue[] = [];
  const replacement = request.replaceCardId
    ? character.domainCards.find((item) => item.id === request.replaceCardId)
    : undefined;
  const toHand = request.to === 'hand';
  const resolvingAcquisition = Boolean(card?.loadoutChoicePending) && request.context === 'levelUp';
  const stressCost = toHand && request.context === 'adventure' && card && !card.loadoutChoicePending
    ? domainCardRecallStressCost(card)
    : 0;

  if (!card) addIssue(issues, 'card.notFound', 'Карта не найдена у персонажа.');
  if (card && card.inLoadout === toHand && !(resolvingAcquisition && !toHand)) {
    addIssue(issues, 'card.alreadyInZone', 'Карта уже находится в выбранной зоне.');
  }
  if (card?.permanentlyVaulted && toHand) addIssue(issues, 'card.permanentlyVaulted', 'Карта навсегда помещена в Хранилище и не может вернуться в Руку.');

  if (toHand && card && !card.inLoadout && handSize >= handLimit) {
    if (!request.replaceCardId) {
      addIssue(issues, 'hand.full', `В Руке уже находится максимум карт: ${handLimit}. Выберите карту для замены.`);
    } else if (!replacement) {
      addIssue(issues, 'replacement.notFound', 'Карта для замены не найдена.');
    } else if (!replacement.inLoadout || replacement.id === card.id) {
      addIssue(issues, 'replacement.invalid', 'Для замены нужно выбрать другую карту из Руки.');
    }
  } else if (request.replaceCardId) {
    addIssue(issues, 'replacement.invalid', 'Замена не требуется, пока в Руке есть свободное место.');
  }

  const availableStress = Math.max(0, character.stress.max - character.stress.marked);
  if (stressCost > availableStress) {
    addIssue(issues, 'stress.insufficient', `Для призыва нужно отметить Стресс: ${stressCost}.`);
  }

  return {
    canApply: issues.length === 0,
    cardId: request.cardId,
    to: request.to,
    context: request.context,
    replacementCardId: request.replaceCardId ?? null,
    handSize,
    handLimit,
    stressCost,
    issues
  };
}

export function applyDomainCardMove(character: Character, request: DomainCardMoveRequest): DomainCardMoveResult {
  const plan = planDomainCardMove(character, request);
  if (!plan.canApply) return { character, plan, applied: false };
  const domainCards = character.domainCards.map((card) => {
    if (card.id === plan.cardId) return { ...card, inLoadout: plan.to === 'hand', loadoutChoicePending: false };
    if (card.id === plan.replacementCardId) return { ...card, inLoadout: false };
    return card;
  });
  return {
    character: {
      ...character,
      domainCards,
      stress: {
        ...character.stress,
        marked: clamp(character.stress.marked + plan.stressCost, 0, character.stress.max)
      }
    },
    plan,
    applied: true
  };
}

export function permanentlyVaultDomainCard(character: Character, cardId: string): Character {
  if (!character.domainCards.some((card) => card.id === cardId)) return character;
  return {
    ...character,
    domainCards: character.domainCards.map((card) => (
      card.id === cardId ? { ...card, inLoadout: false, permanentlyVaulted: true, loadoutChoicePending: false } : card
    ))
  };
}

export function enforceCharacterHandLimit(
  cards: readonly DomainCardRecord[],
  modifiers: readonly CharacterRuleModifier[] = []
): DomainCardRecord[] {
  const limit = characterHandSize(modifiers);
  let activeCount = 0;
  return cards.map((card) => {
    const normalized = {
      ...card,
      inLoadout: Boolean(card.inLoadout) && !card.permanentlyVaulted,
      loadoutChoicePending: Boolean(card.loadoutChoicePending) && !card.permanentlyVaulted && !card.inLoadout
    };
    if (!normalized.inLoadout) return normalized;
    activeCount += 1;
    return activeCount <= limit ? normalized : { ...normalized, inLoadout: false };
  });
}

/**
 * Places freshly acquired cards without losing the decision created by a full Hand.
 * Excess new cards stay playable in the Vault and are marked until the player
 * explicitly keeps them there or performs a free level-up replacement.
 */
export function placeAcquiredDomainCards(
  existingCards: readonly DomainCardRecord[],
  acquiredCards: readonly DomainCardRecord[],
  modifiers: readonly CharacterRuleModifier[] = []
): DomainCardRecord[] {
  const limit = characterHandSize(modifiers);
  const existing = enforceCharacterHandLimit(existingCards, modifiers);
  let handSize = existing.filter((card) => card.inLoadout).length;
  const acquired = acquiredCards.map((card) => {
    const normalized = { ...card, permanentlyVaulted: Boolean(card.permanentlyVaulted) };
    if (normalized.permanentlyVaulted || !normalized.inLoadout) {
      return { ...normalized, inLoadout: false, loadoutChoicePending: false };
    }
    if (handSize < limit) {
      handSize += 1;
      return { ...normalized, inLoadout: true, loadoutChoicePending: false };
    }
    return { ...normalized, inLoadout: false, loadoutChoicePending: true };
  });
  return [...existing, ...acquired];
}

export function domainCardRecallStressCost(card: Pick<DomainCardRecord, 'recallCost'>): number {
  const parsed = parseDomainCardCost(card.recallCost);
  if (parsed.stress > 0) return parsed.stress;
  const numeric = String(card.recallCost ?? '').match(/\d+/)?.[0];
  return clamp(toSafeInteger(numeric, 0), 0, 20);
}

function addIssue(issues: DomainCardMoveIssue[], code: DomainCardMoveIssueCode, message: string): void {
  issues.push({ code, message });
}
