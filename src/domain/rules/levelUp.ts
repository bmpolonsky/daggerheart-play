import { clamp, toSafeInteger } from '../../core/utils/clamp';
import type { Character, DaggerheartClass, DomainName, TraitId } from './types';

export type CharacterAdvancementChoiceId =
  | 'traits'
  | 'hp'
  | 'stress'
  | 'experience'
  | 'domainCard'
  | 'evasion'
  | 'subclass'
  | 'proficiency'
  | 'multiclass'
  | 'manual';

export interface CharacterAdvancementChoice {
  id: CharacterAdvancementChoiceId;
  label: string;
  requiresTwoChoices?: boolean;
  minLevel?: number;
}

export interface CharacterLevelUpPlanInput {
  targetLevel?: number;
  advancementChoices?: CharacterAdvancementChoiceId[];
  multiclassClass?: DaggerheartClass | '';
  multiclassDomain?: DomainName | '';
}

export interface CharacterLevelUpPlan {
  currentLevel: number;
  targetLevel: number;
  currentRank: number;
  targetRank: number;
  rankLabel: string;
  thresholdIncrease: number;
  rankAchievements: string[];
  requiredAdvancementChoices: number;
  advancementChoices: CharacterAdvancementChoiceId[];
  domainCardMaxLevel: number;
  multiclassAvailable: boolean;
  multiclassDomainCardMaxLevel: number;
  warnings: string[];
  summary: string;
}

export const CHARACTER_ADVANCEMENT_CHOICES: CharacterAdvancementChoice[] = [
  { id: 'traits', label: '+1 к двум неотмеченным характеристикам' },
  { id: 'hp', label: 'Добавить ячейки Ран' },
  { id: 'stress', label: 'Добавить ячейки Стресса' },
  { id: 'experience', label: '+1 к существующему Опыту' },
  { id: 'domainCard', label: 'Дополнительная карта домена' },
  { id: 'evasion', label: '+1 к Уклонению' },
  { id: 'subclass', label: 'Улучшенная карта подкласса' },
  { id: 'proficiency', label: '+1 к Мастерству', requiresTwoChoices: true },
  { id: 'multiclass', label: 'Мультикласс', requiresTwoChoices: true, minLevel: 5 },
  { id: 'manual', label: 'Другое / ручная пометка' }
];

export function characterLevelRank(level: number): number {
  const safeLevel = clamp(toSafeInteger(level, 1), 1, 10);
  if (safeLevel >= 8) return 4;
  if (safeLevel >= 5) return 3;
  if (safeLevel >= 2) return 2;
  return 1;
}

export function characterRankLabel(rank: number): string {
  if (rank === 1) return 'Ранг 1';
  if (rank === 2) return 'Ранг 2';
  if (rank === 3) return 'Ранг 3';
  return 'Ранг 4';
}

export function characterRankAchievements(level: number): string[] {
  if (level === 2) return ['Новый Опыт +2', '+1 к Мастерству'];
  if (level === 5 || level === 8) return ['Новый Опыт +2', '+1 к Мастерству', 'Снять отметки характеристик'];
  return [];
}

export function buildCharacterLevelUpPlan(character: Character, input: CharacterLevelUpPlanInput = {}): CharacterLevelUpPlan {
  const currentLevel = clamp(toSafeInteger(character.level, 1), 1, 10);
  const targetLevel = clamp(toSafeInteger(input.targetLevel ?? currentLevel + 1, currentLevel + 1), 1, 10);
  const currentRank = characterLevelRank(currentLevel);
  const targetRank = characterLevelRank(targetLevel);
  const advancementChoices = (input.advancementChoices ?? []).filter((choice): choice is CharacterAdvancementChoiceId => (
    CHARACTER_ADVANCEMENT_CHOICES.some((item) => item.id === choice)
  ));
  const rankAchievements = characterRankAchievements(targetLevel);
  const thresholdIncrease = Math.max(0, targetLevel - currentLevel);
  const multiclassAvailable = targetLevel >= 5;
  const warnings: string[] = [];

  if (targetLevel <= currentLevel) {
    warnings.push('Выберите уровень выше текущего.');
  }
  if (advancementChoices.length > 0 && advancementChoices.length !== 2) {
    warnings.push('При повышении уровня нужно отметить ровно два улучшения.');
  }
  if (advancementChoices.includes('multiclass') && !multiclassAvailable) {
    warnings.push('Мультикласс доступен начиная с 5 уровня.');
  }
  if (advancementChoices.includes('multiclass') && (!input.multiclassClass || !input.multiclassDomain)) {
    warnings.push('Для мультикласса укажите класс и выбранный домен.');
  }
  for (const choice of CHARACTER_ADVANCEMENT_CHOICES.filter((item) => item.requiresTwoChoices)) {
    const selectedCount = advancementChoices.filter((item) => item === choice.id).length;
    if (selectedCount === 1) {
      warnings.push(`${choice.label} стоит два улучшения; выберите этот пункт в обоих слотах или отметьте второй слот вручную.`);
    }
  }

  const summary = [
    `Повышение: уровень ${currentLevel} -> ${targetLevel} (${characterRankLabel(targetRank)}).`,
    rankAchievements.length ? `Достижения ранга: ${rankAchievements.join(', ')}.` : 'Достижений ранга на этом уровне нет.',
    `Пороги урона: +${thresholdIncrease}.`,
    `Карта домена: уровень ${targetLevel} или ниже из доменов класса.`,
    multiclassAvailable ? `Мультикласс-карта: уровень ${Math.ceil(targetLevel / 2)} или ниже из выбранного домена.` : 'Мультикласс пока недоступен.'
  ].join(' ');

  return {
    currentLevel,
    targetLevel,
    currentRank,
    targetRank,
    rankLabel: characterRankLabel(targetRank),
    thresholdIncrease,
    rankAchievements,
    requiredAdvancementChoices: 2,
    advancementChoices,
    domainCardMaxLevel: targetLevel,
    multiclassAvailable,
    multiclassDomainCardMaxLevel: Math.ceil(targetLevel / 2),
    warnings,
    summary
  };
}

export function advancementChoiceLabel(choice: CharacterAdvancementChoiceId): string {
  return CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice)?.label ?? 'Другое / ручная пометка';
}

export function formatLevelUpNotes(input: {
  plan: CharacterLevelUpPlan;
  choices: CharacterAdvancementChoiceId[];
  extraNotes?: string;
  multiclassClass?: DaggerheartClass | '';
  multiclassDomain?: DomainName | '';
  traitBonuses?: Partial<Record<TraitId, number>>;
}): string {
  const traitNotes = Object.entries(input.traitBonuses ?? {})
    .filter(([, value]) => Number(value) !== 0)
    .map(([trait, value]) => `${trait} ${Number(value) > 0 ? '+' : ''}${value}`);
  return [
    input.plan.summary,
    input.choices.length ? `Улучшения: ${input.choices.map(advancementChoiceLabel).join('; ')}.` : '',
    traitNotes.length ? `Характеристики: ${traitNotes.join(', ')}.` : '',
    input.multiclassClass || input.multiclassDomain ? `Мультикласс: ${input.multiclassClass || 'класс не указан'} / ${input.multiclassDomain || 'домен не указан'}.` : '',
    input.extraNotes?.trim() ?? ''
  ].filter(Boolean).join('\n');
}
