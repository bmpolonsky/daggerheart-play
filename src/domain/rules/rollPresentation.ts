import type { ActionRollOutcome, RollLogEntry } from './types';

type ActionRollLike = Pick<Extract<RollLogEntry, { type: 'action' }>, 'fearDie' | 'hopeDie' | 'isCritical' | 'total'>;

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
