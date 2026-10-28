import { test, expect } from 'vitest';
import { builderTraitValue } from '../../src/ui/characters/builder/formatting';

test('an empty starting slot stays empty even when a projected or ancestry value is present', () => {
  expect(builderTraitValue(undefined, 1)).toBe('Нет значения');
  expect(builderTraitValue(undefined, 0, 1)).toBe('Нет значения');
  expect(builderTraitValue(0, 1)).toBe('+1');
  expect(builderTraitValue(-1, 0, 1)).toBe('+1');
  expect(builderTraitValue(2, 3)).toBe('+3');
});
