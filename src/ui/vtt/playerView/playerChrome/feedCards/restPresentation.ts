import { restMoveOperation, restProgress } from '../../../../../domain/rules/rest';
import type { RestFeedChoice, RestFeedRequest } from '../../../../../domain/rules/types';

/** Display recorded effects, never infer an application from a closed event. */
export function restChoiceSummary(choice: RestFeedChoice, isClosed: boolean): string {
  if (choice.status !== 'resolved' || !choice.result) {
    if (choice.status === 'resolved') return 'Результат не записан.';
    if (isClosed) return 'Не применено: отдых завершён.';
    const operation = restMoveOperation(choice.label);
    return ['rollHp', 'rollStress', 'rollArmor'].includes(operation) ? 'Нужно бросить кости.' : 'Нужно применить ход.';
  }
  const result = choice.result;
  const operation = restMoveOperation(choice.label);
  const labels: Partial<Record<typeof operation, string>> = {
    rollHp: 'Исцелено ран', clearHp: 'Исцелено ран',
    rollStress: 'Снято Стресса', clearStress: 'Снято Стресса',
    rollArmor: 'Восстановлено ячеек брони', clearArmor: 'Восстановлено ячеек брони',
    prepare: 'Получено Надежды'
  };
  // Unknown/manual results retain their full note, including error/context text.
  const recordedNote = result.note.replace(/^Ручной итог мастера\. /, '');
  const standardRecoveryNote = /^(Исцелено ран|Очищено стресса|Починено брони|Получено Надежды|Очищены все раны|Очищен весь стресс|Починена вся броня): \d+\.$/.test(recordedNote);
  const effect = labels[operation] && result.appliedAmount !== undefined && standardRecoveryNote
    ? `${labels[operation]}: ${result.appliedAmount}.`
    : recordedNote;
  const manual = result.note.startsWith('Ручной итог мастера.') ? 'Ручной итог мастера. ' : '';
  const roll = result.formula && result.total !== undefined ? `Бросок: ${result.formula} = ${result.total}. ` : '';
  return `${manual}${roll}${effect}`;
}

export function restOutstandingSummary(rest: RestFeedRequest): string {
  const progress = restProgress(rest);
  const closed = rest.status === 'resolved' || rest.status === 'cancelled';
  return progress.unfinished.map((participant) => {
    const parts: string[] = [];
    if (participant.unselectedCount) parts.push(`не выбрано ходов: ${participant.unselectedCount}`);
    if (participant.pendingCount) parts.push(`${closed ? 'не применено' : 'ожидают применения'}: ${participant.pendingCount}`);
    return `${participant.actorName} — ${parts.join('; ')}.`;
  }).join(' ');
}
