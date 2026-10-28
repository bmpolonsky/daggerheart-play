import { parseDiceFormula } from './diceFormula';

interface SelectionDraft { mode: string; formula: string; advantageCount: number; disadvantageCount: number }
interface SelectionPool { count: number; sides: 6 | 20; sign: 1 | -1; keep: 'kh1' | 'kl1' }

/** Display-only selection notation. Saved drafts and network payloads retain their existing shape. */
export function rollSelectionPool(draft: SelectionDraft): SelectionPool | null {
  const net = draft.advantageCount - draft.disadvantageCount;
  if (!net || draft.mode === 'damage' || !draft.formula.trim()) return null;
  let terms: ReturnType<typeof parseDiceFormula>;
  try { terms = parseDiceFormula(draft.formula); } catch { return null; }
  const singleD20 = draft.mode === 'gmAttack' || (draft.mode === 'manual' && terms.filter(term => term.kind === 'dice').length === 1
    && terms.some(term => term.kind === 'dice' && term.sign === 1 && term.count === 1 && term.sides === 20));
  return singleD20
    ? { count: Math.abs(net) + 1, sides: 20, sign: 1, keep: net > 0 ? 'kh1' : 'kl1' }
    : { count: Math.abs(net), sides: 6, sign: net > 0 ? 1 : -1, keep: 'kh1' };
}

export function selectionFormulaPresentation(legacyFormula: string, draft: SelectionDraft): string {
  const pool = rollSelectionPool(draft);
  if (!pool) return legacyFormula;
  const terms = parseDiceFormula(legacyFormula);
  const index = pool.sides === 6
    ? terms.reduce((found, term, index) => term.kind === 'dice' && term.sign === pool.sign && term.sides === 6 && term.count >= pool.count ? index : found, -1)
    : terms.findIndex(term => term.kind === 'dice' && term.sign === 1 && term.sides === 20 && term.count === 1);
  if (index < 0) return legacyFormula;
  return terms.map((term, position) => {
    const prefix = term.sign < 0 ? '-' : '+';
    if (term.kind === 'flat') return `${prefix}${term.value}`;
    if (position !== index) return `${prefix}${term.count}d${term.sides}`;
    if (pool.sides === 20) return `${prefix}${pool.count}d20${pool.keep}`;
    const remaining = term.count - pool.count;
    return `${remaining ? `${prefix}${remaining}d6` : ''}${prefix}${pool.count}d6kh1`;
  }).join('').replace(/^\+/, '');
}

/** Accept only the exact selection already controlled by this draft, never reinterpret additive dice. */
export function normalizeSelectionFormula(input: string, draft: SelectionDraft): string {
  const pool = rollSelectionPool(draft);
  let found = false;
  return input.replace(/\s+/g, '').toLowerCase().replace(/(^|[+-])(\d+)d(\d+)(kh1?|kl1?)(?=$|[+-])/g, (_term, prefix: string, count: string, sides: string, keep: string) => {
    const sign = prefix === '-' ? -1 : 1;
    if (found || !pool || Number(count) !== pool.count || Number(sides) !== pool.sides || sign !== pool.sign || `${keep.slice(0, 2)}1` !== pool.keep) {
      throw new Error('Выбор максимума или минимума связан с преимуществом и помехой. Измените их отдельными элементами управления.');
    }
    found = true;
    return `${prefix}${pool.sides === 20 ? 1 : pool.count}d${pool.sides}`;
  });
}
