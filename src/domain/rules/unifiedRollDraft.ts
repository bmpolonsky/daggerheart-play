import { normalizeSelectionFormula } from './selectionNotation';
import { createId } from '../../core/utils/id';
import { parseDiceFormula, type ParsedFormulaTerm } from './diceFormula';
import type { DamageType, TraitId } from './types';
import type { EventRollContext } from './eventRoll';
import { extraDiceFormula, manualAdvantageDiceSides, normalizeExtraDice, stripReservedDice, type ExtraDieTerm } from './extraDice';
import { normalizeAdvantageCounts } from './actionComposer';

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
  extraDice?: ExtraDieTerm[];
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
  /** Local editor provenance only; never part of a roll request or saved game. */
  origin?: 'free' | 'prepared';
}

export type UnifiedRollDraftInput = Pick<UnifiedRollDraft, 'actor' | 'mode' | 'title' | 'formula'> & Partial<Omit<UnifiedRollDraft, 'actor' | 'mode' | 'title' | 'formula'>>;

export function createUnifiedRollDraft(input: UnifiedRollDraftInput): UnifiedRollDraft {
  return {
    ...input,
    id: input.id ?? createId('roll-draft'),
    origin: input.origin ?? 'prepared',
    actor: { ...input.actor },
    ...(input.extraDice !== undefined ? { extraDice: normalizeExtraDice(input.extraDice) } : {}),
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

export interface UnifiedRollActorChangeOptions { trait?: TraitId | null }

/** Opening free Dice uses the explicitly selected acting actor, not a viewed sheet. */
export function freeUnifiedRollInput(actor: UnifiedRollActor, options: UnifiedRollActorChangeOptions = {}): UnifiedRollDraftInput {
  const character = actor.kind === 'character';
  const adversary = actor.kind === 'adversary';
  return {
    actor: { ...actor }, origin: 'free',
    mode: character ? 'action' : adversary ? 'gmAttack' : 'manual',
    title: character ? 'Проверка персонажа' : adversary ? 'Атака' : 'Кости',
    formula: character ? '2d12' : '1d20',
    trait: character ? options.trait ?? 'agility' : undefined
  };
}

/** A reset empties the pool, but cannot silently detach an event or refresh scope. */
export function resetUnifiedRollDraft(draft: UnifiedRollDraft): UnifiedRollDraft {
  return {
    ...draft, origin: 'free', mode: 'manual', formula: '', title: draft.eventContext ? draft.title : 'Кости',
    trait: undefined, difficulty: undefined, damageType: undefined, damage: undefined, notes: undefined,
    manualModifier: 0, extraDice: undefined, advantageCount: 0, disadvantageCount: 0,
    experienceIds: [], spendHopeForExperiences: true, critical: false, attackModifier: undefined,
    source: undefined, quantity: undefined, branches: undefined, selectedBranchId: undefined, hint: undefined
  };
}

/** Explicit actor changes preserve custom pools, but never a previous actor's costs or source binding. */
export function changeUnifiedRollActor(draft: UnifiedRollDraft, actor: UnifiedRollActor, options: UnifiedRollActorChangeOptions = {}): UnifiedRollDraft {
  if (draft.eventContext && (actor.kind !== 'character' || actor.id !== draft.eventContext.actorId)) throw new Error('Исполнитель связан с событием. Сначала отвяжите бросок.');
  if (actor.key === draft.actor.key) return { ...draft, actor: { ...actor } };
  const previousTyped = isTypedUnifiedRoll(draft);
  const freeDefault = draft.origin === 'free' && draft.mode === 'manual' && draft.formula.replace(/\s+/g, '').toLowerCase() === '1d20';
  const next = {
    ...draft, actor: { ...actor }, experienceIds: [], spendHopeForExperiences: true,
    source: undefined, damage: undefined, attackModifier: undefined, notes: undefined,
    quantity: undefined, branches: undefined, selectedBranchId: undefined, hint: undefined,
    trait: undefined, difficulty: undefined, critical: false
  };
  if (!previousTyped && !freeDefault) return next;
  const seed = freeUnifiedRollInput(actor, options);
  // The base check follows the explicit actor choice. User-added ordinary dice survive.
  const extras = normalizeExtraDice(draft.extraDice);
  const typed = seed.mode !== 'manual';
  return {
    ...next, mode: draft.mode === 'reaction' && actor.kind === 'character' ? 'reaction' : seed.mode,
    title: seed.title, formula: `${seed.formula}${!typed && extras.length ? `+${extraDiceFormula(extras)}` : ''}`,
    trait: seed.trait, extraDice: typed && extras.length ? extras : undefined,
    spendHopeForExperiences: typed
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
  completeFormula = normalizeSelectionFormula(completeFormula, draft);
  parseDiceFormula(completeFormula);
  const counts = normalizeAdvantageCounts(draft.advantageCount, draft.disadvantageCount);
  const net = counts.advantageCount - counts.disadvantageCount;
  const usesD6 = draft.mode === 'action' || draft.mode === 'reaction' || (draft.mode === 'manual' && manualAdvantageDiceSides(draft.formula) === 6);
  const formula = usesD6 && net ? stripReservedDice(completeFormula, Math.abs(net), 6, net > 0 ? 1 : -1) : completeFormula;
  const singleD20 = manualAdvantageDiceSides(formula) === 20;
  if (net && (draft.mode === 'action' || draft.mode === 'reaction') && singleD20) {
    throw new Error('Ручной одиночный d20 использует другое преимущество. Сначала сбросьте преимущество и помеху или сохраните проверку Дуальности.');
  }
  if (net && draft.mode === 'gmAttack' && !singleD20) {
    throw new Error('Этот ручной набор не сохранит выбор лучшего или худшего d20. Сначала сбросьте преимущество и помеху или сохраните атаку.');
  }
  assertUnifiedManualAdvantageFamily(draft, formula);
  return {
    ...draft,
    mode: 'manual',
    formula,
    trait: undefined,
    experienceIds: [],
    spendHopeForExperiences: false,
    manualModifier: 0,
    extraDice: undefined,
    advantageCount: counts.advantageCount,
    disadvantageCount: counts.disadvantageCount,
    critical: false,
    quantity: undefined
  };
}

/** Editing ordinary dice cannot silently change existing MAX-d6 into best/worst-d20. */
export function assertUnifiedManualAdvantageFamily(draft: UnifiedRollDraft, formula: string): void {
  const counts = normalizeAdvantageCounts(draft.advantageCount, draft.disadvantageCount);
  if (draft.mode === 'manual' && counts.advantageCount !== counts.disadvantageCount
    && manualAdvantageDiceSides(draft.formula) !== manualAdvantageDiceSides(formula)) {
    throw new Error('Меняется тип костей преимущества или помехи. Сначала сбросьте преимущество и помеху, затем измените набор.');
  }
}

export function unifiedRollDraftError(draft: UnifiedRollDraft): string | null {
  try {
    if (normalizeExtraDice(draft.extraDice).length && !isTypedUnifiedRoll(draft)) return 'Дополнительный пул применяется только к проверке. Для ручного броска укажите все кости в формуле.';
  } catch (error) { return error instanceof Error ? error.message : 'Некорректные дополнительные кости.'; }
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
  if (!draft.formula.trim()) return 'Добавьте кости в набор.';
  try {
    const terms = parseDiceFormula(draft.formula);
    const flat = terms.reduce((sum, term) => sum + (term.kind === 'flat' ? term.sign * term.value : 0), 0);
    if (!Number.isSafeInteger(flat)) return 'Модификатор должен быть безопасным целым числом.';
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

/** Add/remove an ordinary die; editing a typed base requires explicit conversion. */
export function editUnifiedRollDice(draft: UnifiedRollDraft, sides: number, delta: number, target?: 'base' | 'extra', sign: 1 | -1 = 1): UnifiedRollDiceEdit {
  if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000 || !Number.isSafeInteger(delta) || (sign !== 1 && sign !== -1)) throw new Error('Некорректное изменение костей.');
  if (target === 'extra' && sign !== 1) throw new Error('Отрицательная кость принадлежит ручному набору, а не дополнительному пулу проверки.');
  if (isTypedUnifiedRoll(draft) && target !== 'base' && sign === 1) {
    const extra = normalizeExtraDice(draft.extraDice);
    const existing = extra.find((term) => term.sides === sides);
    if (delta >= 0 || existing || target === 'extra') {
      const count = Math.max(0, (existing?.count ?? 0) + delta);
      const next = extra.filter((term) => term.sides !== sides);
      if (count > 0) next.push({ count, sides });
      const updated = { ...draft, extraDice: normalizeExtraDice(next) };
      return { requiresManual: false, draft: updated, proposedFormula: draft.formula };
    }
  }
  const terms = draft.formula.trim() ? parseDiceFormula(draft.formula) : [];
  const index = terms.findIndex((term) => term.kind === 'dice' && term.sides === sides && term.sign === sign);
  if (index >= 0) {
    const term = terms[index];
    if (term.kind === 'dice') term.count = Math.max(0, term.count + delta);
  } else if (delta > 0) terms.push({ kind: 'dice', sign, count: delta, sides });
  const serialized = serializeFormulaTerms(terms);
  const requiresManual = isTypedUnifiedRoll(draft) && serialized !== draft.formula;
  // A typed base removal still needs a nonempty explicit conversion proposal.
  const proposedFormula = requiresManual && !serialized ? '0' : serialized;
  // Reuse the established parser's count limits before accepting edits.
  if (proposedFormula) parseDiceFormula(proposedFormula);
  assertUnifiedManualAdvantageFamily(draft, proposedFormula);
  return { requiresManual, proposedFormula, draft: requiresManual ? draft : { ...draft, formula: proposedFormula, quantity: undefined } };
}

function serializeFormulaTerms(terms: ParsedFormulaTerm[]): string {
  const text = terms.filter((term) => term.kind === 'dice' ? term.count > 0 : term.value !== 0)
    .map((term) => `${term.sign < 0 ? '-' : '+'}${term.kind === 'dice' ? `${term.count}d${term.sides}` : term.value}`).join('');
  return text.replace(/^\+/, '');
}
