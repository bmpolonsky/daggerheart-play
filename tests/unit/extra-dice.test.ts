import { test } from 'vitest';
import assert from 'node:assert/strict';
import { extraDiceFormula, extractTypedExtraDice, isValidExtraDice, normalizeExtraDice } from '../../src/domain/rules/extraDice';

test('extra pool normalizes optional absence and merges/sorts without mutating input', () => {
  const input = [{ count: 1, sides: 12 }, { count: 2, sides: 6 }, { count: 3, sides: 12 }];
  const before = JSON.stringify(input);
  assert.deepEqual(normalizeExtraDice(undefined), []);
  assert.deepEqual(normalizeExtraDice([]), []);
  assert.deepEqual(normalizeExtraDice(input), [{ count: 2, sides: 6 }, { count: 4, sides: 12 }]);
  assert.equal(JSON.stringify(input), before);
  assert.equal(extraDiceFormula(input), '2d6+4d12');
  assert.equal(extraDiceFormula([]), '');
});

test('extra pool supports only the engine and 3D model sides', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) assert.equal(isValidExtraDice([{ count: 1, sides }]), true);
  for (const sides of [2, 3, 7, 100, 1000, 6.5, NaN, Infinity, '6']) assert.equal(isValidExtraDice([{ count: 1, sides }]), false);
});

test('invalid counts are rejected without rounding, dropping or coercion', () => {
  for (const count of [0, -1, 1.5, 101, NaN, Infinity, '2', null]) {
    const input = [{ count, sides: 6 }];
    assert.equal(isValidExtraDice(input), false);
    assert.throws(() => normalizeExtraDice(input));
  }
});

test('extra pool total is strictly bounded across terms and duplicate groups', () => {
  assert.deepEqual(normalizeExtraDice([{ count: 60, sides: 6 }, { count: 40, sides: 6 }]), [{ count: 100, sides: 6 }]);
  assert.equal(isValidExtraDice([{ count: 60, sides: 6 }, { count: 41, sides: 8 }]), false);
  assert.equal(isValidExtraDice([{ count: 60, sides: 6 }, { count: 41, sides: 6 }]), false);
  assert.equal(isValidExtraDice(Array.from({ length: 101 }, () => ({ count: 1, sides: 4 }))), false);
});

test('strict payload refuses non-arrays, unknown fields and inherited field guesses', () => {
  for (const input of [null, false, '1d6', {}, [null], [[]], [{ count: 1 }], [{ sides: 6 }], [{ count: 1, sides: 6, formula: '1d20' }], [Object.create({ count: 1, sides: 6 })]]) {
    assert.equal(isValidExtraDice(input), false);
  }
});

test('typed action reserves the Hope/Fear pair and returns additive pool plus independent flat modifier', () => {
  assert.deepEqual(extractTypedExtraDice('1d12+1d8+1d12+2d6+7-2', { base: '2d12', fixedModifier: 3 }), {
    kind: 'typed', extraDice: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], manualModifier: 2
  });
  assert.deepEqual(extractTypedExtraDice('3d12+4', { base: '2d12', fixedModifier: 4 }), {
    kind: 'typed', extraDice: [{ count: 1, sides: 12 }], manualModifier: 0
  });
});

test('same-sided ordinary advantage is reserved once and cannot swallow additive d6 dice', () => {
  assert.deepEqual(extractTypedExtraDice('2d12+2d6+5', { base: '2d12', ordinaryDie: { sides: 6, sign: 1 }, fixedModifier: 2 }), {
    kind: 'typed', extraDice: [{ count: 1, sides: 6 }], manualModifier: 3
  });
});

test('ordinary disadvantage is reserved without converting an independent positive d6 into advantage', () => {
  assert.deepEqual(extractTypedExtraDice('2d12-1d6+1d6+1d8-2', { base: '2d12', ordinaryDie: { sides: 6, sign: -1 }, fixedModifier: 0 }), {
    kind: 'typed', extraDice: [{ count: 1, sides: 6 }, { count: 1, sides: 8 }], manualModifier: -2
  });
});

test('removing reserved base requires explicit conversion, while removing ordinary die is an invalid edit', () => {
  assert.equal(extractTypedExtraDice('1d12+1d6', { base: '2d12', fixedModifier: 0 }).kind, 'manual-required');
  assert.equal(extractTypedExtraDice('1d8+4', { base: '1d20', fixedModifier: 0 }).kind, 'manual-required');
  const missingOrdinary = extractTypedExtraDice('2d12+1d8', { base: '2d12', ordinaryDie: { sides: 6, sign: 1 }, fixedModifier: 0 });
  assert.equal(missingOrdinary.kind, 'invalid');
  if (missingOrdinary.kind === 'invalid') assert.match(missingOrdinary.error, /отдельными элементами управления/);
});

test('leftover negative dice cannot be accepted as positive typed additions', () => {
  for (const formula of ['2d12-1d8', '2d12+1d12-1d12']) {
    assert.equal(extractTypedExtraDice(formula, { base: '2d12', fixedModifier: 0 }).kind, 'invalid');
  }
  assert.equal(extractTypedExtraDice('2d12-2d6', { base: '2d12', ordinaryDie: { sides: 6, sign: -1 }, fixedModifier: 0 }).kind, 'invalid');
});

test('NPC attack reserves one base d20 and treats another as additive, never as the procedural keep die', () => {
  assert.deepEqual(extractTypedExtraDice('2d20+1d4+3', { base: '1d20', fixedModifier: 3 }), {
    kind: 'typed', extraDice: [{ count: 1, sides: 4 }, { count: 1, sides: 20 }], manualModifier: 0
  });
  assert.equal(extractTypedExtraDice('2d20', { base: '1d20', ordinaryDie: { sides: 20, sign: 1 }, fixedModifier: 0 }).kind, 'invalid');
});

test('syntax, unsupported extra sides, oversized extra pool and unsafe flat math fail explicitly', () => {
  for (const formula of ['2d12+max(1d6,1d8)', '2d12+1d100', '2d12+100d6+1d8', '2d12+9007199254740992']) {
    assert.equal(extractTypedExtraDice(formula, { base: '2d12', fixedModifier: 0 }).kind, 'invalid');
  }
  assert.equal(extractTypedExtraDice('2d12+9007199254740991', { base: '2d12', fixedModifier: -1 }).kind, 'invalid');
  assert.equal(extractTypedExtraDice('2d12', { base: '2d12', fixedModifier: 1.5 }).kind, 'invalid');
  assert.deepEqual(extractTypedExtraDice('2d12+0d6', { base: '2d12', fixedModifier: 0 }), { kind: 'typed', extraDice: [], manualModifier: 0 });
});
