import type { DiceVisualTone, FormulaTermRoll, ManualDiceRollEntry } from '../../domain/rules/types';

export type PolyhedralDieSides = 4 | 6 | 8 | 10 | 12 | 20;

export type DiceTone = DiceVisualTone;

export interface PolyhedralDieVisual {
  id: string;
  sides: PolyhedralDieSides;
  value: number;
  label?: string;
  tone?: DiceTone;
}

export interface PolyhedralDiceRoll {
  id: string;
  dice: PolyhedralDieVisual[];
  total?: number;
  tone?: DiceTone;
  isCritical?: boolean;
}

export interface DiceRendererOptions {
  reducedMotion?: boolean;
  onComplete?: (rollId: string) => void;
}

export function polyhedralDiceRollFromTerms(input: {
  id: string;
  terms: FormulaTermRoll[];
  total?: number;
  tone?: DiceTone;
  diceTones?: DiceTone[];
  isCritical?: boolean;
}): PolyhedralDiceRoll {
  const dice: PolyhedralDieVisual[] = [];
  input.terms.forEach((term) => {
    if (!('rolls' in term) || !isPolyhedralDieSides(term.sides)) return;
    const sides = term.sides;
    term.rolls.forEach((value) => {
      dice.push({
        id: `${input.id}-die-${dice.length}`,
        sides,
        value,
        label: `${term.sign < 0 ? '-' : ''}D${sides}`,
        tone: input.diceTones?.[dice.length] ?? input.tone
      });
    });
  });
  return {
    id: input.id,
    dice,
    total: input.total,
    tone: input.tone,
    isCritical: input.isCritical
  };
}

export function manualDiceRollToPolyhedral(entry: ManualDiceRollEntry): PolyhedralDiceRoll {
  return polyhedralDiceRollFromTerms({
    id: entry.id,
    terms: entry.terms,
    total: entry.total,
    tone: 'neutral',
    diceTones: entry.diceTones
  });
}

export function isPolyhedralDieSides(sides: number): sides is PolyhedralDieSides {
  return sides === 4 || sides === 6 || sides === 8 || sides === 10 || sides === 12 || sides === 20;
}
