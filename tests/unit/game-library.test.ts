import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { mergeGameLibrary } from '../../src/ui/lobby/gameLibrary';

describe('unified game library', () => {
  it('merges local-only, cloud-only and matching copies by world id', () => {
    const rows = mergeGameLibrary([
      { id: 'local-a', worldId: 'world-a', name: 'Альфа', updatedAt: '2026-01-02T00:00:00.000Z', active: true },
      { id: 'local-b', worldId: 'world-b', name: 'Бета', updatedAt: '2026-01-01T00:00:00.000Z', active: false }
    ], [
      { id: 'world-a', name: 'Альфа', updatedAt: Date.parse('2026-01-01T00:00:00.000Z') },
      { id: 'world-c', name: 'Гамма', updatedAt: Date.parse('2026-01-03T00:00:00.000Z') }
    ]);

    assert.deepEqual(rows.map((row) => [row.worldId, row.backupStatus]), [
      ['world-a', 'local-newer'],
      ['world-c', 'cloud'],
      ['world-b', 'local']
    ]);
  });

  it('marks a newer cloud copy and per-world failures', () => {
    const local = [{ id: 'local', worldId: 'world', name: 'Мир', updatedAt: '2026-01-01T00:00:00.000Z', active: false }];
    const cloud = [{ id: 'world', name: 'Мир', updatedAt: Date.parse('2026-01-02T00:00:00.000Z') }];
    assert.equal(mergeGameLibrary(local, cloud)[0]?.backupStatus, 'cloud-newer');
    assert.equal(mergeGameLibrary(local, cloud, new Set(['world']))[0]?.backupStatus, 'error');
  });

  it('keeps duplicate local records visible and attaches the cloud copy to the active one', () => {
    const rows = mergeGameLibrary([
      { id: 'local-a', worldId: 'world', name: 'Первая', updatedAt: '2026-01-01T00:00:00.000Z', active: false },
      { id: 'local-b', worldId: 'world', name: 'Вторая', updatedAt: '2026-01-02T00:00:00.000Z', active: true }
    ], [
      { id: 'world', name: 'Копия', updatedAt: Date.parse('2026-01-03T00:00:00.000Z') }
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.local?.id === 'local-b')?.cloud?.id, 'world');
    assert.equal(rows.find((row) => row.local?.id === 'local-a')?.cloud, null);
  });
});
