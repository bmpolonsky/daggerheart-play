import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveActionOutcome } from "../../src/domain/rules/rollOutcomes";
import { hasRolledDiceTerms, rollFormula, scaleWeaponFormulaByProficiency } from "../../src/domain/rules/diceFormula";
import { formatDualityBreakdown, formatDualityResult } from "../../src/domain/rules/rollPresentation";

test('resolveActionOutcome covers Hope/Fear outcomes and exact difficulty success', () => {
  assert.deepEqual(resolveActionOutcome({ hopeDie: 6, fearDie: 6, total: 3, difficulty: 99 }).outcome, 'criticalSuccess');
  assert.deepEqual(resolveActionOutcome({ hopeDie: 8, fearDie: 3, total: 12, difficulty: 12 }).outcome, 'successWithHope');
  assert.deepEqual(resolveActionOutcome({ hopeDie: 3, fearDie: 8, total: 12, difficulty: 12 }).outcome, 'successWithFear');
  assert.deepEqual(resolveActionOutcome({ hopeDie: 8, fearDie: 3, total: 11, difficulty: 12 }).outcome, 'failureWithHope');
  assert.deepEqual(resolveActionOutcome({ hopeDie: 3, fearDie: 8, total: 11, difficulty: 12 }).outcome, 'failureWithFear');
});

test('duality roll presentation leads with total and Hope/Fear outcome', () => {
  assert.equal(formatDualityResult({ hopeDie: 8, fearDie: 3, total: 14, isCritical: false }), '14 с Надеждой');
  assert.equal(formatDualityResult({ hopeDie: 2, fearDie: 9, total: 14, isCritical: false }), '14 со Страхом');
  assert.equal(formatDualityResult({ hopeDie: 6, fearDie: 6, total: 12, isCritical: true }), '12 критически');
  assert.equal(formatDualityBreakdown({ hopeDie: 2, fearDie: 9, total: 14, isCritical: false, difficulty: 12 }), 'Надежда 2 / Страх 9 / Сложность 12');
});

test('damage formulas keep flat modifiers unscaled and critical damage adds max dice', () => {
  assert.equal(scaleWeaponFormulaByProficiency('1d8+2', 3), '3d8+2');
  const rolled = rollFormula('2d6+1d4+3', { critical: true, rng: () => 0 });
  assert.equal(rolled.total, 2 + 1 + 3 + 16);
  assert.equal(rolled.criticalBonus, 16);
  assert.equal(hasRolledDiceTerms(rolled.terms), true);
  assert.equal(hasRolledDiceTerms(rollFormula('1').terms), false);
  assert.equal(hasRolledDiceTerms(rollFormula('0d6+1').terms), false);
});
