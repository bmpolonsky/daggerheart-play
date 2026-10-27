import type { ActionRollOutcome, RollLogEntry } from './types';

type ActionRollLike = Pick<Extract<RollLogEntry, { type: 'action' }>, 'fearDie' | 'hopeDie' | 'isCritical' | 'total'>;

/** Explain recorded selection dice without changing their stored contribution. */
export function formatKeptDiceValues(rolls: readonly number[], kept: number): string {
  if (rolls.length === 0) return '';
  const signed = kept > 0 ? `+${kept}` : kept < 0 ? `−${Math.abs(kept)}` : '0';
  const selection = kept !== 0 && Math.abs(kept) === Math.max(...rolls) ? ' (максимум)' : '';
  return `${rolls.join(', ')} → ${signed}${selection}`;
}

export function formatDualityResult(roll: ActionRollLike): string {
  if (roll.isCritical) {
    return `${roll.total} критически`;
  }
  return `${roll.total} ${roll.hopeDie >= roll.fearDie ? 'с Надеждой' : 'со Страхом'}`;
}

export function formatDualityBreakdown(roll: ActionRollLike & Partial<Pick<Extract<RollLogEntry, { type: 'action' }>, 'difficulty'>>): string {
  const difficulty = typeof roll.difficulty === 'number' && roll.difficulty > 0 ? ` / Сложность ${roll.difficulty}` : '';
  return `Надежда ${roll.hopeDie} / Страх ${roll.fearDie}${difficulty}`;
}

export function actionOutcomeLabel(outcome: ActionRollOutcome): string {
  const labels: Record<ActionRollOutcome, string> = {
    criticalSuccess: 'Критический успех',
    successWithHope: 'Успех с Надеждой',
    successWithFear: 'Успех со Страхом',
    failureWithHope: 'Провал с Надеждой',
    failureWithFear: 'Провал со Страхом'
  };
  return labels[outcome];
}
