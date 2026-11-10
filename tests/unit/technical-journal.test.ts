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

function fakeStorage(raw: string | null = null) {
  return {
    value: raw,
    getItem() { return this.value; },
    setItem(_key: string, value: string) { this.value = value; },
    removeItem() { this.value = null; }
  };
}

describe('Tab-local journal recovery', () => {
  it('restores sanitized events on reload and clear removes the persisted copy', () => {
    const storage = fakeStorage();
    const first = new TechnicalJournal({ storage, now: () => 1000 });
    first.record(input);
    expect(first.survivesReload()).toBe(true);
    const restored = new TechnicalJournal({ storage, now: () => 1001 });
    expect(restored.read()).toEqual(first.read());
    restored.clear();
    expect(storage.value).toBeNull();
    expect(new TechnicalJournal({ storage, now: () => 1002 }).read()).toEqual([]);
  });
  it('strips arbitrary persisted fields and expires stale and future events', () => {
    const storage = fakeStorage(JSON.stringify([
      { ...input, at: 1000, message: 'secret@example.com', roomId: 'secret', level: 'secret' },
      { ...input, at: 800 }, { ...input, at: 2000 }, { ...input, at: 1000, operation: 'secret' }
    ]));
    const journal = new TechnicalJournal({ storage, ttlMs: 100, now: () => 1050 });
    expect(journal.read()).toEqual([{ ...input, at: 1000, level: 'info' }]);
    expect(storage.value).not.toContain('secret');
  });
  it('handles malformed, oversized and non-array saved data without breaking startup', () => {
    for (const raw of ['{broken', '{}', 'x'.repeat(2000)]) {
      const storage = fakeStorage(raw);
      expect(new TechnicalJournal({ storage, maxBytes: 1000 }).read()).toEqual([]);
      expect(storage.value).toBe('[]');
    }
  });
  it('reapplies event and byte limits when reading persisted data', () => {
    const storage = fakeStorage(JSON.stringify(Array.from({ length: 4 }, (_, index) => ({ ...input, at: 1000 + index }))));
    const journal = new TechnicalJournal({ storage, maxEvents: 2, maxBytes: 1000, now: () => 2000 });
    expect(journal.read().map(event => event.at)).toEqual([1002, 1003]);
    expect(new TextEncoder().encode(storage.value!).byteLength).toBeLessThanOrEqual(1000);
  });
  it('keeps working in memory when storage is blocked or full', () => {
    const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
    const journal = new TechnicalJournal({ storage, now: () => 1000 });
    journal.record(input);
    expect(journal.read()).toHaveLength(1);
    expect(journal.survivesReload()).toBe(false);
    expect(() => journal.clear()).not.toThrow();
    expect(journal.read()).toEqual([]);
  });
  it('removes stale stored snapshot after a failed save', () => {
    const storage = fakeStorage();
    const journal = new TechnicalJournal({ storage, now: () => 1000 });
    journal.record(input);
    storage.setItem = () => { throw new Error('quota'); };
    journal.record(input);
    expect(storage.value).toBeNull();
    expect(journal.read()).toHaveLength(2);
    expect(journal.survivesReload()).toBe(false);
  });
  it('prunes expired entries from storage when read', () => {
    let now = 1000;
    const storage = fakeStorage();
    const journal = new TechnicalJournal({ storage, now: () => now, ttlMs: 100 });
    journal.record(input); now = 1200;
    expect(journal.read()).toEqual([]);
    expect(storage.value).toBe('[]');
  });
});

it('does not claim reload retention when storage can write but cannot read', () => {
  const storage = { getItem() { throw new Error('read denied'); }, setItem() {}, removeItem() {} };
  const journal = new TechnicalJournal({ storage, now: () => 1000 });
  journal.record(input);
  expect(journal.survivesReload()).toBe(false);
  expect(journal.read()).toHaveLength(1);
});
it('rejects timestamps outside the JavaScript date range', () => {
  expect(sanitizeTechnicalJournalEntry({ ...input, at: 8.64e15 + 1 })).toBeNull();
});
