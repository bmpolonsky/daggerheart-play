import { normalizeSelectionFormula } from './selectionNotation';
import { maxDiceValue, parseDiceFormula } from './diceFormula';
import { assertUnifiedManualAdvantageFamily, isTypedUnifiedRoll, type UnifiedRollDraft } from './unifiedRollDraft';
import { extraDiceFormula, extractTypedExtraDice, manualAdvantageDiceSides, normalizeExtraDice, stripReservedDice } from './extraDice';
import { normalizeAdvantageCounts } from './actionComposer';

/** The one editable flat value: manual pools include their source's embedded flat. */
export function unifiedRollEditableModifier(draft: UnifiedRollDraft): number {
  try {
    const embedded = isTypedUnifiedRoll(draft) ? 0 : formulaFlat(draft.formula);
    return embedded + draft.manualModifier;
  } catch { return draft.manualModifier; } // The draft validator reports an invalid source formula.
}

/** Keep bound/source formulas intact; only the explicit adjustment changes. */
export function setUnifiedRollEditableModifier(draft: UnifiedRollDraft, value: number): UnifiedRollDraft {
  if (!Number.isSafeInteger(value)) throw new Error('Модификатор должен быть целым числом.');
  const embedded = isTypedUnifiedRoll(draft) ? 0 : formulaFlat(draft.formula);
  const manualModifier = value - embedded;
  if (!Number.isSafeInteger(manualModifier)) throw new Error('Модификатор слишком велик.');
  return { ...draft, manualModifier };
}

function formulaFlat(formula: string): number {
  if (!formula.trim()) return 0;
  const flat = parseDiceFormula(formula).reduce((sum, term) => sum + (term.kind === 'flat' ? term.sign * term.value : 0), 0);
  if (!Number.isSafeInteger(flat)) throw new Error('Модификатор должен быть безопасным целым числом.');
  return flat;
}

export function appendRollModifier(formula: string, modifier: number): string {
  let flat = modifier;
  try {
    const terms = formula.trim() ? parseDiceFormula(formula) : [];
    const dice: string[] = [];
    for (const term of terms) {
      if (term.kind === 'flat') flat += term.sign * term.value;
      else if (term.count > 0) dice.push(`${term.sign < 0 ? '-' : '+'}${term.count}d${term.sides}`);
    }
    if (!Number.isSafeInteger(flat)) throw new Error('Модификатор слишком велик.');
    if (flat !== 0) dice.push(`${flat < 0 ? '-' : '+'}${Math.abs(flat)}`);
    return dice.join('').replace(/^\+/, '');
  } catch {
    // Preserve invalid text for the validator rather than inventing a usable pool.
    return modifier === 0 ? formula : `${formula}${modifier > 0 ? '+' : ''}${modifier}`;
  }
}

/** Payload formula excludes separately evaluated traits, experiences and advantage. */
export function unifiedRollExecutionFormula(draft: UnifiedRollDraft): string {
  return appendRollModifier(draft.formula, draft.manualModifier);
}

export function unifiedRollCompleteFormula(draft: UnifiedRollDraft, staticModifier = 0): string {
  const extras = isTypedUnifiedRoll(draft) ? extraDiceFormula(draft.extraDice) : '';
  let formula = appendRollModifier(`${draft.formula}${extras ? `+${extras}` : ''}`, draft.manualModifier + (isTypedUnifiedRoll(draft) ? staticModifier : 0));
  if (draft.mode === 'action' || draft.mode === 'reaction' || (draft.mode === 'manual' && manualAdvantageDiceSides(draft.formula) === 6)) {
    const net = draft.advantageCount - draft.disadvantageCount;
    if (net) formula += `${net > 0 ? '+' : '-'}${Math.abs(net)}d6`;
  }
  return formula;
}

/** Damage keeps an editable base; critical maximum is a presentation-only term. */
export function unifiedRollFormulaPresentation(draft: UnifiedRollDraft, staticModifier = 0): { baseFormula: string; effectiveFormula: string; criticalBonus: number } {
  const baseFormula = unifiedRollCompleteFormula(draft, staticModifier);
  let criticalBonus = 0;
  if (draft.mode === 'damage' && draft.critical) {
    try { criticalBonus = maxDiceValue(parseDiceFormula(baseFormula)); } catch { /* The draft validator blocks incomplete formulas. */ }
  }
  return { baseFormula, effectiveFormula: appendRollModifier(baseFormula, criticalBonus), criticalBonus };
}

/** Preserve ordinary advantage/ disadvantage when an edited typed pool becomes manual. */
export function unifiedRollDiceConversionFormula(draft: UnifiedRollDraft, editedBaseFormula: string, staticModifier = 0): string {
  return unifiedRollCompleteFormula({ ...draft, formula: editedBaseFormula }, staticModifier);
}

/** Only an unchanged typed dice pool can be expressed as an ordinary flat edit. */
export function applyUnifiedFormulaEdit(draft: UnifiedRollDraft, formula: string, staticModifier = 0): { draft: UnifiedRollDraft; requiresManual: boolean } {
  formula = normalizeSelectionFormula(formula, draft);
  parseDiceFormula(formula);
  formulaFlat(formula);
  const net = draft.advantageCount - draft.disadvantageCount;
  if (!isTypedUnifiedRoll(draft)) {
    const base = draft.mode === 'manual' && net && manualAdvantageDiceSides(draft.formula) === 6
      ? stripReservedDice(formula, Math.abs(net), 6, net > 0 ? 1 : -1) : formula;
    assertUnifiedManualAdvantageFamily(draft, base);
    return { draft: { ...draft, formula: base, manualModifier: 0, quantity: undefined }, requiresManual: false };
  }
  const extracted = extractTypedExtraDice(formula, { base: draft.mode === 'gmAttack' ? '1d20' : '2d12', fixedModifier: staticModifier,
    ...((draft.mode === 'action' || draft.mode === 'reaction') && net ? { ordinaryDie: { sides: 6 as const, sign: net > 0 ? 1 as const : -1 as const, count: Math.abs(net) } } : {}) });
  if (extracted.kind === 'manual-required') return { draft, requiresManual: true };
  if (extracted.kind === 'invalid') throw new Error(extracted.error);
  return { draft: { ...draft, manualModifier: extracted.manualModifier, extraDice: extracted.extraDice }, requiresManual: false };
}

export interface UnifiedRollPoolChip {
  id: string;
  kind: 'die' | 'hope' | 'fear' | 'advantage' | 'disadvantage';
  sides: number;
  count: number;
  sign: 1 | -1;
  target: 'base' | 'extra' | 'advantage' | 'disadvantage';
}

export interface UnifiedRollPoolPresentation {
  chips: UnifiedRollPoolChip[];
  rolledDiceCount: number;
  evaluationHint: string | null;
}

/** Mirrors existing execution, including selection dice which are not additive terms. */
export function unifiedRollPoolPresentation(draft: UnifiedRollDraft): UnifiedRollPoolPresentation {
  let terms: ReturnType<typeof parseDiceFormula> = [];
  try { terms = draft.formula.trim() ? parseDiceFormula(draft.formula) : []; } catch { /* Invalid editor text has no invented pool. */ }
  const chips: UnifiedRollPoolChip[] = terms.flatMap<UnifiedRollPoolChip>((term, index) => {
    if (term.kind !== 'dice' || term.count <= 0) return [];
    if ((draft.mode === 'action' || draft.mode === 'reaction') && term.sign === 1 && term.count === 2 && term.sides === 12) {
      return [
        { id: `${index}:hope`, kind: 'hope' as const, sides: 12, count: 1, sign: 1 as const, target: 'base' as const },
        { id: `${index}:fear`, kind: 'fear' as const, sides: 12, count: 1, sign: 1 as const, target: 'base' as const }
      ];
    }
    return [{ id: `base:${index}`, kind: 'die' as const, sides: term.sides, count: term.count, sign: term.sign, target: 'base' as const }];
  });
  if (isTypedUnifiedRoll(draft)) {
    for (const term of normalizeExtraDice(draft.extraDice)) chips.push({ id: `extra:${term.sides}`, kind: 'die', ...term, sign: 1, target: 'extra' });
  }
  const counts = normalizeAdvantageCounts(draft.advantageCount, draft.disadvantageCount);
  const net = counts.advantageCount - counts.disadvantageCount;
  let evaluationHint: string | null = null;
  if (net !== 0 && draft.mode !== 'damage' && terms.some((term) => term.kind === 'dice' && term.count > 0)) {
    // Use the same single-d20 predicate as DiceService.rollManualDiceFormula.
    const singleD20 = draft.mode === 'gmAttack' || (draft.mode === 'manual'
      && terms.filter((term) => term.kind === 'dice' && term.sign > 0 && term.count === 1 && term.sides === 20).length === 1
      && terms.filter((term) => term.kind === 'dice' && !(term.sign > 0 && term.count === 1 && term.sides === 20)).length === 0);
    const sides = singleD20 ? 20 : 6;
    const count = Math.abs(net);
    const kind = net > 0 ? 'advantage' as const : 'disadvantage' as const;
    chips.push({ id: kind, kind, sides, count, sign: singleD20 || net > 0 ? 1 : -1, target: kind });
    if (singleD20) evaluationHint = net > 0 ? 'Из d20 берётся наибольший результат.' : 'Из d20 берётся наименьший результат.';
    else if (count > 1) evaluationHint = `Из ${count}d6 ${net > 0 ? 'прибавляется' : 'вычитается'} наибольший результат.`;
  }
  return { chips, rolledDiceCount: chips.reduce((sum, chip) => sum + chip.count, 0), evaluationHint };
}
