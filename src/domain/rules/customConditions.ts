import { ACTOR_STATUS_TAGS, normalizeStatusTag, statusLabel } from './statuses';
import type { CharacterCondition } from './types';

export interface CustomConditionDraft {
  name: string;
  notes?: string;
  removalCondition?: string;
}

export type CustomConditionRecord = CharacterCondition & { removalCondition?: string };

/** Read legacy reminders as ordinary text without migrating saved characters. */
export function customConditionNote(condition?: Pick<CustomConditionRecord, 'notes' | 'removalCondition'>): string {
  return [condition?.notes, condition?.removalCondition ? `Условие снятия: ${condition.removalCondition}` : '']
    .filter(Boolean).join('\n\n');
}

export function customConditionDraft(condition?: CustomConditionRecord): CustomConditionDraft {
  return { name: condition?.name ?? '', notes: customConditionNote(condition) };
}

const reservedNames = new Set(ACTOR_STATUS_TAGS.flatMap((tag) => [normalizeStatusTag(tag), normalizeStatusTag(statusLabel(tag))]));

export function isCustomCondition(condition: Pick<CharacterCondition, 'name'>): boolean {
  return !reservedNames.has(normalizeStatusTag(condition.name));
}

/** Manual annotations only: no rule effects or automatic removal are inferred. */
export function applyCustomConditionEdit(
  conditions: readonly CustomConditionRecord[],
  draft: CustomConditionDraft,
  conditionId: string
): { conditions: CustomConditionRecord[]; issue: string | null } {
  const name = draft.name.trim();
  const normalizedName = normalizeStatusTag(name);
  const current = conditions.find((condition) => condition.id === conditionId);
  const unchanged = () => [...conditions];
  if (!name) return { conditions: unchanged(), issue: 'Укажите название состояния.' };
  if (!conditionId.trim()) return { conditions: unchanged(), issue: 'Не удалось определить состояние.' };
  if (reservedNames.has(normalizedName) || (current && !isCustomCondition(current))) {
    return { conditions: unchanged(), issue: 'Основные состояния добавляются отдельно.' };
  }
  if (conditions.some((condition) => condition.id !== conditionId && normalizeStatusTag(condition.name) === normalizedName)) {
    return { conditions: unchanged(), issue: 'Состояние с таким названием уже добавлено.' };
  }
  const next: CustomConditionRecord = {
    ...current,
    id: conditionId,
    name,
    notes: draft.notes?.trim() || undefined,
    removalCondition: draft.removalCondition?.trim() || undefined
  };
  return {
    conditions: current
      ? conditions.map((condition) => condition.id === conditionId ? next : condition)
      : [...conditions, next],
    issue: null
  };
}
