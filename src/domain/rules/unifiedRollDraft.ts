import { createId } from '../../core/utils/id';
import { parseDiceFormula, type ParsedFormulaTerm } from './diceFormula';
import type { DamageType, TraitId } from './types';
import type { EventRollContext } from './eventRoll';

export interface UnifiedRollActor {
  key: string;
  id: string | null;
  name: string;
  kind: 'gm' | 'unassigned' | 'character' | 'adversary' | 'environment';
}

export type UnifiedRollMode = 'action' | 'reaction' | 'damage' | 'manual' | 'gmAttack';

/** A source binding supplies a count, not an ability evaluator. */
export interface UnifiedRollQuantity {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  formulaTemplate: string;
  /** Literal flat bonus per selected die, compiled into a number before parsing. */
  flatPerCount?: number;
  explanation?: string;
}

export interface UnifiedRollBranch {
  id: string;
  label: string;
  formula: string;
  quantity?: UnifiedRollQuantity;
}

export interface UnifiedRollDraft {
  id: string;
  scopeKey?: string;
  actor: UnifiedRollActor;
  mode: UnifiedRollMode;
  title: string;
  formula: string;
  trait?: TraitId | null;
  difficulty?: number;
  damageType?: DamageType;
  damage?: { formula: string; damageType?: DamageType };
  notes?: string;
  manualModifier: number;
  advantageCount: number;
  disadvantageCount: number;
  experienceIds: string[];
  spendHopeForExperiences: boolean;
  critical: boolean;
  attackModifier?: number;
  source?: { cardId?: string; sourceId?: string | number; label?: string; isCompanion?: boolean };
  quantity?: UnifiedRollQuantity;
  branches?: UnifiedRollBranch[];
  selectedBranchId?: string;
  hint?: string;
  eventContext?: EventRollContext;
  eventUnlinked?: boolean;
}

export type UnifiedRollDraftInput = Pick<UnifiedRollDraft, 'actor' | 'mode' | 'title' | 'formula'> & Partial<Omit<UnifiedRollDraft, 'actor' | 'mode' | 'title' | 'formula'>>;

export function createUnifiedRollDraft(input: UnifiedRollDraftInput): UnifiedRollDraft {
  return {
    ...input,
    id: input.id ?? createId('roll-draft'),
    actor: { ...input.actor },
    ...(input.source ? { source: { ...input.source } } : {}),
    ...(input.eventContext ? { eventContext: { ...input.eventContext } } : {}),
    ...(input.damage ? { damage: { ...input.damage } } : {}),
    ...(input.quantity ? { quantity: { ...input.quantity } } : {}),
    ...(input.branches ? { branches: input.branches.map((branch) => ({ ...branch, ...(branch.quantity ? { quantity: { ...branch.quantity } } : {}) })) } : {}),
    manualModifier: input.manualModifier ?? 0,
    advantageCount: input.advantageCount ?? 0,
    disadvantageCount: input.disadvantageCount ?? 0,
    experienceIds: [...(input.experienceIds ?? [])],
    spendHopeForExperiences: input.source?.isCompanion === true && (input.mode === 'action' || input.mode === 'reaction') ? true : input.spendHopeForExperiences ?? true,
    critical: input.critical ?? false
  };
}

export function isTypedUnifiedRoll(draft: Pick<UnifiedRollDraft, 'mode'>): boolean {
  return draft.mode === 'action' || draft.mode === 'reaction' || draft.mode === 'gmAttack';
}

export function unifiedRollPaysForExperiences(draft: Pick<UnifiedRollDraft, 'mode' | 'source' | 'spendHopeForExperiences'>): boolean {
  return draft.source?.isCompanion === true && (draft.mode === 'action' || draft.mode === 'reaction')
    ? true : draft.spendHopeForExperiences;
}

/** Only this explicit intent detaches a prepared result from its event. */
export function unlinkUnifiedRollEvent(draft: UnifiedRollDraft): UnifiedRollDraft {
  return { ...draft, eventContext: undefined, eventUnlinked: true };
}

/** Caller must explicitly confirm this conversion and provide the complete formula. */
export function convertUnifiedRollToManual(draft: UnifiedRollDraft, completeFormula: string): UnifiedRollDraft {
  parseDiceFormula(completeFormula);
  return {
    ...draft,
    mode: 'manual',
    formula: completeFormula,
    trait: undefined,
    experienceIds: [],
    spendHopeForExperiences: false,
    manualModifier: 0,
    advantageCount: 0,
    disadvantageCount: 0,
    critical: false,
    quantity: undefined
  };
}

export function unifiedRollDraftError(draft: UnifiedRollDraft): string | null {
  if ((draft.actor.kind === 'character' || draft.actor.kind === 'adversary' || draft.actor.kind === 'environment') && !draft.actor.id) return 'Персонаж броска не указан. Выберите действующее лицо явно.';
  if (draft.quantity) {
    const quantity = draft.quantity;
    if (quantity.value === null) return `Укажите: ${quantity.label}.`;
    if (!Number.isSafeInteger(quantity.value) || quantity.value < (quantity.min ?? 0) || quantity.value > (quantity.max ?? 100)) return `Некорректное количество: ${quantity.label}.`;
  }
  if (draft.branches?.length && !draft.branches.some((branch) => branch.id === draft.selectedBranchId)) return 'Выберите вариант броска.';
  if (!Number.isSafeInteger(draft.manualModifier)) return 'Доп. модификатор должен быть целым числом.';
  if ((draft.mode === 'action' || draft.mode === 'reaction') && draft.formula.replace(/\s+/g, '').toLowerCase() !== '2d12') return 'Для изменения базовых костей явно перейдите к ручному броску.';
  if (draft.mode === 'gmAttack' && draft.formula.replace(/\s+/g, '').toLowerCase() !== '1d20') return 'Для изменения базовой кости явно перейдите к ручному броску.';
  try {
    const terms = parseDiceFormula(draft.formula);
    if ((draft.mode === 'manual' || draft.mode === 'damage') && !terms.some((term) => term.kind === 'dice' && term.sign === 1 && term.count > 0)) return 'Нет костей для броска. Измените количество или добавьте кости.';
  } catch (error) { return error instanceof Error ? error.message : 'Некорректная формула.'; }
  return null;
}

export function setUnifiedRollQuantity(draft: UnifiedRollDraft, value: number | null): UnifiedRollDraft {
  if (!draft.quantity) return draft;
  const quantity = { ...draft.quantity, value };
  let formula = value === null ? '' : quantity.formulaTemplate.replaceAll('{count}', String(value));
  if (value !== null && quantity.flatPerCount) {
    const flat = value * quantity.flatPerCount;
    formula += flat < 0 ? String(flat) : `+${flat}`;
  }
  return { ...draft, quantity, formula };
}

export function selectUnifiedRollBranch(draft: UnifiedRollDraft, branchId: string): UnifiedRollDraft {
  const branch = draft.branches?.find((item) => item.id === branchId);
  if (!branch) return draft;
  const next = { ...draft, selectedBranchId: branch.id, formula: branch.formula, quantity: branch.quantity ? { ...branch.quantity } : undefined };
  return next.quantity ? setUnifiedRollQuantity(next, next.quantity.value) : next;
}

export type UnifiedRollDiceEdit = { requiresManual: boolean; draft: UnifiedRollDraft; proposedFormula: string };

/** Add/remove one ordinary die. Typed checks require an explicit manual conversion. */
export function editUnifiedRollDice(draft: UnifiedRollDraft, sides: number, delta: number): UnifiedRollDiceEdit {
  if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000 || !Number.isSafeInteger(delta)) throw new Error('Некорректное изменение костей.');
  const terms = parseDiceFormula(draft.formula);
  const index = terms.findIndex((term) => term.kind === 'dice' && term.sides === sides && term.sign === 1);
  if (index >= 0) {
    const term = terms[index];
    if (term.kind === 'dice') term.count = Math.max(0, term.count + delta);
  } else if (delta > 0) terms.push({ kind: 'dice', sign: 1, count: delta, sides });
  const proposedFormula = serializeFormulaTerms(terms);
  // Reuse the established parser's count limits before accepting edits.
  parseDiceFormula(proposedFormula);
  const requiresManual = isTypedUnifiedRoll(draft) && proposedFormula !== draft.formula;
  return { requiresManual, proposedFormula, draft: requiresManual ? draft : { ...draft, formula: proposedFormula, quantity: undefined } };
}

function serializeFormulaTerms(terms: ParsedFormulaTerm[]): string {
  const text = terms.filter((term) => term.kind !== 'dice' || term.count > 0)
    .map((term) => `${term.sign < 0 ? '-' : '+'}${term.kind === 'dice' ? `${term.count}d${term.sides}` : term.value}`).join('');
  return text.replace(/^\+/, '') || '0';
}
