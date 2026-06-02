import { createId } from '../../core/utils/id';
import { buildEffectiveCharacterStats } from './effects';
import { ActorStatus, normalizeStatusTag } from './statuses';
import type {
  ArmorState,
  Character,
  CharacterCondition,
  Thresholds
} from './types';

export function calculateThresholds(armor: ArmorState, level: number): Thresholds {
  return {
    major: Math.max(0, armor.baseMajor + level),
    severe: Math.max(0, armor.baseSevere + level)
  };
}

export function syncCharacterDefeatedCondition(character: Character): Character {
  const effectiveStats = buildEffectiveCharacterStats(character);
  const isFallen = effectiveStats.hp.max > 0 && character.hp.marked >= effectiveStats.hp.max;

  if (isFallen) {
    return {
      ...character,
      conditions: ensureCharacterCondition(character.conditions, ActorStatus.Defeated)
    };
  }

  return {
    ...character,
    conditions: removeCharacterConditionByName(character.conditions, ActorStatus.Defeated)
  };
}

export function ensureCharacterCondition(conditions: CharacterCondition[], name: string): CharacterCondition[] {
  const normalized = normalizeStatusTag(name || 'condition');
  if (conditions.some((condition) => normalizeStatusTag(condition.name) === normalized)) {
    return conditions;
  }
  return [...conditions, { id: createId('condition'), name: normalized }];
}

export function removeCharacterConditionByName(conditions: CharacterCondition[], name: string): CharacterCondition[] {
  const normalized = normalizeStatusTag(name);
  return conditions.filter((condition) => normalizeStatusTag(condition.name) !== normalized);
}
