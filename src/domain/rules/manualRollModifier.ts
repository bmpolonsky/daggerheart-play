import { normalizeAdvantageCounts } from './actionComposer';

export function parseManualRollModifier(input: string): { valid: boolean; value: number } {
  const text = input.trim().replace(/^−/, '-');
  if (!text) return { valid: true, value: 0 };
  if (!/^[+-]?\d+$/.test(text)) return { valid: false, value: 0 };
  const value = Number(text);
  return Number.isSafeInteger(value) ? { valid: true, value } : { valid: false, value: 0 };
}

/** Mirrors the existing action/reaction terms without executing or charging. */
export function actionRollFormulaPreview(input: {
  traitModifier: number;
  experienceModifier: number;
  manualModifier: number;
  advantageCount: number;
  disadvantageCount: number;
}): string {
  const parts = ['2d12'];
  for (const value of [input.traitModifier, input.experienceModifier, input.manualModifier]) {
    if (value !== 0) parts.push(`${value < 0 ? '−' : '+'} ${Math.abs(value)}`);
  }
  const counts = normalizeAdvantageCounts(input.advantageCount, input.disadvantageCount);
  const net = counts.advantageCount - counts.disadvantageCount;
  if (net !== 0) parts.push(`${net < 0 ? '−' : '+'} ${Math.abs(net) > 1 ? Math.abs(net) : ''}d6`);
  return parts.join(' ');
}
