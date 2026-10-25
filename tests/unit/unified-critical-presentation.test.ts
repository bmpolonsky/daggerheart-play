import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createUnifiedRollDraft } from '../../src/domain/rules/unifiedRollDraft';
import { unifiedRollFormulaPresentation } from '../../src/domain/rules/unifiedRollPresentation';

function damage(formula: string) {
  return createUnifiedRollDraft({ actor: { key: 'gm', kind: 'gm', id: null, name: 'GM' }, mode: 'damage', title: 'Damage', formula, critical: true });
}

test('critical damage preview shows the maximum exactly once and keeps its editable base unchanged', () => {
  const draft = damage('1d10+3');
  const before = JSON.stringify(draft);
  assert.deepEqual(unifiedRollFormulaPresentation(draft), { baseFormula: '1d10+3', effectiveFormula: '1d10+3+10', criticalBonus: 10 });
  assert.equal(JSON.stringify(draft), before);
});

test('critical maximum counts dice only, not flat or manually added modifiers', () => {
  const draft = { ...damage('2d6+1d4+3'), manualModifier: -2 };
  assert.deepEqual(unifiedRollFormulaPresentation(draft), { baseFormula: '2d6+1d4+3-2', effectiveFormula: '2d6+1d4+3-2+16', criticalBonus: 16 });
});

test('ordinary damage and non-damage modes do not acquire a presentation critical bonus', () => {
  assert.equal(unifiedRollFormulaPresentation({ ...damage('1d10+3'), critical: false }).effectiveFormula, '1d10+3');
  assert.equal(unifiedRollFormulaPresentation({ ...damage('1d10+3'), mode: 'manual' }).criticalBonus, 0);
});

test('incomplete damage formulas do not invent a critical die or change the draft', () => {
  assert.deepEqual(unifiedRollFormulaPresentation(damage('')), { baseFormula: '', effectiveFormula: '', criticalBonus: 0 });
});
