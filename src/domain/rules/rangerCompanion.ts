import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { scaleWeaponFormulaByProficiency } from './diceFormula';
import type { Character, CharacterCompanionState, DamageType, Experience, RangerMarkTargetKind } from './types';

export function hasRangerCompanionFeature(character: Pick<Character, 'className' | 'subclassName' | 'sheetCards'>): boolean {
  if (character.className !== 'Ranger') return false;
  if (/зверин|beastbound|beast bound/i.test(character.subclassName)) return true;
  return (character.sheetCards ?? []).some((card) => /компаньон|companion|зверин/i.test(`${card.name}\n${card.text ?? ''}`));
}

export function createDefaultRangerCompanion(input: Partial<CharacterCompanionState> = {}): CharacterCompanionState {
  return normalizeRangerCompanion({
    name: input.name ?? 'Компаньон',
    evasion: input.evasion ?? 10,
    stress: input.stress ?? { marked: 0, max: 3 },
    attackName: input.attackName ?? 'Обычная атака',
    attackRange: input.attackRange ?? 'Вплотную',
    attackFormula: input.attackFormula ?? '1d6',
    attackDamageType: input.attackDamageType ?? 'physical',
    experiences: input.experiences ?? [
      { id: 'companion-exp-1', name: 'Разведчик', modifier: 2 },
      { id: 'companion-exp-2', name: 'Защитник', modifier: 2 }
    ],
    unavailableUntilLongRest: input.unavailableUntilLongRest ?? false,
    notes: input.notes ?? ''
  });
}

export function normalizeRangerCompanion(input: CharacterCompanionState): CharacterCompanionState {
  const stressMax = clamp(toSafeInteger(input.stress.max, 3), 0, 12);
  const stressMarked = clamp(toSafeInteger(input.stress.marked, 0), 0, stressMax);
  return {
    name: input.name?.trim() || 'Компаньон',
    evasion: clamp(toSafeInteger(input.evasion, 10), 0, 99),
    stress: { marked: stressMarked, max: stressMax },
    attackName: input.attackName?.trim() || 'Обычная атака',
    attackRange: input.attackRange?.trim() || 'Вплотную',
    attackFormula: input.attackFormula?.trim() || '1d6',
    attackDamageType: normalizeDamageType(input.attackDamageType),
    experiences: normalizeCompanionExperiences(input.experiences),
    unavailableUntilLongRest: Boolean(input.unavailableUntilLongRest || (stressMax > 0 && stressMarked >= stressMax)),
    notes: input.notes?.trim() || ''
  };
}

export function companionDamageFormula(companion: CharacterCompanionState, proficiency: number): string {
  return scaleWeaponFormulaByProficiency(companion.attackFormula, proficiency);
}

export function isRangerMarkTarget(
  character: Pick<Character, 'rangerMark'>,
  targetKind: RangerMarkTargetKind,
  targetId: string
): boolean {
  return Boolean(character.rangerMark && character.rangerMark.targetKind === targetKind && character.rangerMark.targetId === targetId);
}

function normalizeCompanionExperiences(experiences: Experience[]): Experience[] {
  return experiences.slice(0, 12).map((experience, index) => ({
    id: experience.id || `companion-exp-${index + 1}`,
    name: experience.name?.trim() || `Опыт ${index + 1}`,
    modifier: clamp(toSafeInteger(experience.modifier, 2), -10, 20),
    notes: experience.notes?.trim() || ''
  }));
}

function normalizeDamageType(value: DamageType): DamageType {
  return value === 'magic' || value === 'direct' || value === 'mixed' ? value : 'physical';
}
