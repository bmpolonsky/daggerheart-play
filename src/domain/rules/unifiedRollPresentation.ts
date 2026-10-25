import { parseDiceFormula } from './diceFormula';
import { isTypedUnifiedRoll, type UnifiedRollDraft } from './unifiedRollDraft';

export function appendRollModifier(formula: string, modifier: number): string {
  return modifier === 0 ? formula : `${formula}${modifier > 0 ? '+' : ''}${modifier}`;
}

export function unifiedRollCompleteFormula(draft: UnifiedRollDraft, staticModifier = 0): string {
  let formula = appendRollModifier(draft.formula, draft.manualModifier + (isTypedUnifiedRoll(draft) ? staticModifier : 0));
  if (draft.mode === 'action' || draft.mode === 'reaction') {
    const net = draft.advantageCount - draft.disadvantageCount;
    if (net) formula += net > 0 ? '+1d6' : '-1d6';
  }
  return formula;
}

/** Preserve ordinary advantage/ disadvantage when an edited typed pool becomes manual. */
export function unifiedRollDiceConversionFormula(draft: UnifiedRollDraft, editedBaseFormula: string, staticModifier = 0): string {
  return unifiedRollCompleteFormula({ ...draft, formula: editedBaseFormula }, staticModifier);
}

/** Only an unchanged typed dice pool can be expressed as an ordinary flat edit. */
export function applyUnifiedFormulaEdit(draft: UnifiedRollDraft, formula: string, staticModifier = 0): { draft: UnifiedRollDraft; requiresManual: boolean } {
  const terms = parseDiceFormula(formula);
  if (!isTypedUnifiedRoll(draft)) return { draft: { ...draft, formula, manualModifier: 0, quantity: undefined }, requiresManual: false };
  const expected = parseDiceFormula(unifiedRollCompleteFormula(draft, staticModifier));
  const dice = (items: typeof terms) => items.filter((term) => term.kind === 'dice').map((term) => term.kind === 'dice' ? `${term.sign}:${term.count}:${term.sides}` : '').sort().join('|');
  if (dice(terms) !== dice(expected)) return { draft, requiresManual: true };
  const flat = terms.reduce((total, term) => total + (term.kind === 'flat' ? term.sign * term.value : 0), 0);
  if (!Number.isSafeInteger(flat - staticModifier)) throw new Error('Модификатор должен быть целым числом.');
  return { draft: { ...draft, manualModifier: flat - staticModifier }, requiresManual: false };
}
