import { clamp } from '../../core/utils/clamp';
import { nowIso } from '../../core/utils/date';
import { createId } from '../../core/utils/id';
import { DEFAULT_MAX_HOPE } from './constants';
import type { Character, CharacterScar, DeathMoveRollResult, RiskItAllOutcome } from './types';

export function activeScars(character: { scars?: CharacterScar[] | null }): CharacterScar[] {
  return Array.isArray(character.scars) ? character.scars : [];
}

export function effectiveHopeMax(character: Pick<Character, 'hope'> & { scars?: CharacterScar[] | null }): number {
  return clamp(character.hope.max - activeScars(character).length, 0, DEFAULT_MAX_HOPE);
}

export function clampHopeToEffectiveMax(character: Character): Character {
  const max = effectiveHopeMax(character);
  return {
    ...character,
    hope: {
      ...character.hope,
      value: clamp(character.hope.value, 0, max)
    }
  };
}

export function createCharacterScar(description = 'Шрам'): CharacterScar {
  return {
    id: createId('scar'),
    description: description.trim() || 'Шрам',
    createdAt: nowIso()
  };
}

export function rollHopeDie(rng: () => number = Math.random): number {
  return rollD12(rng);
}

export function rollRiskItAll(rng: () => number = Math.random): DeathMoveRollResult {
  const hopeDie = rollD12(rng);
  const fearDie = rollD12(rng);
  return {
    kind: 'riskItAll',
    hopeDie,
    fearDie,
    outcome: riskItAllOutcome(hopeDie, fearDie)
  };
}

export function riskItAllOutcome(hopeDie: number, fearDie: number): RiskItAllOutcome {
  if (hopeDie === fearDie) return 'critical';
  return hopeDie > fearDie ? 'hope' : 'fear';
}

export function buildAvoidDeathRoll(character: Pick<Character, 'level'>, hopeDie: number): DeathMoveRollResult {
  return {
    kind: 'avoidDeathHope',
    hopeDie,
    scarGained: hopeDie <= character.level
  };
}

function rollD12(rng: () => number): number {
  return clamp(Math.floor(rng() * 12) + 1, 1, 12);
}
