import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatKeptDiceValues } from '../../src/domain/rules/rollPresentation';

test('selection detail exposes every die including discarded and duplicate values', () => {
  const values = [2, 6, 1];
  assert.equal(formatKeptDiceValues(values, 6), 'Учтено +6; отброшено: 2, 1');
  assert.deepEqual(values, [2, 6, 1]);
  assert.equal(formatKeptDiceValues([4, 4], 4), 'Учтено +4; отброшено: 4');
  assert.equal(formatKeptDiceValues([1, 3, 5], -5), 'Учтено −5; отброшено: 1, 3');
});

test('selection detail preserves the recorded contribution instead of recomputing a result', () => {
  assert.equal(formatKeptDiceValues([2, 6], 0), '2, 6 → 0');
  assert.equal(formatKeptDiceValues([2, 6], 2), 'Учтено +2; отброшено: 6');
  assert.equal(formatKeptDiceValues([], 0), '');
});
