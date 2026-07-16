import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { createId } from '../../core/utils/id';
import type {
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
    if (value.targetKind !== 'feature' && value.targetKind !== 'card') return [];
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

function shouldResetTracker(reset: CharacterUsageTrackerReset, rest: 'short' | 'long'): boolean {
  if (reset === 'manual') return false;
  return rest === 'long' || reset === 'short';
}

function normalizeReset(value: CharacterUsageTrackerReset | undefined): CharacterUsageTrackerReset {
  return value === 'short' || value === 'long' ? value : 'manual';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
