import { parseDiceFormula } from './diceFormula';
import type { TeamworkRollParticipantRole, TraitId } from './types';

interface EventRollBinding {
  scopeKey: string;
  entryId: string;
  actorId: string;
  fingerprint: string;
  /** Explicit GM acknowledgement, never enabled merely by converting the pool. */
  manualOverride?: boolean;
}
export type EventRollContext = EventRollBinding & (
  | { kind: 'rest'; choiceId: string; formula: string }
  | { kind: 'death'; deathChoice: 'avoidDeath' | 'riskItAll' }
  | { kind: 'teamwork'; teamworkRole: TeamworkRollParticipantRole; teamworkRevision?: number; rollType: 'action' | 'reaction'; trait: TraitId; difficulty: number; supportModifier: number }
);
export type EventRollRequest =
  | { kind: 'rest'; entryId: string; actorId: string; choiceId: string }
  | { kind: 'death'; entryId: string; actorId: string; deathChoice: 'avoidDeath' | 'riskItAll' }
  | { kind: 'teamwork'; entryId: string; actorId: string; trait: TraitId };

export interface EventRollDraftView {
  actor: { id?: string | null; kind: string };
  mode: string;
  formula: string;
  trait?: TraitId | null;
  difficulty?: number;
  manualModifier: number;
  advantageCount: number;
  disadvantageCount: number;
  experienceIds: string[];
  critical: boolean;
  extraDice?: Array<{ count: number; sides: number }>;
}
export interface EventRollCompatibility {
  actorLocked: true;
  fixedFormula?: string;
  manualOverrideRequired: boolean;
  error?: string;
}

function normalizedFormula(formula: string): string {
  return JSON.stringify(parseDiceFormula(formula).map((term) => term.kind === 'dice'
    ? [term.sign, term.count, term.sides] : [term.sign, term.value]).filter((term) => term.length !== 2 || term[1] !== 0));
}

export function eventRollCompatibility(context: EventRollContext, draft: EventRollDraftView): EventRollCompatibility {
  const base = { actorLocked: true as const, manualOverrideRequired: false };
  if (draft.actor.kind !== 'character' || draft.actor.id !== context.actorId) return { ...base, error: 'Исполнитель связан с событием. Для другого исполнителя сначала отвяжите бросок.' };
  if ((context.kind === 'rest' || context.kind === 'death' || draft.mode === 'manual') && draft.extraDice?.length) {
    return { ...base, error: 'Для ручного броска события добавочные кости должны быть в формуле. Отдельные добавочные кости не применены.' };
  }
  if (context.kind === 'death') {
    const formula = context.deathChoice === 'avoidDeath' ? '1d12' : '2d12';
    let matches = false;
    try { matches = normalizedFormula(draft.formula) === normalizedFormula(formula); } catch { /* Invalid editor input is blocked. */ }
    return { ...base, fixedFormula: formula, ...(draft.mode !== 'manual' || !matches || draft.manualModifier !== 0 || draft.advantageCount !== 0 || draft.disadvantageCount !== 0 || draft.experienceIds.length > 0 || draft.critical
      ? { error: `Этот предсмертный ход требует ${formula} без модификаторов, Опытов и преимущества. Восстановите набор или явно отвяжите бросок.` } : {}) };
  }
  if (context.kind === 'rest') {
    if (draft.critical) return { ...base, error: 'У восстановления нет критического урона. Снимите этот признак или явно отвяжите бросок.' };
    if (draft.mode !== 'manual') return { ...base, error: 'Ход отдыха требует броска восстановления. Восстановите ручной набор или явно отвяжите бросок.' };
    let matches = false;
    try { matches = normalizedFormula(draft.formula) === normalizedFormula(context.formula); } catch { /* Generic formula validation reports details. */ }
    return { ...base, manualOverrideRequired: !matches || draft.manualModifier !== 0 || draft.advantageCount !== 0 || draft.disadvantageCount !== 0 || draft.experienceIds.length > 0 };
  }
  if (draft.mode === 'manual') return { ...base, manualOverrideRequired: true };
  if (draft.mode !== context.rollType || draft.trait !== context.trait || (draft.difficulty ?? 0) !== context.difficulty) {
    return { ...base, error: 'Роль, характеристика и сложность этого командного броска связаны с событием. Восстановите проверку, выберите ручной итог мастера или явно отвяжите бросок.' };
  }
  try {
    if (normalizedFormula(draft.formula) !== normalizedFormula('2d12')) return { ...base, error: 'Командная проверка требует 2d12. Для другого набора выберите ручной итог мастера или отвяжите бросок.' };
  } catch { return { ...base, error: 'Проверьте формулу командного броска.' }; }
  return base;
}
