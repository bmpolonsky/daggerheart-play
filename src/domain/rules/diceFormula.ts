import type { DamageType, FormulaTermRoll } from './types';

export interface ParsedDiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
}

export interface ParsedFlatTerm {
  kind: 'flat';
  sign: 1 | -1;
  value: number;
}

export type ParsedFormulaTerm = ParsedDiceTerm | ParsedFlatTerm;

export interface FormulaRollResult {
  formula: string;
  terms: FormulaTermRoll[];
  total: number;
  criticalBonus: number;
}

export function parseDiceFormula(input: string): ParsedFormulaTerm[] {
  const normalized = input.replace(/\s+/g, '').toLowerCase();
  if (!normalized) {
    throw new Error('Формула пуста. Укажите, например, 1d8+2 или 2d6+1d4+3.');
  }

  const expression = /^[+-]/.test(normalized) ? normalized : `+${normalized}`;
  const matcher = /([+-])(?:(\d*)d(\d+)|(\d+))/g;
  const terms: ParsedFormulaTerm[] = [];
  let consumed = '';
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(expression))) {
    consumed += match[0];
    const sign = match[1] === '-' ? -1 : 1;
    if (match[3]) {
      const count = match[2] ? Number(match[2]) : 1;
      const sides = Number(match[3]);
      validateDice(count, sides);
      terms.push({ kind: 'dice', sign, count, sides });
      continue;
    }
    const value = Number(match[4]);
    if (!Number.isFinite(value)) {
      throw new Error(`Некорректное число в формуле: ${match[0]}`);
    }
    terms.push({ kind: 'flat', sign, value });
  }

  if (consumed !== expression || terms.length === 0) {
    throw new Error(`Некорректная формула броска: ${input}`);
  }

  return terms;
}

export function rollFormula(input: string, options?: { critical?: boolean; rng?: () => number }): FormulaRollResult {
  const rng = options?.rng ?? Math.random;
  const parsed = parseDiceFormula(input);
  const terms: FormulaTermRoll[] = parsed.map((term) => {
    if (term.kind === 'flat') {
      return {
        sign: term.sign,
        value: term.value,
        subtotal: term.sign * term.value
      };
    }

    const rolls = Array.from({ length: term.count }, () => rollDie(term.sides, rng));
    const unsignedSubtotal = rolls.reduce((sum, value) => sum + value, 0);
    return {
      sign: term.sign,
      count: term.count,
      sides: term.sides,
      rolls,
      subtotal: term.sign * unsignedSubtotal
    };
  });

  const baseTotal = terms.reduce((sum, term) => sum + term.subtotal, 0);
  const criticalBonus = options?.critical ? maxDiceValue(parsed) : 0;
  return {
    formula: input,
    terms,
    total: baseTotal + criticalBonus,
    criticalBonus
  };
}

export function maxDiceValue(terms: ParsedFormulaTerm[]): number {
  return terms.reduce((sum, term) => {
    if (term.kind !== 'dice') {
      return sum;
    }
    return sum + term.sign * term.count * term.sides;
  }, 0);
}

export function hasRolledDiceTerms(terms: FormulaTermRoll[]): boolean {
  return terms.some((term) => 'rolls' in term && term.count > 0 && term.rolls.length > 0);
}

export function scaleWeaponFormulaByProficiency(formula: string, proficiency: number): string {
  const safeProficiency = Math.max(0, Math.trunc(proficiency));
  const scaled = parseDiceFormula(formula).map((term) => {
    const sign = term.sign < 0 ? '-' : '+';
    if (term.kind === 'flat') {
      return `${sign}${term.value}`;
    }
    const count = term.count * safeProficiency;
    if (count <= 0) {
      return '';
    }
    return `${sign}${count}d${term.sides}`;
  });

  const joined = scaled.filter(Boolean).join('');
  return joined.startsWith('+') ? joined.slice(1) : joined || '0';
}

export function describeFormulaRoll(terms: FormulaTermRoll[]): string {
  return terms
    .map((term) => {
      const sign = term.sign < 0 ? '-' : '+';
      if ('rolls' in term) {
        return `${sign}${term.count}d${term.sides}[${term.rolls.join(',')}]`;
      }
      return `${sign}${term.value}`;
    })
    .join(' ')
    .replace(/^\+/, '')
    .trim();
}

export function rollDie(sides: number, rng = Math.random): number {
  if (!Number.isInteger(sides) || sides <= 0) {
    throw new Error(`Некорректное число граней кости: ${sides}`);
  }
  return Math.floor(rng() * sides) + 1;
}

export function normalizeDamageType(value: string): DamageType {
  if (value === 'physical' || value === 'magic' || value === 'direct' || value === 'mixed') {
    return value;
  }
  return 'physical';
}

function validateDice(count: number, sides: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 100) {
    throw new Error(`Некорректное количество костей: ${count}`);
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error(`Некорректное число граней кости: ${sides}`);
  }
}
