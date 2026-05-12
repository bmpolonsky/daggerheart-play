import { nowIso } from '../../core/utils/date';
import { createId } from '../../core/utils/id';
import { buildEffectiveCharacterStats } from './effects';
import type {
  ArmorState,
  Character,
  CharacterCondition,
  CharacterDeathMoveState,
  Thresholds
} from './types';

export function calculateThresholds(armor: ArmorState, level: number): Thresholds {
  return {
    major: Math.max(0, armor.baseMajor + level),
    severe: Math.max(0, armor.baseSevere + level)
  };
}

export function syncCharacterDeathMoveState(character: Character): Character {
  const effectiveStats = buildEffectiveCharacterStats(character);
  const isFallen = character.hp.marked >= effectiveStats.hp.max;

  if (isFallen) {
    return {
      ...character,
      conditions: ensureCharacterCondition(ensureCharacterCondition(character.conditions, 'Пал'), 'Ход смерти'),
      deathMove: character.deathMove ?? createDeathMoveState('pending')
    };
  }

  if (character.deathMove?.status !== 'pending') {
    return character;
  }

  return {
    ...character,
    deathMove: null,
    conditions: removeCharacterConditionByName(
      removeCharacterConditionByName(character.conditions, 'Ход смерти'),
      'Пал'
    )
  };
}

export function ensureCharacterCondition(conditions: CharacterCondition[], name: string): CharacterCondition[] {
  const normalized = name.trim() || 'Condition';
  if (conditions.some((condition) => areEquivalentCharacterConditions(condition.name, normalized))) {
    return conditions;
  }
  return [...conditions, { id: createId('condition'), name: normalized }];
}

export function removeCharacterConditionByName(conditions: CharacterCondition[], name: string): CharacterCondition[] {
  return conditions.filter((condition) => !areEquivalentCharacterConditions(condition.name, name));
}

export function createDeathMoveState(status: CharacterDeathMoveState['status'], notes = ''): CharacterDeathMoveState {
  return {
    status,
    notes,
    updatedAt: nowIso()
  };
}

export function areEquivalentCharacterConditions(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft === normalizedRight) return true;
  const vulnerableAliases = new Set(['vulnerable', 'уязвим']);
  if (vulnerableAliases.has(normalizedLeft) && vulnerableAliases.has(normalizedRight)) return true;
  const fallenAliases = new Set(['fallen', 'пал']);
  if (fallenAliases.has(normalizedLeft) && fallenAliases.has(normalizedRight)) return true;
  const deathMoveAliases = new Set(['death move', 'ход смерти']);
  return deathMoveAliases.has(normalizedLeft) && deathMoveAliases.has(normalizedRight);
}
