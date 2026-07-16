import { clamp, toSafeInteger } from '../../core/utils/clamp';
import {
  advancementChoiceLimitAdjustment,
  levelUpAdvancementChoiceCount,
  levelUpDomainCardCount,
  levelUpStatDelta,
  type CharacterRuleModifier
} from './characterRuleModifiers';
import { CLASS_DOMAINS } from './constants';
import type {
  Character,
  CharacterAdvancementChoiceId,
  CharacterAdvancementState,
  CharacterChangeActor,
  CharacterSheetCard,
  DaggerheartClass,
  DomainCardRecord,
  DomainName,
  Experience,
  Thresholds,
  TraitId
} from './types';

export type { CharacterAdvancementChoiceId } from './types';

export interface CharacterAdvancementChoice {
  id: CharacterAdvancementChoiceId;
  label: string;
  cost: number;
  minLevel?: number;
}

export interface CharacterLevelUpFreeformOverride {
  enabled: true;
  actor: CharacterChangeActor;
  reason: string;
}

export interface CharacterLevelUpPlanInput {
  targetLevel?: number;
  advancementChoices?: readonly CharacterAdvancementChoiceId[];
  multiclassClass?: DaggerheartClass | '';
  multiclassDomain?: DomainName | '';
  ruleModifiers?: CharacterRuleModifier[];
}

export interface CharacterLevelUpApplicationInput extends CharacterLevelUpPlanInput {
  actor?: CharacterChangeActor;
  level: number;
  proficiency?: number;
  experiences?: Array<Partial<Experience>>;
  experienceIncreases?: Array<{ experienceId: string }>;
  domainCards?: Array<Partial<DomainCardRecord>>;
  subclassCards?: Array<Partial<CharacterSheetCard>>;
  thresholdBonus?: Partial<Thresholds>;
  traitBonuses?: Partial<Record<TraitId, number>>;
  hpMax?: number;
  stressMax?: number;
  evasion?: number;
  notes?: string;
  freeformOverride?: CharacterLevelUpFreeformOverride;
}

export type CharacterLevelUpIssueCode =
  | 'level.nextRequired'
  | 'choices.required'
  | 'choices.manualForbidden'
  | 'choices.unavailable'
  | 'choices.exhausted'
  | 'multiclass.detailsRequired'
  | 'multiclass.alreadyTaken'
  | 'traits.invalid'
  | 'hp.invalid'
  | 'stress.invalid'
  | 'experience.rankAchievement'
  | 'experience.increaseInvalid'
  | 'domainCards.count'
  | 'domainCards.invalid'
  | 'evasion.invalid'
  | 'subclass.invalid'
  | 'proficiency.invalid'
  | 'thresholds.invalid'
  | 'override.gmRequired'
  | 'override.reasonRequired';

export interface CharacterLevelUpIssue {
  code: CharacterLevelUpIssueCode;
  message: string;
}

export interface CharacterLevelUpValidation {
  canApply: boolean;
  strictlyValid: boolean;
  overridden: boolean;
  issues: CharacterLevelUpIssue[];
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
  advancementChoiceCost: number;
  requiredDomainCards: number;
  requiredTraitBonuses: number;
  requiredNewExperiences: number;
  requiredExperienceIncreases: number;
  expectedHpMax: number;
  expectedStressMax: number;
  expectedEvasion: number;
  expectedProficiency: number;
  expectedThresholds: Thresholds;
  domainCardMaxLevel: number;
  multiclassAvailable: boolean;
  multiclassDomainCardMaxLevel: number;
  warnings: string[];
  summary: string;
}

export const CHARACTER_ADVANCEMENT_CHOICES: CharacterAdvancementChoice[] = [
  { id: 'traits', label: '+1 к двум неотмеченным характеристикам', cost: 1 },
  { id: 'hp', label: 'Добавить ячейку Ран', cost: 1 },
  { id: 'stress', label: 'Добавить ячейку Стресса', cost: 1 },
  { id: 'experience', label: '+1 к существующему Опыту', cost: 1 },
  { id: 'domainCard', label: 'Дополнительная карта домена', cost: 1 },
  { id: 'evasion', label: '+1 к Уклонению', cost: 1 },
  { id: 'subclass', label: 'Улучшенная карта подкласса', cost: 1 },
  { id: 'proficiency', label: '+1 к Мастерству', cost: 2 },
  { id: 'multiclass', label: 'Мультикласс', cost: 2, minLevel: 5 },
  { id: 'manual', label: 'Устаревшая ручная пометка', cost: 1 }
];

const TRAITS: TraitId[] = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

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
  const requestedLevel = toSafeInteger(input.targetLevel, currentLevel + 1);
  const targetLevel = clamp(requestedLevel, 1, 10);
  const currentRank = characterLevelRank(currentLevel);
  const targetRank = characterLevelRank(targetLevel);
  const advancementChoices = normalizeChoices(input.advancementChoices);
  const ruleModifiers = input.ruleModifiers ?? character.ruleModifiers;
  const rankAchievements = characterRankAchievements(targetLevel);
  const thresholdIncrease = targetLevel === currentLevel + 1 ? 1 : Math.max(0, targetLevel - currentLevel);
  const multiclassAvailable = targetLevel >= 5 && !character.advancement?.multiclass;
  const warnings = validateChoiceSelection(character, {
    targetLevel,
    choices: advancementChoices,
    multiclassClass: input.multiclassClass,
    multiclassDomain: input.multiclassDomain,
    modifiers: ruleModifiers
  }).map((issue) => issue.message);
  if (targetLevel !== currentLevel + 1 || targetLevel > 10) warnings.unshift('Обычное повышение должно увеличивать уровень ровно на один.');
  const requiredChoices = levelUpAdvancementChoiceCount(ruleModifiers);
  const requiredCards = levelUpDomainCardCount(ruleModifiers) + countChoice(advancementChoices, 'domainCard');
  const rankProficiency = rankAchievements.some((item) => item.includes('Мастерств')) ? 1 : 0;

  const summary = [
    `Повышение: уровень ${currentLevel} -> ${targetLevel} (${characterRankLabel(targetRank)}).`,
    rankAchievements.length ? `Достижения ранга: ${rankAchievements.join(', ')}.` : 'Достижений ранга на этом уровне нет.',
    `Пороги урона: +${thresholdIncrease}.`,
    `Новых карт домена: ${requiredCards}.`,
    multiclassAvailable ? `Мультикласс-карта: уровень ${Math.ceil(targetLevel / 2)} или ниже из выбранного домена.` : 'Новый мультикласс недоступен.'
  ].join(' ');

  return {
    currentLevel,
    targetLevel,
    currentRank,
    targetRank,
    rankLabel: characterRankLabel(targetRank),
    thresholdIncrease,
    rankAchievements,
    requiredAdvancementChoices: requiredChoices,
    advancementChoices,
    advancementChoiceCost: advancementChoiceCost(advancementChoices),
    requiredDomainCards: requiredCards,
    requiredTraitBonuses: countChoice(advancementChoices, 'traits') * 2,
    requiredNewExperiences: rankAchievements.some((item) => item.includes('Новый Опыт')) ? 1 : 0,
    requiredExperienceIncreases: countChoice(advancementChoices, 'experience'),
    expectedHpMax: character.hp.max + countChoice(advancementChoices, 'hp') * levelUpStatDelta(ruleModifiers, 'hp'),
    expectedStressMax: character.stress.max + countChoice(advancementChoices, 'stress') * levelUpStatDelta(ruleModifiers, 'stress'),
    expectedEvasion: character.evasion + countChoice(advancementChoices, 'evasion') * levelUpStatDelta(ruleModifiers, 'evasion'),
    expectedProficiency: character.proficiency + rankProficiency + countChoice(advancementChoices, 'proficiency') * levelUpStatDelta(ruleModifiers, 'proficiency'),
    expectedThresholds: {
      major: character.thresholds.major + thresholdIncrease,
      severe: character.thresholds.severe + thresholdIncrease
    },
    domainCardMaxLevel: targetLevel,
    multiclassAvailable,
    multiclassDomainCardMaxLevel: Math.ceil(targetLevel / 2),
    warnings,
    summary
  };
}

export function validateCharacterLevelUp(
  character: Character,
  input: CharacterLevelUpApplicationInput
): CharacterLevelUpValidation {
  const modifiers = input.ruleModifiers ?? character.ruleModifiers;
  const targetLevel = toSafeInteger(input.level, character.level);
  const choices = normalizeChoices(input.advancementChoices);
  const issues = validateChoiceSelection(character, {
    targetLevel,
    choices,
    multiclassClass: input.multiclassClass,
    multiclassDomain: input.multiclassDomain,
    modifiers
  });

  if (targetLevel !== character.level + 1 || targetLevel > 10) {
    addIssue(issues, 'level.nextRequired', 'Обычное повышение должно увеличивать уровень ровно на один.');
  }

  validateTraits(character, choices, input, issues);
  validateNumericEffects(character, targetLevel, choices, input, modifiers, issues);
  validateExperiences(character, targetLevel, choices, input, issues);
  validateDomainCards(character, targetLevel, choices, input, modifiers, issues);
  validateSubclassCards(character, choices, input, issues);

  const strictlyValid = issues.length === 0;
  const override = input.freeformOverride;
  let overrideValid = false;
  if (override?.enabled) {
    if (override.actor.role !== 'gm') addIssue(issues, 'override.gmRequired', 'Обход правил доступен только Мастеру.');
    if (!override.reason.trim()) addIssue(issues, 'override.reasonRequired', 'Для обхода правил укажите причину.');
    overrideValid = override.actor.role === 'gm' && Boolean(override.reason.trim());
  }

  return {
    canApply: strictlyValid || overrideValid,
    strictlyValid,
    overridden: !strictlyValid && overrideValid,
    issues
  };
}

export function nextCharacterAdvancementState(
  character: Character,
  input: Pick<CharacterLevelUpApplicationInput, 'level' | 'advancementChoices' | 'traitBonuses' | 'multiclassClass' | 'multiclassDomain'>
): CharacterAdvancementState {
  const targetRank = characterLevelRank(input.level) as 2 | 3 | 4;
  const crossedRank = characterLevelRank(character.level) !== targetRank;
  const previous = character.advancement ?? { choiceUsesByRank: {}, markedTraits: [], multiclass: null };
  const rankUses = { ...(previous.choiceUsesByRank[targetRank] ?? {}) };
  for (const choice of normalizeChoices(input.advancementChoices)) {
    if (choice === 'manual') continue;
    rankUses[choice] = (rankUses[choice] ?? 0) + 1;
  }
  const newlyMarked = TRAITS.filter((trait) => toSafeInteger(input.traitBonuses?.[trait], 0) > 0);
  const markedTraits = [...new Set([...(crossedRank ? [] : previous.markedTraits), ...newlyMarked])];
  const multiclass = normalizeChoices(input.advancementChoices).includes('multiclass') && input.multiclassClass && input.multiclassDomain
    ? { className: input.multiclassClass, domain: input.multiclassDomain }
    : previous.multiclass ?? null;
  return {
    choiceUsesByRank: { ...previous.choiceUsesByRank, [targetRank]: rankUses },
    markedTraits,
    multiclass
  };
}

export function advancementChoiceLabel(choice: CharacterAdvancementChoiceId): string {
  return CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice)?.label ?? 'Неизвестное улучшение';
}

export function formatLevelUpNotes(input: {
  plan: CharacterLevelUpPlan;
  choices: readonly CharacterAdvancementChoiceId[];
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

function validateChoiceSelection(character: Character, input: {
  targetLevel: number;
  choices: readonly CharacterAdvancementChoiceId[];
  multiclassClass?: DaggerheartClass | '';
  multiclassDomain?: DomainName | '';
  modifiers: CharacterRuleModifier[];
}): CharacterLevelUpIssue[] {
  const issues: CharacterLevelUpIssue[] = [];
  const requiredCost = levelUpAdvancementChoiceCount(input.modifiers);
  const cost = advancementChoiceCost(input.choices);
  if (cost !== requiredCost) {
    addIssue(issues, 'choices.required', `Выберите улучшения общей стоимостью ${requiredCost}; сейчас выбрано ${cost}.`);
  }
  if (input.choices.includes('manual')) {
    addIssue(issues, 'choices.manualForbidden', 'Ручная пометка не является улучшением. Используйте явный свободный режим Мастера.');
  }
  const targetRank = characterLevelRank(input.targetLevel) as 2 | 3 | 4;
  const rankUses = character.advancement?.choiceUsesByRank[targetRank] ?? {};
  if (
    (input.choices.includes('multiclass') && (rankUses.subclass ?? 0) > 0) ||
    (input.choices.includes('subclass') && (rankUses.multiclass ?? 0) > 0) ||
    (input.choices.includes('multiclass') && input.choices.includes('subclass'))
  ) {
    addIssue(issues, 'choices.unavailable', 'В одном ранге нельзя одновременно улучшить подкласс и выбрать мультикласс.');
  }
  for (const choice of new Set(input.choices)) {
    const definition = CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice);
    if (!definition || choice === 'manual') continue;
    if (definition.minLevel && input.targetLevel < definition.minLevel) {
      addIssue(issues, 'choices.unavailable', `${definition.label} доступно начиная с ${definition.minLevel} уровня.`);
    }
    const selected = countChoice(input.choices, choice);
    const used = rankUses[choice] ?? 0;
    const limit = advancementChoiceLimit(targetRank, choice, input.modifiers);
    if (used + selected > limit) {
      addIssue(issues, 'choices.exhausted', `${definition.label}: доступных отметок в этом ранге ${Math.max(0, limit - used)}.`);
    }
  }
  if (input.choices.includes('multiclass')) {
    if (character.advancement?.multiclass) addIssue(issues, 'multiclass.alreadyTaken', 'Персонаж уже выбрал мультикласс.');
    if (!input.multiclassClass || !input.multiclassDomain) {
      addIssue(issues, 'multiclass.detailsRequired', 'Для мультикласса укажите класс и новый домен.');
    } else if (character.domains.includes(input.multiclassDomain)) {
      addIssue(issues, 'multiclass.detailsRequired', 'Домен мультикласса должен быть новым для персонажа.');
    } else if (!(CLASS_DOMAINS[input.multiclassClass] ?? []).includes(input.multiclassDomain)) {
      addIssue(issues, 'multiclass.detailsRequired', 'Выбранный домен недоступен классу мультикласса.');
    }
  }
  return issues;
}

function validateTraits(
  character: Character,
  choices: readonly CharacterAdvancementChoiceId[],
  input: CharacterLevelUpApplicationInput,
  issues: CharacterLevelUpIssue[]
): void {
  const traitChoiceCount = countChoice(choices, 'traits');
  const bonuses = TRAITS.filter((trait) => toSafeInteger(input.traitBonuses?.[trait], 0) !== 0);
  const crossedRank = characterLevelRank(character.level) !== characterLevelRank(input.level);
  const marked = new Set(crossedRank ? [] : character.advancement?.markedTraits ?? []);
  const valid = bonuses.length === traitChoiceCount * 2 && bonuses.every((trait) => (
    toSafeInteger(input.traitBonuses?.[trait], 0) === 1 && !marked.has(trait)
  ));
  if (!valid) {
    addIssue(issues, 'traits.invalid', traitChoiceCount > 0
      ? `Каждое улучшение характеристик должно дать +1 двум различным неотмеченным характеристикам (${traitChoiceCount * 2} всего).`
      : 'Характеристики нельзя менять без соответствующего улучшения.');
  }
}

function validateNumericEffects(
  character: Character,
  targetLevel: number,
  choices: readonly CharacterAdvancementChoiceId[],
  input: CharacterLevelUpApplicationInput,
  modifiers: CharacterRuleModifier[],
  issues: CharacterLevelUpIssue[]
): void {
  const expectedHp = character.hp.max + countChoice(choices, 'hp') * levelUpStatDelta(modifiers, 'hp');
  const expectedStress = character.stress.max + countChoice(choices, 'stress') * levelUpStatDelta(modifiers, 'stress');
  const expectedEvasion = character.evasion + countChoice(choices, 'evasion') * levelUpStatDelta(modifiers, 'evasion');
  const rankProficiency = characterRankAchievements(targetLevel).some((item) => item.includes('Мастерств')) ? 1 : 0;
  const expectedProficiency = character.proficiency + rankProficiency + countChoice(choices, 'proficiency') * levelUpStatDelta(modifiers, 'proficiency');
  const expectedThresholds = { major: character.thresholds.major + 1, severe: character.thresholds.severe + 1 };

  if (toSafeInteger(input.hpMax, character.hp.max) !== expectedHp) addIssue(issues, 'hp.invalid', `Максимум Ран должен стать ${expectedHp}.`);
  if (toSafeInteger(input.stressMax, character.stress.max) !== expectedStress) addIssue(issues, 'stress.invalid', `Максимум Стресса должен стать ${expectedStress}.`);
  if (toSafeInteger(input.evasion, character.evasion) !== expectedEvasion) addIssue(issues, 'evasion.invalid', `Уклонение должно стать ${expectedEvasion}.`);
  if (toSafeInteger(input.proficiency, character.proficiency) !== expectedProficiency) addIssue(issues, 'proficiency.invalid', `Мастерство должно стать ${expectedProficiency}.`);
  if (
    toSafeInteger(input.thresholdBonus?.major, character.thresholds.major) !== expectedThresholds.major ||
    toSafeInteger(input.thresholdBonus?.severe, character.thresholds.severe) !== expectedThresholds.severe
  ) {
    addIssue(issues, 'thresholds.invalid', 'При обычном повышении оба порога урона увеличиваются ровно на 1.');
  }
}

function validateExperiences(
  character: Character,
  targetLevel: number,
  choices: readonly CharacterAdvancementChoiceId[],
  input: CharacterLevelUpApplicationInput,
  issues: CharacterLevelUpIssue[]
): void {
  const requiredNew = characterRankAchievements(targetLevel).some((item) => item.includes('Новый Опыт')) ? 1 : 0;
  const newExperiences = (input.experiences ?? []).filter((experience) => Boolean(experience.name?.trim()));
  if (newExperiences.length !== requiredNew || newExperiences.some((experience) => toSafeInteger(experience.modifier, 2) !== 2)) {
    addIssue(issues, 'experience.rankAchievement', requiredNew
      ? 'На новом ранге добавьте ровно один новый Опыт с модификатором +2.'
      : 'Новый Опыт на этом уровне не является достижением ранга.');
  }
  const increases = input.experienceIncreases ?? [];
  const expectedIncreases = countChoice(choices, 'experience');
  const distinctIds = new Set(increases.map((item) => item.experienceId));
  if (
    increases.length !== expectedIncreases ||
    distinctIds.size !== increases.length ||
    increases.some((item) => !character.experiences.some((experience) => experience.id === item.experienceId))
  ) {
    addIssue(issues, 'experience.increaseInvalid', expectedIncreases
      ? `Выберите ${expectedIncreases} существующий Опыт для увеличения на +1.`
      : 'Опыт нельзя увеличивать без соответствующего улучшения.');
  }
}

function validateDomainCards(
  character: Character,
  targetLevel: number,
  choices: readonly CharacterAdvancementChoiceId[],
  input: CharacterLevelUpApplicationInput,
  modifiers: CharacterRuleModifier[],
  issues: CharacterLevelUpIssue[]
): void {
  const cards = input.domainCards ?? [];
  const requiredCards = levelUpDomainCardCount(modifiers) + countChoice(choices, 'domainCard');
  if (cards.length !== requiredCards) addIssue(issues, 'domainCards.count', `При этом повышении нужно выбрать карт домена: ${requiredCards}.`);
  const seen = new Set(character.domainCards.map((card) => String(card.sourceId ?? card.id)));
  const multiclassDomain = input.multiclassDomain || character.advancement?.multiclass?.domain || '';
  const invalid = cards.some((card) => {
    const identity = String(card.sourceId ?? card.id ?? '');
    if (!identity || seen.has(identity)) return true;
    seen.add(identity);
    if (!card.domain || !card.level) return true;
    if (character.domains.includes(card.domain)) return card.level > targetLevel;
    return card.domain !== multiclassDomain || card.level > Math.ceil(targetLevel / 2);
  });
  if (invalid) addIssue(issues, 'domainCards.invalid', 'Выбранная карта уже получена, относится к недоступному домену или имеет слишком высокий уровень.');
}

function validateSubclassCards(
  character: Character,
  choices: readonly CharacterAdvancementChoiceId[],
  input: CharacterLevelUpApplicationInput,
  issues: CharacterLevelUpIssue[]
): void {
  const expectedCount = countChoice(choices, 'subclass');
  const cards = input.subclassCards ?? [];
  const currentTiers = new Set(character.sheetCards.filter((card) => card.kind === 'subclassFeature').map((card) => card.subclassTier));
  const expectedTier = currentTiers.has('specialization') ? 'mastery' : 'specialization';
  const validUpgrade = expectedCount === 0
    ? cards.length === 0
    : expectedCount === 1 && currentTiers.has('foundation') && !currentTiers.has('mastery') && cards.length > 0 &&
      cards.every((card) => card.kind === 'subclassFeature' && card.subclassTier === expectedTier);
  if (!validUpgrade) {
    addIssue(issues, 'subclass.invalid', expectedCount
      ? `Добавьте следующую карту подкласса уровня «${expectedTier}».`
      : 'Карту подкласса нельзя добавлять без соответствующего улучшения.');
  }
}

function advancementChoiceCost(choices: readonly CharacterAdvancementChoiceId[]): number {
  return choices.reduce((total, choice) => total + (CHARACTER_ADVANCEMENT_CHOICES.find((item) => item.id === choice)?.cost ?? 0), 0);
}

function advancementChoiceLimit(
  rank: 2 | 3 | 4,
  choice: Exclude<CharacterAdvancementChoiceId, 'manual'>,
  modifiers: CharacterRuleModifier[]
): number {
  const base: Record<Exclude<CharacterAdvancementChoiceId, 'manual'>, number> = {
    traits: 3,
    hp: rank === 2 ? 2 : 1,
    stress: rank === 2 ? 2 : 1,
    experience: 1,
    domainCard: 1,
    evasion: 1,
    subclass: 1,
    proficiency: 1,
    multiclass: 1
  };
  return Math.max(0, base[choice] + advancementChoiceLimitAdjustment(modifiers, choice));
}

function normalizeChoices(value: readonly CharacterAdvancementChoiceId[] | undefined): CharacterAdvancementChoiceId[] {
  return (value ?? []).filter((choice): choice is CharacterAdvancementChoiceId => (
    CHARACTER_ADVANCEMENT_CHOICES.some((item) => item.id === choice)
  ));
}

function countChoice(choices: readonly CharacterAdvancementChoiceId[], choice: CharacterAdvancementChoiceId): number {
  return choices.filter((item) => item === choice).length;
}

function addIssue(issues: CharacterLevelUpIssue[], code: CharacterLevelUpIssueCode, message: string): void {
  if (!issues.some((issue) => issue.code === code && issue.message === message)) issues.push({ code, message });
}
