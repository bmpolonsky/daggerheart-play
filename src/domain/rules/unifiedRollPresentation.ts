import { maxDiceValue, parseDiceFormula } from './diceFormula';
import { isTypedUnifiedRoll, type UnifiedRollDraft } from './unifiedRollDraft';
import { extraDiceFormula, extractTypedExtraDice } from './extraDice';

export function appendRollModifier(formula: string, modifier: number): string {
  return modifier === 0 ? formula : `${formula}${modifier > 0 ? '+' : ''}${modifier}`;
}

export function unifiedRollCompleteFormula(draft: UnifiedRollDraft, staticModifier = 0): string {
  const extras = isTypedUnifiedRoll(draft) ? extraDiceFormula(draft.extraDice) : '';
  let formula = appendRollModifier(`${draft.formula}${extras ? `+${extras}` : ''}`, draft.manualModifier + (isTypedUnifiedRoll(draft) ? staticModifier : 0));
  if (draft.mode === 'action' || draft.mode === 'reaction') {
    const net = draft.advantageCount - draft.disadvantageCount;
    if (net) formula += net > 0 ? '+1d6' : '-1d6';
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
  const terms = parseDiceFormula(formula);
  if (!isTypedUnifiedRoll(draft)) return { draft: { ...draft, formula, manualModifier: 0, quantity: undefined }, requiresManual: false };
  const net = draft.advantageCount - draft.disadvantageCount;
  const extracted = extractTypedExtraDice(formula, { base: draft.mode === 'gmAttack' ? '1d20' : '2d12', fixedModifier: staticModifier,
    ...((draft.mode === 'action' || draft.mode === 'reaction') && net ? { ordinaryDie: { sides: 6 as const, sign: net > 0 ? 1 as const : -1 as const } } : {}) });
  if (extracted.kind === 'manual-required') return { draft, requiresManual: true };
  if (extracted.kind === 'invalid') throw new Error(extracted.error);
  return { draft: { ...draft, manualModifier: extracted.manualModifier, extraDice: extracted.extraDice }, requiresManual: false };
}
