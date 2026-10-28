import { test } from 'vitest';
import assert from 'node:assert/strict';
import { selectionFormulaPresentation, normalizeSelectionFormula } from '../../src/domain/rules/selectionNotation';
import { createUnifiedRollDraft, convertUnifiedRollToManual } from '../../src/domain/rules/unifiedRollDraft';
import { applyUnifiedFormulaEdit, unifiedRollCompleteFormula, unifiedRollExecutionFormula } from '../../src/domain/rules/unifiedRollPresentation';
const actor = { kind: 'character' as const, id: 'qa', key: 'character:qa', name: 'QA' };
for (const mode of ['action', 'reaction', 'manual'] as const) for (const count of [1, 2, 3]) for (const sign of [1, -1]) {
  test(`${mode} ${sign * count} MAX roundtrip preserves additive d6, costs and execution`, () => {
    const draft = createUnifiedRollDraft({ actor, mode, formula: mode === 'manual' ? '1d8+1d6' : '2d12', title: 'QA', extraDice: mode === 'manual' ? undefined : [{ count: 1, sides: 6 }], advantageCount: sign > 0 ? count : 0, disadvantageCount: sign < 0 ? count : 0, experienceIds: ['xp'], spendHopeForExperiences: true });
    const legacy = unifiedRollCompleteFormula(draft, 2);
    const display = selectionFormulaPresentation(legacy, draft);
    assert.equal(display, `${legacy}kh1`);
    const edited = applyUnifiedFormulaEdit(draft, display, 2);
    assert.equal(edited.requiresManual, false);
    assert.equal(unifiedRollExecutionFormula(edited.draft), unifiedRollExecutionFormula(draft));
    assert.deepEqual(edited.draft.extraDice, draft.extraDice);
    assert.deepEqual(edited.draft.experienceIds, draft.experienceIds);
    assert.equal(edited.draft.advantageCount, draft.advantageCount);
    assert.equal(edited.draft.disadvantageCount, draft.disadvantageCount);
    assert.equal(normalizeSelectionFormula(display, draft), legacy);
    const manual = convertUnifiedRollToManual(draft, display);
    assert.equal(manual.formula.includes('kh'), false);
    assert.equal(manual.advantageCount, draft.advantageCount);
    assert.equal(manual.disadvantageCount, draft.disadvantageCount);
  });
}
test('d20 keep-high/low notation reserves the original base, without changing old payloads', () => {
  for (const mode of ['gmAttack', 'manual'] as const) for (const sign of [1, -1]) {
    const draft = createUnifiedRollDraft({ actor, mode, title: 'QA', formula: '1d20', advantageCount: sign > 0 ? 3 : 0, disadvantageCount: sign < 0 ? 3 : 0 });
    const display = selectionFormulaPresentation('1d20+2', draft);
    assert.equal(display, `4d20${sign > 0 ? 'kh1' : 'kl1'}+2`);
    assert.equal(applyUnifiedFormulaEdit(draft, display).draft.formula, mode === 'manual' ? '1d20+2' : '1d20');
    assert.equal(convertUnifiedRollToManual(draft, display).formula, '1d20+2');
  }
});
test('selection annotations cannot change the current selection, swallow ordinary dice or weaken event validation', () => {
  const draft = createUnifiedRollDraft({ actor, mode: 'action', title: 'QA', formula: '2d12', advantageCount: 3 });
  for (const input of ['2d12+2d6kh1', '2d12-3d6kh1', '2d12+3d6kl1', '2d12kh1+3d6', '2d12+3d6kh1+3d6kh1']) assert.throws(() => applyUnifiedFormulaEdit(draft, input));
  assert.throws(() => applyUnifiedFormulaEdit(draft, '2d12+3d6kh2'));
  assert.equal(selectionFormulaPresentation('2d12', { ...draft, disadvantageCount: 3 }), '2d12');
  assert.equal(applyUnifiedFormulaEdit(draft, '2d12+3d6').requiresManual, false); // legacy editor syntax
});

test('ordinary toggles are reversible and rare multiplicity is an explicit bounded intent', async () => {
  const { toggleRollAdvantage, setRollAdvantageMultiplicity } = await import('../../src/domain/rules/actionComposer');
  const neutral = { advantageCount: 0, disadvantageCount: 0 };
  const single = toggleRollAdvantage(neutral, 'advantage');
  assert.deepEqual(single, { advantageCount: 1, disadvantageCount: 0 });
  assert.deepEqual(toggleRollAdvantage(single, 'advantage'), neutral);
  const triple = setRollAdvantageMultiplicity(single, 3);
  assert.deepEqual(triple, { advantageCount: 3, disadvantageCount: 0 });
  assert.deepEqual(toggleRollAdvantage(triple, 'disadvantage'), { advantageCount: 0, disadvantageCount: 1 });
  assert.deepEqual(toggleRollAdvantage(triple, 'advantage'), neutral);
  assert.deepEqual(setRollAdvantageMultiplicity({ advantageCount: 3, disadvantageCount: 1 }, 2), { advantageCount: 2, disadvantageCount: 0 });
  assert.throws(() => setRollAdvantageMultiplicity(single, 21));
  assert.throws(() => setRollAdvantageMultiplicity(single, 1.5));
});
