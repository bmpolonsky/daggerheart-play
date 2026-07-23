import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { analyzeFeatureRules, type FeatureRuleEffect } from './featureEffects';
import type { Character } from './types';

export type RestType = 'short' | 'long';
export type LongRestRecoveryMove = 'clearHp' | 'clearStress' | 'repairArmor';
export type RestMoveOperation =
  | 'rollHp'
  | 'rollStress'
  | 'rollArmor'
  | 'clearHp'
  | 'clearStress'
  | 'clearArmor'
  | 'prepare'
  | 'project'
  | 'manual';

export interface RestFearPlan {
  restType: RestType;
  pcCount: number;
  die: number;
  modifier: number;
  total: number;
  formula: string;
}

export interface RestChoiceApplyContext {
  role: 'gm' | 'player';
  isOwner: boolean;
  isClosed: boolean;
  connectedPlayerSession: boolean;
}

export interface RestChoiceSelectionContext {
  role: 'gm' | 'player';
  isOwner: boolean;
  isClosed: boolean;
}

export const REST_RULES: Record<RestType, {
  title: string;
  description: string;
  fearFormula: string;
  moves: string[];
}> = {
  short: {
    title: 'Короткий отдых',
    description: 'Каждый персонаж выбирает два хода отдыха; один и тот же ход можно выбрать дважды.',
    fearFormula: 'Мастер получает 1d4 Страха.',
    moves: [
      'Залечить Раны',
      'Снять Стресс',
      'Ремонт Брони',
      'Подготовка'
    ]
  },
  long: {
    title: 'Продолжительный отдых',
    description: 'Каждый персонаж выбирает два хода отдыха; один и тот же ход можно выбрать дважды.',
    fearFormula: 'Мастер получает 1d4 + количество персонажей Страха и может продвинуть долгосрочный отсчёт.',
    moves: [
      'Залечить все Раны',
      'Снять весь Стресс',
      'Полный ремонт Брони',
      'Подготовка',
      'Работа над проектом'
    ]
  }
};

const REST_MOVE_OPERATIONS = new Map<string, RestMoveOperation>([
  [REST_RULES.short.moves[0], 'rollHp'],
  [REST_RULES.short.moves[1], 'rollStress'],
  [REST_RULES.short.moves[2], 'rollArmor'],
  [REST_RULES.short.moves[3], 'prepare'],
  [REST_RULES.long.moves[0], 'clearHp'],
  [REST_RULES.long.moves[1], 'clearStress'],
  [REST_RULES.long.moves[2], 'clearArmor'],
  [REST_RULES.long.moves[3], 'prepare'],
  [REST_RULES.long.moves[4], 'project'],
  // Persisted requests created before rest moves received stable semantics.
  ['Исцелить HP: 1d4 + ранг', 'rollHp'],
  ['Очистить Стресс: 1d4 + ранг', 'rollStress'],
  ['Починить Броню: 1d4 + ранг', 'rollArmor'],
  ['Подготовить карты / получить Надежду', 'prepare'],
  ['Очистить все HP', 'clearHp'],
  ['Очистить все Раны', 'clearHp'],
  ['Очистить весь Стресс', 'clearStress'],
  ['Починить всю Броню', 'clearArmor'],
  ['Работать над проектом', 'project']
]);

export function restMoveOperation(label: string): RestMoveOperation {
  return REST_MOVE_OPERATIONS.get(label.trim()) ?? 'manual';
}

export function restMoveRequiresRoll(label: string): boolean {
  const operation = restMoveOperation(label);
  return operation === 'rollHp' || operation === 'rollStress' || operation === 'rollArmor';
}

export interface CharacterRestParticipantRules {
  availableMoves: string[];
  longRestMoveLabels: string[];
  maxChoices: number;
  maxLongRestMoves: number;
  notes: string[];
}

export interface PartyRestRule {
  moveLabel?: string;
  note: string;
}

export function partyRestRulesForCharacters(characters: Array<Pick<Character, 'sheetCards'>>, restType: RestType): PartyRestRule[] {
  const rules: PartyRestRule[] = characters.flatMap((character) => character.sheetCards.flatMap((card): PartyRestRule[] => {
    if (!isRestFeatureCard(card.kind)) return [];
    return analyzeFeatureRules(card.text ?? '').effects.flatMap((effect) => {
      if (effect.kind === 'restMoveGrant' && effect.scope === 'party' && (effect.rest === 'any' || effect.rest === restType)) {
        return [{ moveLabel: effect.label, note: effect.summary }];
      }
      if (effect.kind === 'restReroll' && effect.scope === 'selfOrAlly' && effect.rest === restType) {
        return [{ note: effect.summary }];
      }
      return [];
    });
  }));
  return Array.from(new Map(rules.map((rule) => [`${rule.moveLabel ?? ''}:${rule.note}`, rule])).values());
}

export function restParticipantRulesForCharacter(character: Pick<Character, 'sheetCards'>, restType: RestType): CharacterRestParticipantRules {
  const shortMoves = REST_RULES.short.moves;
  const longMoves = REST_RULES.long.moves;
  const effects = character.sheetCards.flatMap((card) => (
    isRestFeatureCard(card.kind) ? analyzeFeatureRules(card.text ?? '').effects : []
  ));
  const extraChoices = effects.reduce((total, effect) => (
    effect.kind === 'restChoiceCount' && (effect.rest === 'any' || effect.rest === restType)
      ? total + effect.count
      : total
  ), 0);
  const longRestMoveAllowance = restType === 'short'
    ? effects.reduce((total, effect) => effect.kind === 'restMoveSwap' ? total + effect.max : total, 0)
    : 0;
  const grantedMoves = effects.flatMap((effect) => (
    effect.kind === 'restMoveGrant' && effect.scope === 'self' && (effect.rest === 'any' || effect.rest === restType) ? [effect.label] : []
  ));
  const longRestMoveLabels = longRestMoveAllowance > 0
    ? longMoves.filter((move) => !shortMoves.includes(move))
    : [];
  const availableMoves = Array.from(new Set([
    ...REST_RULES[restType].moves,
    ...longRestMoveLabels,
    ...grantedMoves
  ]));
  const notes = effects
    .filter((effect) => restEffectApplies(effect, restType))
    .map((effect) => effect.summary);
  return {
    availableMoves,
    longRestMoveLabels,
    maxChoices: 2 + extraChoices,
    maxLongRestMoves: longRestMoveAllowance,
    notes: Array.from(new Set(notes))
  };
}

function isRestFeatureCard(kind: Character['sheetCards'][number]['kind']): boolean {
  return kind === 'classFeature' || kind === 'ancestryFeature' || kind === 'communityFeature' || kind === 'subclassFeature' || kind === 'custom';
}

function restEffectApplies(effect: FeatureRuleEffect, restType: RestType): boolean {
  if (effect.kind === 'restChoiceCount' || effect.kind === 'restMoveGrant') {
    return effect.rest === 'any' || effect.rest === restType;
  }
  if (effect.kind === 'restMoveSwap') return restType === 'short';
  if (effect.kind === 'restReroll') return effect.rest === restType;
  return false;
}

export function canApplyRestChoice(context: RestChoiceApplyContext): boolean {
  if (context.isClosed) return false;
  if (context.role === 'gm') return true;
  return context.isOwner && !context.connectedPlayerSession;
}

export function canSelectRestChoices(context: RestChoiceSelectionContext): boolean {
  if (context.isClosed) return false;
  return context.role === 'gm' || context.isOwner;
}

export function rollRestFear(restType: RestType, pcCount: number, rng: () => number = Math.random): RestFearPlan {
  const safePcCount = clamp(toSafeInteger(pcCount, 0), 0, 99);
  const die = clamp(Math.floor(rng() * 4) + 1, 1, 4);
  const modifier = restType === 'long' ? safePcCount : 0;
  return {
    restType,
    pcCount: safePcCount,
    die,
    modifier,
    total: die + modifier,
    formula: modifier > 0 ? `1d4 + ${modifier}` : '1d4'
  };
}
