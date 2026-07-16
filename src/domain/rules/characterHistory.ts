import { createId } from '../../core/utils/id';
import type {
  Character,
  CharacterChangeActor,
  CharacterChangeRecord,
  CharacterChangeValue,
  CharacterFieldChange
} from './types';

const AUDIT_EXCLUDED_FIELDS = new Set(['changeHistory', 'updatedAt', 'playerSyncRevision']);
export const MAX_CHARACTER_CHANGE_HISTORY = 200;
const EDIT_COALESCE_WINDOW_MS = 2_500;

export interface CharacterMutationContext {
  actor?: CharacterChangeActor;
  changedAt?: string;
  kind?: CharacterChangeRecord['kind'];
  summary?: string;
  undoesChangeId?: string;
  overrideReason?: string;
}

export interface CharacterUndoResult {
  status: 'applied' | 'notFound' | 'alreadyUndone' | 'conflict' | 'empty';
  character: Character;
  conflicts: string[][];
  target?: CharacterChangeRecord;
}

export const SYSTEM_CHARACTER_ACTOR: CharacterChangeActor = {
  id: 'system',
  name: 'Система',
  role: 'system'
};

export function diffCharacterChanges(before: Character, after: Character): CharacterFieldChange[] {
  const changes: CharacterFieldChange[] = [];
  diffValues(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, [], changes);
  return changes;
}

export function createCharacterChangeRecord(
  before: Character,
  after: Character,
  context: CharacterMutationContext = {}
): CharacterChangeRecord | null {
  const changes = diffCharacterChanges(before, after);
  if (changes.length === 0) return null;
  return {
    id: createId('character-change'),
    actor: normalizeActor(context.actor),
    changedAt: context.changedAt ?? after.updatedAt,
    kind: context.kind ?? 'edit',
    summary: context.summary?.trim() || defaultSummary(context.kind),
    changes,
    ...(context.undoesChangeId ? { undoesChangeId: context.undoesChangeId } : {}),
    ...(context.overrideReason?.trim() ? { overrideReason: context.overrideReason.trim() } : {})
  };
}

export function appendCharacterChangeHistory(character: Character, record: CharacterChangeRecord | null): Character {
  if (!record) return character;
  const current = character.changeHistory ?? [];
  const previous = current.at(-1);
  const merged = previous ? coalesceCharacterEdit(previous, record) : null;
  const history = (merged === false
    ? current.slice(0, -1)
    : merged
      ? [...current.slice(0, -1), merged]
      : [...current, record]
  ).slice(-MAX_CHARACTER_CHANGE_HISTORY);
  return { ...character, changeHistory: history };
}

function coalesceCharacterEdit(previous: CharacterChangeRecord, next: CharacterChangeRecord): CharacterChangeRecord | false | null {
  if (previous.kind !== 'edit' || next.kind !== 'edit') return null;
  if (previous.undoesChangeId || next.undoesChangeId || previous.overrideReason || next.overrideReason) return null;
  if (previous.actor.id !== next.actor.id || previous.actor.role !== next.actor.role || previous.summary !== next.summary) return null;
  const previousAt = Date.parse(previous.changedAt);
  const nextAt = Date.parse(next.changedAt);
  if (!Number.isFinite(previousAt) || !Number.isFinite(nextAt) || nextAt < previousAt || nextAt - previousAt > EDIT_COALESCE_WINDOW_MS) return null;

  const changes = previous.changes.map((change) => ({ ...change, path: [...change.path] }));
  for (const incoming of next.changes) {
    const index = changes.findIndex((change) => samePath(change.path, incoming.path));
    if (index < 0) {
      // Parent/child diffs cannot be merged safely because their before/after
      // values describe different document shapes.
      if (changes.some((change) => pathsOverlap(change.path, incoming.path))) return null;
      changes.push({ ...incoming, path: [...incoming.path] });
      continue;
    }
    const existing = changes[index];
    if (existing.afterExists !== incoming.beforeExists || (
      existing.afterExists && !deepEqual(existing.after, incoming.before)
    )) return null;
    const merged = {
      ...existing,
      afterExists: incoming.afterExists,
      ...(incoming.afterExists ? { after: incoming.after } : {})
    } as CharacterFieldChange;
    if (!incoming.afterExists) delete merged.after;
    if (merged.beforeExists === merged.afterExists && (!merged.beforeExists || deepEqual(merged.before, merged.after))) {
      changes.splice(index, 1);
    } else {
      changes[index] = merged;
    }
  }
  if (changes.length === 0) return false;
  return { ...previous, changedAt: next.changedAt, changes };
}

function samePath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function pathsOverlap(left: string[], right: string[]): boolean {
  const length = Math.min(left.length, right.length);
  return left.slice(0, length).every((part, index) => part === right[index]);
}

/**
 * Undo is optimistic and atomic: every touched field must still equal the value
 * written by the target change. This prevents undo from overwriting later edits.
 */
export function applySafeCharacterUndo(character: Character, changeId: string): CharacterUndoResult {
  const history = character.changeHistory ?? [];
  const target = history.find((record) => record.id === changeId);
  if (!target) return { status: 'notFound', character, conflicts: [] };
  if (target.changes.length === 0) return { status: 'empty', character, conflicts: [], target };
  if (history.some((record) => record.undoesChangeId === changeId)) {
    return { status: 'alreadyUndone', character, conflicts: [], target };
  }

  const conflicts = target.changes.flatMap((change) => (
    pathMatchesAfter(character, change) ? [] : [change.path]
  ));
  if (conflicts.length > 0) return { status: 'conflict', character, conflicts, target };

  let reverted: unknown = cloneValue(character);
  for (const change of [...target.changes].reverse()) {
    reverted = setPathValue(reverted, change.path, change.beforeExists, change.before);
  }
  return { status: 'applied', character: reverted as Character, conflicts: [], target };
}

export function normalizeCharacterChangeHistory(value: unknown): CharacterChangeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !isRecord(item.actor) || !Array.isArray(item.changes)) return [];
    const role = item.actor.role;
    if (role !== 'player' && role !== 'gm' && role !== 'system') return [];
    const kind = item.kind;
    if (kind !== 'edit' && kind !== 'levelUp' && kind !== 'cardMove' && kind !== 'tracker' && kind !== 'undo' && kind !== 'freeform') return [];
    const changes = item.changes.flatMap(normalizeFieldChange);
    if (changes.length === 0) return [];
    return [{
      id: item.id,
      actor: {
        id: typeof item.actor.id === 'string' ? item.actor.id : 'system',
        name: typeof item.actor.name === 'string' ? item.actor.name : 'Система',
        role
      },
      changedAt: typeof item.changedAt === 'string' ? item.changedAt : new Date(0).toISOString(),
      kind,
      summary: typeof item.summary === 'string' ? item.summary : defaultSummary(kind),
      changes,
      ...(typeof item.undoesChangeId === 'string' ? { undoesChangeId: item.undoesChangeId } : {}),
      ...(typeof item.overrideReason === 'string' ? { overrideReason: item.overrideReason } : {})
    } satisfies CharacterChangeRecord];
  }).slice(-MAX_CHARACTER_CHANGE_HISTORY);
}

function diffValues(before: unknown, after: unknown, path: string[], changes: CharacterFieldChange[]): void {
  if (deepEqual(before, after)) return;
  if (isRecord(before) && isRecord(after) && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (path.length === 0 && AUDIT_EXCLUDED_FIELDS.has(key)) continue;
      const beforeExists = Object.prototype.hasOwnProperty.call(before, key);
      const afterExists = Object.prototype.hasOwnProperty.call(after, key);
      if (!beforeExists || !afterExists) {
        // JSON transport removes optional `undefined` keys while local factory
        // normalization can restore them. Missing and explicitly undefined are
        // the same domain value and must not pollute the audit trail.
        const beforeValue = beforeExists ? before[key] : undefined;
        const afterValue = afterExists ? after[key] : undefined;
        if (beforeValue === undefined && afterValue === undefined) continue;
        changes.push(fieldChange([...path, key], beforeExists, afterExists, before[key], after[key]));
      } else {
        diffValues(before[key], after[key], [...path, key], changes);
      }
    }
    return;
  }
  changes.push(fieldChange(path, true, true, before, after));
}

function fieldChange(path: string[], beforeExists: boolean, afterExists: boolean, before: unknown, after: unknown): CharacterFieldChange {
  return {
    path,
    beforeExists,
    afterExists,
    ...(beforeExists ? { before: toChangeValue(before) } : {}),
    ...(afterExists ? { after: toChangeValue(after) } : {})
  };
}

function normalizeFieldChange(value: unknown): CharacterFieldChange[] {
  if (!isRecord(value) || !Array.isArray(value.path) || !value.path.every((part) => typeof part === 'string')) return [];
  if (typeof value.beforeExists !== 'boolean' || typeof value.afterExists !== 'boolean') return [];
  return [{
    path: value.path as string[],
    beforeExists: value.beforeExists,
    afterExists: value.afterExists,
    ...(value.beforeExists ? { before: toChangeValue(value.before) } : {}),
    ...(value.afterExists ? { after: toChangeValue(value.after) } : {})
  }];
}

function pathMatchesAfter(character: Character, change: CharacterFieldChange): boolean {
  const current = readPath(character, change.path);
  return current.exists === change.afterExists && (!current.exists || deepEqual(toChangeValue(current.value), change.after));
}

function readPath(root: unknown, path: string[]): { exists: boolean; value?: unknown } {
  let value = root;
  for (const part of path) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, part)) return { exists: false };
    value = value[part];
  }
  return { exists: true, value };
}

function setPathValue(root: unknown, path: string[], exists: boolean, nextValue: unknown): unknown {
  if (path.length === 0) return exists ? fromChangeValue(nextValue) : root;
  const clone = cloneValue(root) as Record<string, unknown>;
  let cursor = clone;
  for (const part of path.slice(0, -1)) {
    const child = isRecord(cursor[part]) ? cloneValue(cursor[part]) as Record<string, unknown> : {};
    cursor[part] = child;
    cursor = child;
  }
  const key = path[path.length - 1];
  if (exists) cursor[key] = fromChangeValue(nextValue);
  else delete cursor[key];
  return clone;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])) as T;
  }
  return value;
}

function toChangeValue(value: unknown): CharacterChangeValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toChangeValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toChangeValue(item)]));
  return { __characterChangeUndefined: true };
}

function fromChangeValue(value: unknown): unknown {
  if (isRecord(value) && value.__characterChangeUndefined === true && Object.keys(value).length === 1) return undefined;
  if (Array.isArray(value)) return value.map(fromChangeValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromChangeValue(item)]));
  return value;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right) && !Array.isArray(left) && !Array.isArray(right)) {
    const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
    const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key])
    ));
  }
  return false;
}

function normalizeActor(actor: CharacterChangeActor | undefined): CharacterChangeActor {
  if (!actor) return SYSTEM_CHARACTER_ACTOR;
  return {
    id: actor.id.trim() || SYSTEM_CHARACTER_ACTOR.id,
    name: actor.name.trim() || SYSTEM_CHARACTER_ACTOR.name,
    role: actor.role
  };
}

function defaultSummary(kind: CharacterChangeRecord['kind'] | undefined): string {
  if (kind === 'levelUp') return 'Повышение уровня';
  if (kind === 'cardMove') return 'Изменение Руки';
  if (kind === 'tracker') return 'Изменение трекера';
  if (kind === 'undo') return 'Отмена изменения';
  if (kind === 'freeform') return 'Свободное редактирование Мастера';
  return 'Изменение персонажа';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
