import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DiceService } from '../../src/services/DiceService';
import { createCharacter } from '../../src/domain/rules/factories';
import { charactersStore, gameStore, resetAllStores, rollLogStore } from '../../src/stores/gameStores';
import { convertUnifiedRollToManual, createUnifiedRollDraft, editUnifiedRollDice, type UnifiedRollDraft } from '../../src/domain/rules/unifiedRollDraft';
import { applyUnifiedFormulaEdit, unifiedRollCompleteFormula, unifiedRollDiceConversionFormula, unifiedRollPoolPresentation } from '../../src/domain/rules/unifiedRollPresentation';

function withRolls<T>(values: number[], run: () => T): T {
  const original = Math.random;
  const queue = [...values];
  Math.random = () => queue.shift() ?? 0;
  try { return run(); } finally { Math.random = original; }
}

function setup() {
  resetAllStores();
  const actor = createCharacter({ id: 'adv-hero', name: 'Герой', hope: { value: 3, max: 6 }, experiences: [{ id: 'xp', name: 'Опыт', modifier: 2 }] });
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const draft = createUnifiedRollDraft({ actor: { id: actor.id, key: `character:${actor.id}`, kind: 'character', name: actor.name }, mode: 'action', title: 'Проверка', formula: '2d12' });
  return { actor, draft, dice: new DiceService() };
}

test('released PC contract rolls one, two and three effective d6 and uses MAX rather than SUM', () => {
  for (const rollType of ['action', 'reaction'] as const) {
    for (const [advantageCount, disadvantageCount] of [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2], [0, 3], [3, 1], [1, 3], [3, 3]]) {
      const { actor, dice } = setup();
      const net = advantageCount - disadvantageCount;
      const count = Math.abs(net);
      const samples = [0, 0.5, 0.99].slice(0, count);
      const rolled = withRolls([0, 0.5, ...samples], () => dice[rollType === 'action' ? 'rollAction' : 'rollReaction']({ actorId: actor.id, difficulty: 12, advantageCount, disadvantageCount, applyConsequences: false }));
      assert.deepEqual(rolled.advantageRolls, net > 0 ? [1, 4, 6].slice(0, count) : []);
      assert.deepEqual(rolled.disadvantageRolls, net < 0 ? [1, 4, 6].slice(0, count) : []);
      const selected = count ? Math.sign(net) * Math.max(...[1, 4, 6].slice(0, count)) : 0;
      assert.equal(rolled.keptExtraDie, selected);
      assert.equal(rolled.total, 1 + 7 + selected);
      assert.equal(rollLogStore.get().length, 1);
      assert.equal(charactersStore.get().entities[actor.id].hope.value, 3);
      assert.equal(gameStore.get().fear, 0);
    }
  }
});

test('cancellation preserves the remaining red pool and additive white d6 and charges experience once', () => {
  for (const rollType of ['action', 'reaction'] as const) {
    const { actor, dice } = setup();
    const rolled = withRolls([0, 0.5, 0, 0.5, 0.99, 0.16], () => dice[rollType === 'action' ? 'rollAction' : 'rollReaction']({
      actorId: actor.id, difficulty: 12, advantageCount: 1, disadvantageCount: 4, experienceIds: ['xp'],
      extraDice: [{ count: 1, sides: 6 }], applyConsequences: false
    }));
    assert.deepEqual(rolled.disadvantageRolls, [1, 4, 6]);
    assert.equal(rolled.keptExtraDie, -6);
    assert.deepEqual(rolled.extraDiceTerms?.[0].rolls, [1]);
    assert.equal(rolled.total, 1 + 7 + 2 - 6 + 1);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 2);
    assert.equal(gameStore.get().fear, 0);
  }
});

test('formula editing reserves the entire MAX pool without swallowing ordinary same-sided dice', () => {
  const { draft } = setup();
  for (const sign of [1, -1] as const) {
    const original = { ...draft, advantageCount: sign > 0 ? 3 : 0, disadvantageCount: sign < 0 ? 3 : 0, extraDice: [{ count: 1, sides: 6 }] };
    const formula = unifiedRollCompleteFormula(original, 2);
    assert.equal(formula, `2d12+1d6+2${sign > 0 ? '+' : '-'}3d6`);
    const edited = applyUnifiedFormulaEdit(original, formula, 2);
    assert.equal(edited.requiresManual, false);
    assert.deepEqual(edited.draft.extraDice, [{ count: 1, sides: 6 }]);
    assert.equal(edited.draft.manualModifier, 0);
    const pool = unifiedRollPoolPresentation(original);
    assert.equal(pool.rolledDiceCount, 6);
    assert.match(pool.evaluationHint!, /3d6.*наибольший/);
  }
});

test('explicit manual conversion preserves N-die MAX metadata and never sums the reserved dice', () => {
  const { draft, dice } = setup();
  for (const sign of [1, -1] as const) {
    const original: UnifiedRollDraft = { ...draft, advantageCount: sign > 0 ? 3 : 0, disadvantageCount: sign < 0 ? 3 : 0, extraDice: [{ count: 1, sides: 6 }] };
    const full = unifiedRollDiceConversionFormula(original, '1d12', 2);
    const manual = convertUnifiedRollToManual(original, full);
    assert.equal(manual.advantageCount, original.advantageCount);
    assert.equal(manual.disadvantageCount, original.disadvantageCount);
    assert.deepEqual(manual.experienceIds, []);
    assert.equal(manual.spendHopeForExperiences, false);
    const edited = applyUnifiedFormulaEdit(manual, unifiedRollCompleteFormula(manual)).draft;
    assert.deepEqual(edited, manual);
    const rolled = withRolls([0, 0.16, 0, 0.5, 0.99], () => dice.rollManualDice({ formula: manual.formula, advantageCount: manual.advantageCount, disadvantageCount: manual.disadvantageCount }));
    assert.equal(rolled.total, 1 + 1 + 2 + sign * 6);
    assert.equal(unifiedRollPoolPresentation(manual).rolledDiceCount, 5);
  }
  assert.throws(() => convertUnifiedRollToManual({ ...draft, advantageCount: 3 }, '1d20+3d6'), /одиночный d20/);
  const npc = createUnifiedRollDraft({ actor: { kind: 'adversary', key: 'npc', id: 'npc', name: 'Противник' }, mode: 'gmAttack', title: 'Атака', formula: '1d20', advantageCount: 2 });
  assert.throws(() => convertUnifiedRollToManual(npc, '1d8'), /не сохранит выбор/);
});

test('later manual edits cannot change the advantage die family without explicit reset', () => {
  const { draft } = setup();
  const d20 = createUnifiedRollDraft({ ...draft, mode: 'manual', formula: '1d20', advantageCount: 3 });
  assert.throws(() => applyUnifiedFormulaEdit(d20, '1d20+1d6'), /Сначала сбросьте/);
  assert.throws(() => editUnifiedRollDice(d20, 6, 1), /Сначала сбросьте/);
  const mixed = createUnifiedRollDraft({ ...draft, mode: 'manual', formula: '1d12', advantageCount: 3 });
  assert.throws(() => applyUnifiedFormulaEdit(mixed, '1d20+3d6'), /Сначала сбросьте/);
  const noDice = editUnifiedRollDice(mixed, 12, -1).draft;
  assert.throws(() => editUnifiedRollDice(noDice, 20, 1), /Сначала сбросьте/);
  const changedFlat = applyUnifiedFormulaEdit(mixed, '1d12+5+3d6').draft;
  assert.equal(changedFlat.formula, '1d12+5');
  assert.equal(changedFlat.advantageCount, 3);
});

test('Daggerheart d6 disadvantage subtracts the maximum; only ordinary d20 disadvantage keeps low', async () => {
  const { selectionFormulaPresentation } = await import('../../src/domain/rules/selectionNotation');
  const { actor, draft, dice } = setup();
  const negative = { ...draft, mode: 'reaction' as const, disadvantageCount: 3 };
  assert.equal(selectionFormulaPresentation(unifiedRollCompleteFormula(negative), negative), '2d12-3d6kh1');
  const reaction = withRolls([0, 0.5, 0, 0.5, 0.99], () => dice.rollReaction({ actorId: actor.id, difficulty: 12, disadvantageCount: 3 }));
  assert.deepEqual(reaction.disadvantageRolls, [1, 4, 6]);
  assert.equal(reaction.keptExtraDie, -6); // Not -1 and not -(1+4+6).
  const ordinary = createUnifiedRollDraft({ actor: draft.actor, mode: 'manual', formula: '1d20', title: 'QA', disadvantageCount: 2 });
  assert.equal(selectionFormulaPresentation(unifiedRollCompleteFormula(ordinary), ordinary), '3d20kl1');
  const rolled = withRolls([0.5, 0.1, 0.95], () => dice.rollManualDice({ formula: '1d20', disadvantageCount: 2 }));
  assert.equal(rolled.total, 3);
  const term = rolled.terms[0];
  assert.ok('rolls' in term); assert.deepEqual(term.rolls, [11, 3, 20]);
});
