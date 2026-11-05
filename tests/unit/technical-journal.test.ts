import { describe, expect, it } from 'vitest';
import { TechnicalJournal, sanitizeTechnicalJournalEntry } from '../../src/core/observability/technicalJournal';

const input = { area: 'network', operation: 'auth-session', phase: 'running' } as const;
describe('Memory-only technical journal', () => {
  it('bounds count and prunes oldest events', () => {
    let now = 1000;
    const journal = new TechnicalJournal({ maxEvents: 2, now: () => now++ });
    journal.record(input); journal.record(input); journal.record(input);
    expect(journal.read().map(event => event.at)).toEqual([1001, 1002]);
  });
  it('bounds UTF-8 bytes including JSON array overhead', () => {
    const journal = new TechnicalJournal({ maxBytes: 120, now: () => 1000 });
    for (let i = 0; i < 10; i++) journal.record(input);
    const bytes = new TextEncoder().encode(JSON.stringify(journal.read())).byteLength;
    expect(bytes).toBeLessThanOrEqual(120);
    expect(journal.read()).toHaveLength(1);
  });
  it('prunes TTL on reads and writes', () => {
    let now = 1000;
    const journal = new TechnicalJournal({ ttlMs: 100, now: () => now });
    journal.record(input); now = 1100;
    expect(journal.read()).toEqual([]);
    journal.record(input); now = 1200; journal.record(input);
    expect(journal.read().map(event => event.at)).toEqual([1200]);
  });
  it('drops arbitrary fields, invalid operations, errors and unsafe numeric values', () => {
    const safe = sanitizeTechnicalJournalEntry({ ...input, at: 1000, roomId: 'SECRET', message: 'SECRET', errorCode: 'SECRET', durationMs: Infinity });
    expect(safe).toEqual({ ...input, at: 1000, level: 'info' });
    expect(sanitizeTechnicalJournalEntry({ ...input, at: 1000, operation: 'SECRET' })).toBeNull();
    expect(sanitizeTechnicalJournalEntry({ ...input, at: 1000, area: '__proto__' })).toBeNull();
    expect(sanitizeTechnicalJournalEntry({ ...input, at: NaN })).toBeNull();
  });
  it('returns copies and can clear without persistent storage', () => {
    const journal = new TechnicalJournal({ now: () => 1000 });
    journal.record(input);
    journal.read()[0].at = 9999;
    expect(journal.read()[0].at).toBe(1000);
    journal.clear(); expect(journal.read()).toEqual([]);
  });
});

it('correlates only valid local attempts and infers severity rather than trusting input', () => {
  expect(sanitizeTechnicalJournalEntry({ ...input, at: 1, attempt: 42, level: 'secret' })).toMatchObject({ attempt: 42, level: 'info' });
  expect(sanitizeTechnicalJournalEntry({ ...input, at: 1, attempt: 'real-room-id', phase: 'failed' })).toEqual({ ...input, at: 1, phase: 'failed', level: 'error' });
});
