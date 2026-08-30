import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { characterHandSize, type CharacterRuleModifier } from './characterRuleModifiers';
import { parseDomainCardCost } from './domainCards';
import { buildEffectiveCharacterStats } from './effects';
import type { Character, DomainCardRecord } from './types';

export type DomainCardMoveContext = 'rest' | 'adventure';
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
  const stressCost = toHand && request.context === 'adventure' && card
    ? domainCardRecallStressCost(card)
    : 0;

  if (!card) addIssue(issues, 'card.notFound', 'Карта не найдена у персонажа.');
  if (card && card.inLoadout === toHand) {
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

  const effectiveStress = buildEffectiveCharacterStats(character).stress;
  const availableStress = Math.max(0, effectiveStress.max - effectiveStress.marked);
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
    if (card.id === plan.cardId) return { ...card, inLoadout: plan.to === 'hand' };
    if (card.id === plan.replacementCardId) return { ...card, inLoadout: false };
    return card;
  });
  const effectiveStressMax = buildEffectiveCharacterStats(character).stress.max;
  return {
    character: {
      ...character,
      domainCards,
      stress: {
        ...character.stress,
        marked: clamp(character.stress.marked + plan.stressCost, 0, effectiveStressMax)
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
      card.id === cardId ? { ...card, inLoadout: false, permanentlyVaulted: true } : card
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
      inLoadout: Boolean(card.inLoadout) && !card.permanentlyVaulted
    };
    if (!normalized.inLoadout) return normalized;
    activeCount += 1;
    return activeCount <= limit ? normalized : { ...normalized, inLoadout: false };
  });
}

export function placeAcquiredDomainCards(
  existingCards: readonly DomainCardRecord[],
  acquiredCards: readonly DomainCardRecord[],
  modifiers: readonly CharacterRuleModifier[] = [],
  handReplacements: Readonly<Record<string, string>> = {}
): DomainCardRecord[] {
  const limit = characterHandSize(modifiers);
  const existing = enforceCharacterHandLimit(existingCards, modifiers);
  let handSize = existing.filter((card) => card.inLoadout).length;
  const handIds = new Set(existing.filter((card) => card.inLoadout).map((card) => card.id));
  const movedToVault = new Set<string>();
  const acquired = acquiredCards.map((card) => {
    const normalized = { ...card, permanentlyVaulted: Boolean(card.permanentlyVaulted) };
    if (normalized.permanentlyVaulted || !normalized.inLoadout) {
      return { ...normalized, inLoadout: false };
    }
    if (handSize < limit) {
      handSize += 1;
      return { ...normalized, inLoadout: true };
    }
    const replacementId = handReplacements[normalized.id];
    if (replacementId && handIds.has(replacementId) && !movedToVault.has(replacementId)) {
      movedToVault.add(replacementId);
      return { ...normalized, inLoadout: true };
    }
    return { ...normalized, inLoadout: false };
  });
  return [
    ...existing.map((card) => movedToVault.has(card.id) ? { ...card, inLoadout: false } : card),
    ...acquired
  ];
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
