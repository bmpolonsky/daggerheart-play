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

/** Capture the earliest local value for every still-unacknowledged field. */
export function createCharacterRollbackPatch(before: Partial<Character>, sent: CharacterPatch, previous?: CharacterPatch): CharacterPatch {
  const set = { ...previous?.set };
  const unset = new Set(previous?.unset);
  for (const key of new Set([...Object.keys(sent.set), ...sent.unset]) as Set<keyof Character>) {
    if (Object.hasOwn(set, key) || unset.has(key)) continue;
    if (before[key] === undefined) unset.add(key);
    else Object.assign(set, { [key]: before[key] });
  }
  return { set, unset: [...unset] };
}

/** A late refusal must never replace a value edited after the refused send. */
export function rollbackRejectedCharacterPatch(current: Character, sent: CharacterPatch, rollback: CharacterPatch): Character {
  const restore: CharacterPatch = { set: {}, unset: [] };
  for (const key of new Set([...Object.keys(sent.set), ...sent.unset]) as Set<keyof Character>) {
    const expected = sent.unset.includes(key) ? undefined : sent.set[key];
    if (JSON.stringify(current[key]) !== JSON.stringify(expected)) continue;
    if (rollback.unset.includes(key)) restore.unset.push(key);
    else if (Object.hasOwn(rollback.set, key)) Object.assign(restore.set, { [key]: rollback.set[key] });
  }
  return applyCharacterPatch(current, restore);
}
