import { test } from 'vitest';
import assert from 'node:assert/strict';
import { restChoiceSummary, restOutstandingSummary } from '../../src/ui/vtt/playerView/playerChrome/feedCards/restPresentation';
import type { RestFeedChoice, RestFeedRequest } from '../../src/domain/rules/types';

const choice: RestFeedChoice = { id: 'heal', label: 'Залечить Раны', count: 1, status: 'resolved', result: { formula: '1d4+2', total: 6, appliedAmount: 1, note: 'Исцелено ран: 1.' } };

test('rest text distinguishes recovery roll from actual effect, including zero and manual totals', () => {
  assert.equal(restChoiceSummary(choice, false), 'Бросок: 1d4+2 = 6. Исцелено ран: 1.');
  assert.equal(restChoiceSummary({ ...choice, result: { ...choice.result!, appliedAmount: 0 } }, true), 'Бросок: 1d4+2 = 6. Исцелено ран: 0.');
  assert.match(restChoiceSummary({ ...choice, result: { ...choice.result!, note: 'Ручной итог мастера. Исцелено ран: 1.' } }, true), /^Ручной итог мастера\. Бросок:/);
  assert.equal(restChoiceSummary({ ...choice, label: 'Залечить все Раны', result: { appliedAmount: 1, note: 'Очищены все раны: 1.' } }, true), 'Исцелено ран: 1.');
});

test('missing, pending and manual results are explicit and never inferred from completion', () => {
  assert.equal(restChoiceSummary({ ...choice, result: undefined }, true), 'Результат не записан.');
  assert.equal(restChoiceSummary({ ...choice, status: 'selected', result: undefined }, true), 'Не применено: отдых завершён.');
  assert.equal(restChoiceSummary({ ...choice, status: 'selected', result: undefined }, false), 'Нужно бросить кости.');
  assert.equal(restChoiceSummary({ ...choice, result: { appliedAmount: 0, note: 'Ошибка: персонаж недоступен.' } }, true), 'Ошибка: персонаж недоступен.');
  assert.equal(restChoiceSummary({ ...choice, label: 'Работа над проектом', result: { note: 'Обсудите прогресс с мастером.' } }, true), 'Обсудите прогресс с мастером.');
});

test('unfinished selection and application are explained separately, including repeated moves', () => {
  const rest = { status: 'collecting', maxChoicesPerParticipant: 3, participants: [{ actorId: 'pc', actorName: 'Герой', ready: false, choices: [{ ...choice, count: 2, status: 'selected', result: undefined }] }] } as RestFeedRequest;
  assert.equal(restOutstandingSummary(rest), 'Герой — не выбрано ходов: 1; ожидают применения: 2.');
  assert.equal(restOutstandingSummary({ ...rest, status: 'resolved' }), 'Герой — не выбрано ходов: 1; не применено: 2.');
});
