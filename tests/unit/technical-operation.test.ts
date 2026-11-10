import { beforeEach, expect, it } from 'vitest';
import { clearTechnicalJournal, getTechnicalJournal, observeTechnicalOperation } from '../../src/core/observability/technicalJournal';
import { technicalJournalOperationLabel, technicalJournalErrorLabel } from '../../src/domain/p2p/diagnosticReport';
beforeEach(clearTechnicalJournal);
it('records actual start and completion while preserving the result', async () => {
  let resolve!: (value: object) => void;
  const result = { secret: 'never log this' };
  const pending = observeTechnicalOperation({ area: 'startup', operation: 'initialize' }, () => new Promise<object>(done => { resolve = done; }));
  expect(getTechnicalJournal().map(event => event.phase)).toEqual(['running']);
  resolve(result);
  expect(await pending).toBe(result);
  expect(getTechnicalJournal().map(event => event.phase)).toEqual(['running', 'succeeded']);
  expect(JSON.stringify(getTechnicalJournal())).not.toContain('never log');
});
it('rethrows the exact error and stores only a fixed safe code', async () => {
  const error = new DOMException('private@example.com', 'NotAllowedError');
  await expect(observeTechnicalOperation({ area: 'media', operation: 'acquire' }, () => { throw error; })).rejects.toBe(error);
  expect(getTechnicalJournal().at(-1)).toMatchObject({ phase: 'failed', errorCode: 'media_denied' });
  expect(JSON.stringify(getTechnicalJournal())).not.toContain('private');
});
it('distinguishes cancellation from failure without recording error content', async () => {
  const error = new DOMException('secret', 'AbortError');
  await expect(observeTechnicalOperation({ area: 'startup', operation: 'initialize' }, () => Promise.reject(error))).rejects.toBe(error);
  expect(getTechnicalJournal().at(-1)).toMatchObject({ phase: 'cancelled', errorCode: 'cancelled' });
});
it('has readable fixed labels for every added journal domain', () => {
  const entries = [
    { area: 'startup', operation: 'initialize', expected: 'Запуск приложения' },
    { area: 'persistence', operation: 'read', expected: 'Чтение локальных данных' },
    { area: 'persistence', operation: 'write', expected: 'Сохранение локальных данных' },
    { area: 'import', operation: 'validate', expected: 'Проверка импорта' },
    { area: 'import', operation: 'apply', expected: 'Применение импорта' },
    { area: 'media', operation: 'acquire', expected: 'Запрос камеры и микрофона' },
    { area: 'media', operation: 'publish', expected: 'Передача медиапотока' }
  ] as const;
  for (const { expected, ...entry } of entries) expect(technicalJournalOperationLabel({ ...entry, at: 1, phase: 'running', level: 'info' })).toBe(expected);
  expect(technicalJournalErrorLabel('media_denied')).toBe('Доступ к устройствам не разрешён');
  expect(technicalJournalErrorLabel('network_error')).toBe('Сетевая ошибка');
});
