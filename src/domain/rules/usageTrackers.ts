import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { createId } from '../../core/utils/id';
import { featureUsageSuggestions, type FeatureUsageLimitEffect } from './featureEffects';
import type {
  Character,
  CharacterUsageTracker,
  CharacterUsageTrackerReset,
  CharacterUsageTrackerTargetKind
} from './types';

export interface CharacterUsageTrackerInput {
  id?: string;
  targetKind: CharacterUsageTrackerTargetKind;
  targetId: string;
  label?: string;
  current?: number;
  max?: number;
  reset?: CharacterUsageTrackerReset;
}

export interface AutomaticUsageTrackerCandidate {
  effect: FeatureUsageLimitEffect;
  tracker: CharacterUsageTracker;
}

export function createCharacterUsageTracker(input: CharacterUsageTrackerInput): CharacterUsageTracker {
  const max = clamp(toSafeInteger(input.max, 1), 1, 99);
  return {
    id: input.id?.trim() || createId('usage'),
    targetKind: input.targetKind,
    targetId: input.targetId.trim(),
    label: input.label?.trim() || 'Использования',
    current: clamp(toSafeInteger(input.current, 0), 0, max),
    max,
    reset: normalizeReset(input.reset)
  };
}

export function normalizeCharacterUsageTrackers(input: unknown): CharacterUsageTracker[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap((value) => {
    if (!isRecord(value)) return [];
    if (value.targetKind !== 'feature' && value.targetKind !== 'card' && value.targetKind !== 'armor' && value.targetKind !== 'inventory') return [];
    if (typeof value.targetId !== 'string' || !value.targetId.trim()) return [];
    const tracker = createCharacterUsageTracker({
      id: typeof value.id === 'string' ? value.id : undefined,
      targetKind: value.targetKind,
      targetId: value.targetId,
      label: typeof value.label === 'string' ? value.label : undefined,
      current: typeof value.current === 'number' ? value.current : undefined,
      max: typeof value.max === 'number' ? value.max : undefined,
      reset: value.reset === 'short' || value.reset === 'long' || value.reset === 'manual' ? value.reset : undefined
    });
    if (seen.has(tracker.id)) return [];
    seen.add(tracker.id);
    return [tracker];
  });
}

export function updateCharacterUsageTracker(
  trackers: readonly CharacterUsageTracker[],
  trackerId: string,
  patch: Partial<Pick<CharacterUsageTracker, 'label' | 'current' | 'max' | 'reset'>>
): CharacterUsageTracker[] {
  return trackers.map((tracker) => {
    if (tracker.id !== trackerId) return tracker;
    const max = clamp(toSafeInteger(patch.max, tracker.max), 1, 99);
    return {
      ...tracker,
      label: patch.label === undefined ? tracker.label : patch.label.trim() || 'Использования',
      current: clamp(toSafeInteger(patch.current, tracker.current), 0, max),
      max,
      reset: patch.reset === undefined ? tracker.reset : normalizeReset(patch.reset)
    };
  });
}

export function resetCharacterUsageTrackers(
  trackers: readonly CharacterUsageTracker[],
  rest: 'short' | 'long'
): CharacterUsageTracker[] {
  return trackers.map((tracker) => (
    shouldResetTracker(tracker.reset, rest) && tracker.current !== 0
      ? { ...tracker, current: 0 }
      : tracker
  ));
}

export function removeCharacterUsageTracker(trackers: readonly CharacterUsageTracker[], trackerId: string): CharacterUsageTracker[] {
  return trackers.filter((tracker) => tracker.id !== trackerId);
}

export function automaticUsageTrackerCandidates(input: {
  targetKind: CharacterUsageTrackerTargetKind;
  targetId: string;
  targetName: string;
  text: string;
  allFeatures?: readonly { name?: string; text: string }[];
}): AutomaticUsageTrackerCandidate[] {
  const effects = featureUsageSuggestions(input.text, input.targetName, input.allFeatures);
  const directCounts = new Map<string, number>();
  return effects.flatMap((effect) => {
    const options = effect.scope === 'perOption' ? effect.options ?? [] : [undefined];
    return options.map((option) => {
      const key = option ? `option-${stableKey(option)}` : effect.reset;
      const occurrence = directCounts.get(key) ?? 0;
      directCounts.set(key, occurrence + 1);
      const resolvedEffect: FeatureUsageLimitEffect = option
        ? { ...effect, scope: 'feature', targetLabel: option, options: undefined, summary: `${option}: ${effect.max}` }
        : effect;
      return {
        effect: resolvedEffect,
        tracker: createCharacterUsageTracker({
          id: `auto-usage:${input.targetKind}:${input.targetId}:${key}${occurrence ? `-${occurrence + 1}` : ''}`,
          targetKind: input.targetKind,
          targetId: input.targetId,
          label: option ?? usageResetLabel(effect.reset),
          max: effect.max,
          reset: usageReset(effect.reset)
        })
      };
    });
  });
}

export function addMissingAutomaticUsageTrackers(
  trackers: readonly CharacterUsageTracker[],
  candidates: readonly AutomaticUsageTrackerCandidate[]
): CharacterUsageTracker[] {
  return [
    ...trackers,
    ...missingAutomaticUsageTrackerCandidates(trackers, candidates).map((candidate) => candidate.tracker)
  ];
}

export function missingAutomaticUsageTrackerCandidates(
  trackers: readonly CharacterUsageTracker[],
  candidates: readonly AutomaticUsageTrackerCandidate[]
): AutomaticUsageTrackerCandidate[] {
  const consumed = new Set<number>();
  return candidates.filter((candidate) => {
    const covered = trackers.findIndex((tracker, index) => (
      !consumed.has(index) && automaticTrackerMatches(tracker, candidate)
    ));
    if (covered < 0) return true;
    consumed.add(covered);
    return false;
  });
}

export function refreshAutomaticUsageTrackers(
  trackers: readonly CharacterUsageTracker[],
  previousCandidates: readonly AutomaticUsageTrackerCandidate[],
  candidates: readonly AutomaticUsageTrackerCandidate[]
): CharacterUsageTracker[] {
  const previousById = new Map(previousCandidates.map((candidate) => [candidate.tracker.id, candidate.tracker]));
  const nextById = new Map(candidates.map((candidate) => [candidate.tracker.id, candidate.tracker]));
  const result = trackers.flatMap((tracker) => {
    const previous = previousById.get(tracker.id);
    if (!previous) return [tracker];
    const next = nextById.get(tracker.id);
    if (!next) return [];
    return [{
      ...tracker,
      label: tracker.label === previous.label ? next.label : tracker.label,
      current: Math.min(tracker.current, next.max),
      max: next.max,
      reset: next.reset
    }];
  });
  const existing = new Set(result.map((tracker) => tracker.id));
  for (const candidate of candidates) {
    if (!existing.has(candidate.tracker.id) && !previousById.has(candidate.tracker.id)) result.push(candidate.tracker);
  }
  return result;
}

export function backfillAutomaticUsageTrackers(character: Character): CharacterUsageTracker[] {
  const candidates = [
    ...character.sheetCards.filter((card) => card.kind !== 'item').flatMap((card) => automaticUsageTrackerCandidatesForCharacter(character, 'feature', card.id)),
    ...character.domainCards.flatMap((card) => automaticUsageTrackerCandidatesForCharacter(character, 'card', card.id)),
    ...automaticUsageTrackerCandidatesForCharacter(character, 'armor', 'armor'),
    ...character.inventory.filter((item) => !item.uses).flatMap((item) => automaticUsageTrackerCandidatesForCharacter(character, 'inventory', item.id))
  ];
  return addMissingAutomaticUsageTrackers(character.usageTrackers ?? [], candidates);
}

export function automaticUsageTrackerCandidatesForCharacter(
  character: Character,
  targetKind: CharacterUsageTrackerTargetKind,
  targetId: string
): AutomaticUsageTrackerCandidate[] {
  if (targetKind === 'card') {
    const card = character.domainCards.find((item) => item.id === targetId);
    return card ? automaticUsageTrackerCandidates({ targetKind, targetId, targetName: card.name, text: card.text }) : [];
  }
  if (targetKind === 'armor') {
    return targetId === 'armor' ? automaticUsageTrackerCandidates({
      targetKind, targetId, targetName: character.armor.name, text: character.armor.featureText ?? character.armor.feature ?? ''
    }) : [];
  }
  if (targetKind === 'inventory') {
    const item = character.inventory.find((candidate) => candidate.id === targetId);
    return item && !item.uses
      ? automaticUsageTrackerCandidates({ targetKind, targetId, targetName: item.name, text: item.text ?? '' })
      : [];
  }
  const feature = character.sheetCards.find((card) => card.id === targetId && card.kind !== 'item');
  return feature ? automaticUsageTrackerCandidates({
    targetKind,
    targetId,
    targetName: feature.name,
    text: feature.text ?? '',
    allFeatures: character.sheetCards.filter((card) => card.kind !== 'item').map((card) => ({ name: card.name, text: card.text ?? '' }))
  }) : [];
}

function shouldResetTracker(reset: CharacterUsageTrackerReset, rest: 'short' | 'long'): boolean {
  if (reset === 'manual') return false;
  return rest === 'long' || reset === 'short';
}

function normalizeReset(value: CharacterUsageTrackerReset | undefined): CharacterUsageTrackerReset {
  return value === 'short' || value === 'long' ? value : 'manual';
}

function usageReset(value: FeatureUsageLimitEffect['reset']): CharacterUsageTrackerReset {
  if (value === 'rest') return 'short';
  if (value === 'longRest') return 'long';
  return 'manual';
}

function usageResetLabel(value: FeatureUsageLimitEffect['reset']): string {
  if (value === 'rest') return 'До отдыха';
  if (value === 'longRest') return 'До продолжительного отдыха';
  if (value === 'session') return 'За сессию';
  return 'За сцену';
}

function stableKey(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function automaticTrackerMatches(tracker: CharacterUsageTracker, candidate: AutomaticUsageTrackerCandidate): boolean {
  const optionLabel = candidate.effect.targetLabel && stableKey(candidate.tracker.label) === stableKey(candidate.effect.targetLabel);
  return tracker.id === candidate.tracker.id || (
    tracker.targetKind === candidate.tracker.targetKind &&
    tracker.targetId === candidate.tracker.targetId &&
    tracker.max === candidate.tracker.max &&
    tracker.reset === candidate.tracker.reset &&
    (!optionLabel || stableKey(tracker.label) === stableKey(candidate.tracker.label))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
