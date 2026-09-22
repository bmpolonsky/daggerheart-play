import { isRecord } from '../../core/utils/guards';
import type { Character } from '../rules/types';

export interface CharacterPatch {
  set: Partial<Character>;
  unset: Array<keyof Character>;
}

const protectedFields = new Set(['id', 'createdAt', 'updatedAt', 'changeHistory', 'playerSyncRevision', 'ruleModifiers', '__proto__', 'constructor', 'prototype']);

export function isCharacterPatch(value: unknown): value is CharacterPatch {
  return isRecord(value) && isRecord(value.set) && !Array.isArray(value.set)
    && Array.isArray(value.unset)
    && [...Object.keys(value.set), ...value.unset].every(key => typeof key === 'string' && !protectedFields.has(key));
}

/** Include every unacknowledged field so retries and reordered revisions are self-contained. */
export function createCharacterPatch(before: Partial<Character>, after: Character, pending?: CharacterPatch): CharacterPatch {
  const set = { ...pending?.set };
  const unset = new Set(pending?.unset);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof Character>) {
    if (protectedFields.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (after[key] === undefined) {
      delete set[key];
      unset.add(key);
    } else {
      Object.assign(set, { [key]: after[key] });
      unset.delete(key);
    }
  }
  return { set, unset: [...unset] };
}

export function applyCharacterPatch(current: Character, patch: CharacterPatch): Character {
  const next = { ...current, ...patch.set };
  for (const key of patch.unset) delete next[key];
  return next;
}
