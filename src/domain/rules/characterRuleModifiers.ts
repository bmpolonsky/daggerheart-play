import type { GenericLibraryItem } from '../content/types';
import type { CharacterAdvancementChoiceId } from './types';

const MODIFIER_AMOUNT_MIN = -20;
const MODIFIER_AMOUNT_MAX = 20;
const MODIFIER_TEXT_MAX = 160;

const MODIFIER_SOURCES = new Set<CharacterRuleModifier['source']>(['subclass', 'feature', 'homebrew', 'manual']);
const MODIFIER_KINDS = new Set<CharacterRuleModifier['kind']>([
  'startingDomainCards',
  'levelUpChoices',
  'levelUpDomainCards',
  'advancementChoiceLimit',
  'levelUpStatDelta',
  'handSize'
]);
const ADVANCEMENT_CHOICES = new Set<Exclude<CharacterAdvancementChoiceId, 'manual'>>([
  'traits',
  'hp',
  'stress',
  'experience',
  'domainCard',
  'evasion',
  'subclass',
  'proficiency',
  'multiclass'
]);
const STAT_DELTA_CHOICES = new Set<CharacterLevelUpStatDeltaModifier['choice']>(['hp', 'stress', 'evasion', 'proficiency']);

export type CharacterRuleModifier =
  | CharacterStartingDomainCardsModifier
  | CharacterLevelUpChoicesModifier
  | CharacterLevelUpDomainCardsModifier
  | CharacterAdvancementChoiceLimitModifier
  | CharacterLevelUpStatDeltaModifier
  | CharacterHandSizeModifier;

interface CharacterRuleModifierBase {
  id: string;
  source: 'subclass' | 'feature' | 'homebrew' | 'manual';
  sourceId?: string | number;
  label: string;
}

export interface CharacterStartingDomainCardsModifier extends CharacterRuleModifierBase {
  kind: 'startingDomainCards';
  amount: number;
}

export interface CharacterLevelUpChoicesModifier extends CharacterRuleModifierBase {
  kind: 'levelUpChoices';
  amount: number;
}

export interface CharacterLevelUpDomainCardsModifier extends CharacterRuleModifierBase {
  kind: 'levelUpDomainCards';
  amount: number;
}

export interface CharacterAdvancementChoiceLimitModifier extends CharacterRuleModifierBase {
  kind: 'advancementChoiceLimit';
  choice: Exclude<CharacterAdvancementChoiceId, 'manual'>;
  amount: number;
}

export interface CharacterLevelUpStatDeltaModifier extends CharacterRuleModifierBase {
  kind: 'levelUpStatDelta';
  choice: 'hp' | 'stress' | 'evasion' | 'proficiency';
  amount: number;
}

export interface CharacterHandSizeModifier extends CharacterRuleModifierBase {
  kind: 'handSize';
  amount: number;
}

/**
 * Character modifiers cross persistence and P2P boundaries, so they are
 * normalized independently from any UI. Unknown rules are ignored instead of
 * becoming executable homebrew, amounts are finite bounded integers, and ids
 * are unique so updates stay deterministic.
 */
export function normalizeCharacterRuleModifiers(input: unknown): CharacterRuleModifier[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: CharacterRuleModifier[] = [];
  for (const value of input) {
    const modifier = normalizeCharacterRuleModifier(value);
    if (!modifier || seen.has(modifier.id)) continue;
    seen.add(modifier.id);
    normalized.push(modifier);
  }
  return normalized;
}

function normalizeCharacterRuleModifier(value: unknown): CharacterRuleModifier | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const id = normalizeText(candidate.id);
  const label = normalizeText(candidate.label);
  const kind = candidate.kind;
  const source = candidate.source;
  if (!id || !label || typeof kind !== 'string' || !MODIFIER_KINDS.has(kind as CharacterRuleModifier['kind'])) return null;
  if (typeof source !== 'string' || !MODIFIER_SOURCES.has(source as CharacterRuleModifier['source'])) return null;
  if (typeof candidate.amount !== 'number' || !Number.isFinite(candidate.amount)) return null;
  const amount = Math.max(MODIFIER_AMOUNT_MIN, Math.min(MODIFIER_AMOUNT_MAX, Math.trunc(candidate.amount)));
  const base = {
    id,
    kind,
    source: source as CharacterRuleModifier['source'],
    label,
    amount,
    ...(normalizeSourceId(candidate.sourceId) !== undefined ? { sourceId: normalizeSourceId(candidate.sourceId) } : {})
  };
  if (kind === 'advancementChoiceLimit') {
    const choice = candidate.choice;
    return typeof choice === 'string' && ADVANCEMENT_CHOICES.has(choice as Exclude<CharacterAdvancementChoiceId, 'manual'>)
      ? { ...base, kind, choice: choice as Exclude<CharacterAdvancementChoiceId, 'manual'> }
      : null;
  }
  if (kind === 'levelUpStatDelta') {
    const choice = candidate.choice;
    return typeof choice === 'string' && STAT_DELTA_CHOICES.has(choice as CharacterLevelUpStatDeltaModifier['choice'])
      ? { ...base, kind, choice: choice as CharacterLevelUpStatDeltaModifier['choice'] }
      : null;
  }
  return base as CharacterRuleModifier;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MODIFIER_TEXT_MAX) : '';
}

function normalizeSourceId(value: unknown): string | number | undefined {
  if (typeof value === 'string') return normalizeText(value) || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

const SCHOOL_OF_KNOWLEDGE_SLUG = 'school-of-knowledge';
const PREPARED_FEATURE_IDS = new Set(['208']);
const PREPARED_FEATURE_NAMES = new Set(['prepared', 'подготовленный']);

/**
 * Mechanical modifiers are intentionally registered from stable content identity.
 * Rules text is supporting evidence only, never parsed as executable homebrew.
 */
export function characterBuilderRuleModifiersForSubclass(subclass: GenericLibraryItem | null | undefined): CharacterRuleModifier[] {
  if (!subclass || normalizeSlug(subclass.slug) !== SCHOOL_OF_KNOWLEDGE_SLUG) return [];
  const foundation = Array.isArray(subclass.raw.foundation_features) ? subclass.raw.foundation_features : [];
  const prepared = foundation.find((feature) => {
    const featureId = String(feature.id ?? '');
    const featureName = String(feature.name ?? '').trim().toLowerCase();
    return PREPARED_FEATURE_IDS.has(featureId) || PREPARED_FEATURE_NAMES.has(featureName);
  });
  if (!prepared) return [];

  return [{
    id: `${SCHOOL_OF_KNOWLEDGE_SLUG}:prepared:starting-domain-card`,
    kind: 'startingDomainCards',
    source: 'subclass',
    sourceId: prepared.id ?? subclass.sourceId,
    label: String(prepared.name ?? 'Prepared'),
    amount: 1
  }];
}

export function startingDomainCardCount(modifiers: readonly CharacterRuleModifier[] = []): number {
  return Math.max(0, 2 + modifierTotal(modifiers, 'startingDomainCards'));
}

export function levelUpAdvancementChoiceCount(modifiers: readonly CharacterRuleModifier[] = []): number {
  return Math.max(0, 2 + modifierTotal(modifiers, 'levelUpChoices'));
}

export function levelUpDomainCardCount(modifiers: readonly CharacterRuleModifier[] = []): number {
  return Math.max(0, 1 + modifierTotal(modifiers, 'levelUpDomainCards'));
}

export function characterHandSize(modifiers: readonly CharacterRuleModifier[] = []): number {
  return Math.max(0, 5 + modifierTotal(modifiers, 'handSize'));
}

export function advancementChoiceLimitAdjustment(
  modifiers: readonly CharacterRuleModifier[],
  choice: Exclude<CharacterAdvancementChoiceId, 'manual'>
): number {
  return modifiers.reduce((total, modifier) => (
    modifier.kind === 'advancementChoiceLimit' && modifier.choice === choice
      ? total + safeModifierAmount(modifier.amount)
      : total
  ), 0);
}

export function levelUpStatDelta(
  modifiers: readonly CharacterRuleModifier[],
  choice: 'hp' | 'stress' | 'evasion' | 'proficiency'
): number {
  return Math.max(0, 1 + modifiers.reduce((total, modifier) => (
    modifier.kind === 'levelUpStatDelta' && modifier.choice === choice
      ? total + safeModifierAmount(modifier.amount)
      : total
  ), 0));
}

function modifierTotal<K extends CharacterRuleModifier['kind']>(modifiers: readonly CharacterRuleModifier[], kind: K): number {
  return modifiers.reduce((total, modifier) => (
    modifier.kind === kind && 'amount' in modifier ? total + safeModifierAmount(modifier.amount) : total
  ), 0);
}

function safeModifierAmount(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}
