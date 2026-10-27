import { test } from 'vitest';
import assert from 'node:assert/strict';
import { formatKeptDiceValues } from '../../src/domain/rules/rollPresentation';

test('selection detail exposes every die including discarded and duplicate values', () => {
  const values = [2, 6, 1];
  assert.equal(formatKeptDiceValues(values, 6), '2, 6, 1 → +6 (максимум)');
  assert.deepEqual(values, [2, 6, 1]);
  assert.equal(formatKeptDiceValues([4, 4], 4), '4, 4 → +4 (максимум)');
  assert.equal(formatKeptDiceValues([1, 3, 5], -5), '1, 3, 5 → −5 (максимум)');
});

test('selection detail preserves the recorded contribution instead of recomputing a result', () => {
  assert.equal(formatKeptDiceValues([2, 6], 0), '2, 6 → 0');
  assert.equal(formatKeptDiceValues([2, 6], 2), '2, 6 → +2');
  assert.equal(formatKeptDiceValues([], 0), '');
});
