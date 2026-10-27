import { parseDiceFormula } from './diceFormula';

/** Existing manual engine uses d20 selection only for a lone positive d20 plus flats. */
export function manualAdvantageDiceSides(formula: string): 6 | 20 {
  const terms = formula.trim() ? parseDiceFormula(formula) : [];
  return terms.filter((term) => term.kind === 'dice' && term.sign === 1 && term.count === 1 && term.sides === 20).length === 1
    && terms.filter((term) => term.kind === 'dice' && !(term.sign === 1 && term.count === 1 && term.sides === 20)).length === 0 ? 20 : 6;
}

/** Remove the displayed selection pool, leaving independent additive dice untouched. */
export function stripReservedDice(formula: string, count: number, sides: number, sign: 1 | -1): string {
  const terms = parseDiceFormula(formula);
  let remaining = count;
  for (const term of terms) {
    if (term.kind !== 'dice' || term.sign !== sign || term.sides !== sides) continue;
    const consumed = Math.min(remaining, term.count);
    term.count -= consumed;
    remaining -= consumed;
  }
  if (remaining) throw new Error('Сохраните кости преимущества или помехи в формуле либо сначала сбросьте их.');
  return terms.filter((term) => term.kind === 'dice' ? term.count > 0 : term.value !== 0)
    .map((term) => `${term.sign < 0 ? '-' : '+'}${term.kind === 'dice' ? `${term.count}d${term.sides}` : term.value}`).join('').replace(/^\+/, '') || '0';
}

export interface ExtraDieTerm {
  count: number;
  sides: number;
}

export const EXTRA_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export const MAX_EXTRA_DICE_COUNT = 100;

/** Strict wire-safe positive pools; invalid entries are never clamped or dropped. */
export function normalizeExtraDice(input: unknown): ExtraDieTerm[] {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new Error('Дополнительные кости должны быть списком.');
  if (input.length > MAX_EXTRA_DICE_COUNT) throw new Error('Слишком много дополнительных костей: максимум 100.');
  let total = 0;
  const counts = new Map<number, number>();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !Object.prototype.hasOwnProperty.call(entry, 'count') || !Object.prototype.hasOwnProperty.call(entry, 'sides')
      || Object.keys(entry).some((key) => key !== 'count' && key !== 'sides')) throw new Error('Некорректные данные дополнительных костей.');
    const { count, sides } = entry as Record<string, unknown>;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > MAX_EXTRA_DICE_COUNT) throw new Error('Количество дополнительных костей должно быть целым числом от 1 до 100.');
    if (typeof sides !== 'number' || !EXTRA_DICE_SIDES.some((allowed) => allowed === sides)) throw new Error('Дополнительные кости: доступны только d4, d6, d8, d10, d12 и d20.');
    total += count;
    if (total > MAX_EXTRA_DICE_COUNT) throw new Error('Слишком много дополнительных костей: максимум 100.');
    counts.set(sides, (counts.get(sides) ?? 0) + count);
  }
  return [...counts].sort(([left], [right]) => left - right).map(([sides, count]) => ({ count, sides }));
}

export function isValidExtraDice(input: unknown): boolean {
  try { normalizeExtraDice(input); return true; } catch { return false; }
}

export function extraDiceFormula(input: unknown): string {
  return normalizeExtraDice(input).map(({ count, sides }) => `${count}d${sides}`).join('+');
}

export interface TypedExtraDiceContext {
  base: '2d12' | '1d20';
  /** Only the ordinary die actually displayed in the edited formula. */
  ordinaryDie?: { sides: 6 | 20; sign: 1 | -1; count?: number };
  /** Trait + selected experiences + attack bonus, excluding the manual modifier. */
  fixedModifier: number;
}

export type TypedExtraDiceExtraction =
  | { kind: 'typed'; extraDice: ExtraDieTerm[]; manualModifier: number }
  | { kind: 'manual-required'; reason: string }
  | { kind: 'invalid'; error: string };

/** Reserve typed identity first. Additive dice never become Hope/Fear or advantage. */
export function extractTypedExtraDice(formula: string, context: TypedExtraDiceContext): TypedExtraDiceExtraction {
  const invalid = (error: string): TypedExtraDiceExtraction => ({ kind: 'invalid', error });
  if (context.base !== '2d12' && context.base !== '1d20') return invalid('Неизвестная базовая формула проверки.');
  if (!Number.isSafeInteger(context.fixedModifier)) return invalid('Фиксированный модификатор должен быть целым числом.');
  if (context.ordinaryDie && (context.base === '1d20' || context.ordinaryDie.sides !== 6
    || (context.ordinaryDie.sign !== 1 && context.ordinaryDie.sign !== -1)
    || !Number.isSafeInteger(context.ordinaryDie.count ?? 1) || (context.ordinaryDie.count ?? 1) < 1 || (context.ordinaryDie.count ?? 1) > 20)) return invalid('Преимущество и помеха настраиваются отдельными элементами управления.');
  let terms: ReturnType<typeof parseDiceFormula>;
  try { terms = parseDiceFormula(formula); } catch (error) { return invalid(error instanceof Error ? error.message : 'Некорректная формула.'); }
  let flat = 0;
  const dice = new Map<string, { sign: 1 | -1; sides: number; count: number }>();
  for (const term of terms) {
    if (term.kind === 'flat') {
      if (!Number.isSafeInteger(term.value) || !Number.isSafeInteger(flat + term.sign * term.value)) return invalid('Модификатор должен быть безопасным целым числом.');
      flat += term.sign * term.value;
    } else if (term.count > 0) {
      const key = `${term.sign}:${term.sides}`;
      const previous = dice.get(key);
      dice.set(key, { sign: term.sign, sides: term.sides, count: (previous?.count ?? 0) + term.count });
    }
  }
  const baseSides = context.base === '2d12' ? 12 : 20;
  const baseCount = context.base === '2d12' ? 2 : 1;
  const base = dice.get(`1:${baseSides}`);
  if (!base || base.count < baseCount) return { kind: 'manual-required', reason: 'Изменены базовые кости проверки. Для этого нужен явный ручной бросок.' };
  base.count -= baseCount;
  if (context.ordinaryDie) {
    const ordinary = dice.get(`${context.ordinaryDie.sign}:${context.ordinaryDie.sides}`);
    const count = context.ordinaryDie.count ?? 1;
    if (!ordinary || ordinary.count < count) return invalid('Сохраните кости преимущества или помехи в формуле либо измените их отдельными элементами управления.');
    ordinary.count -= count;
  }
  if ([...dice.values()].some((term) => term.sign === -1 && term.count > 0)) return invalid('Дополнительные кости могут только прибавляться. Отрицательные кости требуют явного ручного броска.');
  let extraDice: ExtraDieTerm[];
  try { extraDice = normalizeExtraDice([...dice.values()].filter((term) => term.sign === 1 && term.count > 0).map(({ count, sides }) => ({ count, sides }))); }
  catch (error) { return invalid(error instanceof Error ? error.message : 'Некорректные дополнительные кости.'); }
  const manualModifier = flat - context.fixedModifier;
  if (!Number.isSafeInteger(manualModifier)) return invalid('Доп. модификатор должен быть безопасным целым числом.');
  return { kind: 'typed', extraDice, manualModifier };
}
