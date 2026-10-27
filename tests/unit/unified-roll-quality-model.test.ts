import { test } from 'vitest';
import assert from 'node:assert/strict';
import { changeUnifiedRollActor, createUnifiedRollDraft, editUnifiedRollDice, freeUnifiedRollInput, resetUnifiedRollDraft, type UnifiedRollActor } from '../../src/domain/rules/unifiedRollDraft';
import { unifiedRollEditableModifier, setUnifiedRollEditableModifier, unifiedRollCompleteFormula, unifiedRollFormulaPresentation, unifiedRollPoolPresentation, unifiedRollExecutionFormula } from '../../src/domain/rules/unifiedRollPresentation';
import { eventRollCompatibility, type EventRollContext } from '../../src/domain/rules/eventRoll';
import { UnifiedRollDraftService } from '../../src/services/UnifiedRollDraftService';

const gm: UnifiedRollActor = { key: 'gm', id: null, kind: 'gm', name: 'Мастер' };
const pc: UnifiedRollActor = { key: 'character:pc', id: 'pc', kind: 'character', name: 'Герой' };
const npc: UnifiedRollActor = { key: 'adversary:npc', id: 'npc', kind: 'adversary', name: 'Противник' };

test('free Dice seeds the explicit actor and reset/add/remove has no phantom zero', () => {
  const master = createUnifiedRollDraft(freeUnifiedRollInput(gm));
  assert.equal(master.formula, '1d20');
  const hero = changeUnifiedRollActor(master, pc, { trait: 'instinct' });
  assert.equal(hero.mode, 'action');
  assert.equal(hero.formula, '2d12');
  assert.equal(hero.trait, 'instinct');
  const reset = resetUnifiedRollDraft({ ...hero, scopeKey: 'old-game' });
  assert.equal(reset.formula, '');
  assert.equal(reset.actor.id, pc.id);
  assert.equal(reset.scopeKey, 'old-game');
  const added = editUnifiedRollDice(reset, 6, 1).draft;
  assert.equal(added.formula, '1d6');
  assert.equal(editUnifiedRollDice(added, 6, -1).draft.formula, '');
  assert.equal(editUnifiedRollDice({ ...reset, formula: '0' }, 20, 1).draft.formula, '1d20');
  const typedNpc = createUnifiedRollDraft(freeUnifiedRollInput(npc));
  assert.equal(editUnifiedRollDice(typedNpc, 20, -1, 'base').proposedFormula, '0');
});

test('actor choice clears actor-specific metadata while retaining a prepared manual/damage pool', () => {
  const prepared = createUnifiedRollDraft({ actor: pc, mode: 'damage', title: 'Старое оружие', formula: '2d8+3',
    source: { isCompanion: true }, damage: { formula: '2d8+3' }, experienceIds: ['old-xp'],
    quantity: { label: 'Старый счётчик', value: 2, formulaTemplate: '{count}d8' }, critical: true });
  const changed = changeUnifiedRollActor(prepared, { ...pc, id: 'pc2', key: 'character:pc2', name: 'Другой герой' });
  assert.equal(changed.formula, '2d8+3');
  assert.equal(changed.mode, 'damage');
  assert.deepEqual(changed.experienceIds, []);
  assert.equal(changed.source, undefined);
  assert.equal(changed.quantity, undefined);
  assert.equal(changed.damage, undefined);
  assert.equal(changed.critical, false);
  const custom = createUnifiedRollDraft({ ...freeUnifiedRollInput(gm), formula: '3d10' });
  assert.equal(changeUnifiedRollActor(custom, pc).formula, '3d10');
  assert.equal(changeUnifiedRollActor(custom, pc).mode, 'manual');
});

test('manual flat field replaces the effective flat once and retains critical/source semantics', () => {
  const weapon = createUnifiedRollDraft({ actor: pc, mode: 'damage', title: 'Оружие', formula: '1d8+3', critical: true });
  assert.equal(unifiedRollEditableModifier(weapon), 3);
  const changed = setUnifiedRollEditableModifier(weapon, 4);
  assert.equal(changed.formula, '1d8+3');
  assert.equal(changed.manualModifier, 1);
  assert.equal(unifiedRollEditableModifier(changed), 4);
  assert.equal(unifiedRollFormulaPresentation(changed).criticalBonus, 8);
  const negative = setUnifiedRollEditableModifier(changed, -2);
  assert.equal(unifiedRollEditableModifier(negative), -2);
  assert.equal(negative.manualModifier, -5);
  assert.equal(unifiedRollFormulaPresentation(negative).criticalBonus, 8);
  assert.equal(unifiedRollCompleteFormula(negative), '1d8-2');
  assert.equal(unifiedRollExecutionFormula(negative), '1d8-2');
  assert.equal(unifiedRollFormulaPresentation(negative).effectiveFormula, '1d8+6');
  assert.equal(weapon.formula, '1d8+3');
});

test('formula and modifier editor buffers synchronize in both directions without accepting invalid input', () => {
  const service = new UnifiedRollDraftService();
  service.request(freeUnifiedRollInput(pc));
  service.editModifier('3');
  assert.equal(service.state$.get().draft?.manualModifier, 3);
  service.editFormula('2d12+7', 2);
  assert.equal(service.state$.get().draft?.manualModifier, 5);
  assert.equal(service.state$.get().editor?.modifierInput, null);
  assert.equal(unifiedRollCompleteFormula(service.state$.get().draft!, 2), '2d12+7');
  service.editModifier('-');
  assert.equal(service.state$.get().draft?.manualModifier, 5);
  assert.equal(service.state$.get().editor?.modifierInput, '-');
  service.editFormula('2d12+');
  assert.ok(service.state$.get().editor?.formulaError);
  service.finishFormulaEdit();
  assert.equal(service.state$.get().editor?.formulaInput, '2d12+');
  service.editFormula('2d12+4', 2);
  service.finishFormulaEdit();
  assert.equal(service.state$.get().editor?.formulaInput, null);
  assert.equal(service.state$.get().editor?.modifierInput, null);
  service.setModifier(-1);
  assert.equal(unifiedRollCompleteFormula(service.state$.get().draft!, 2), '2d12+1');
  service.request({ actor: pc, mode: 'manual', title: 'Макрос', formula: '2d10+3' });
  service.choosePending(true);
  service.editFormula('2d10-2');
  assert.equal(unifiedRollEditableModifier(service.state$.get().draft!), -2);
  service.setModifier(6);
  assert.equal(unifiedRollEditableModifier(service.state$.get().draft!), 6);
  assert.equal(service.state$.get().draft?.manualModifier, 8);
});

test('source recovery formula remains nominal until the user actually changes its effective flat', () => {
  const context: EventRollContext = { kind: 'rest', scopeKey: 'scope', entryId: 'rest', actorId: 'pc', choiceId: 'heal', fingerprint: 'initial', formula: '1d4+2' };
  const draft = createUnifiedRollDraft({ actor: pc, mode: 'manual', title: 'Отдых', formula: '1d4+2', eventContext: context });
  assert.equal(eventRollCompatibility(context, draft).manualOverrideRequired, false);
  assert.equal(unifiedRollEditableModifier(draft), 2);
  assert.equal(eventRollCompatibility(context, setUnifiedRollEditableModifier(draft, 2)).manualOverrideRequired, false);
  assert.equal(eventRollCompatibility(context, setUnifiedRollEditableModifier(draft, 3)).manualOverrideRequired, true);
  assert.deepEqual(resetUnifiedRollDraft(draft).eventContext, context);
  assert.throws(() => changeUnifiedRollActor(draft, gm), /связан с событием/);
});

test('visible pool reports actual dice and existing advantage selection semantics', () => {
  const action = createUnifiedRollDraft({ ...freeUnifiedRollInput(pc), advantageCount: 3, extraDice: [{ count: 2, sides: 8 }] });
  const playerPool = unifiedRollPoolPresentation(action);
  assert.equal(playerPool.rolledDiceCount, 7); // Hope + Fear + two ordinary d8 + three advantage d6.
  assert.equal(playerPool.chips.find((chip) => chip.kind === 'advantage')?.count, 3);
  assert.equal(playerPool.chips.find((chip) => chip.target === 'extra')?.count, 2);
  const gmPool = unifiedRollPoolPresentation(createUnifiedRollDraft({ ...freeUnifiedRollInput(npc), advantageCount: 2 }));
  assert.equal(gmPool.rolledDiceCount, 3);
  assert.equal(gmPool.chips.find((chip) => chip.kind === 'advantage')?.sides, 20);
  assert.match(gmPool.evaluationHint!, /наибольший/);
  const plainD20 = unifiedRollPoolPresentation(createUnifiedRollDraft({ ...freeUnifiedRollInput(gm), disadvantageCount: 2 }));
  assert.equal(plainD20.rolledDiceCount, 3);
  assert.match(plainD20.evaluationHint!, /наименьший/);
  const mixed = unifiedRollPoolPresentation(createUnifiedRollDraft({ actor: gm, mode: 'manual', title: 'Кости', formula: '1d20+1d8', advantageCount: 2 }));
  assert.equal(mixed.rolledDiceCount, 4);
  assert.equal(mixed.chips.find((chip) => chip.kind === 'advantage')?.sides, 6);
  assert.equal(mixed.chips.find((chip) => chip.kind === 'advantage')?.count, 2);
  assert.match(mixed.evaluationHint!, /2d6/);
  assert.equal(unifiedRollPoolPresentation(createUnifiedRollDraft({ ...freeUnifiedRollInput(pc), advantageCount: 2, disadvantageCount: 2 })).rolledDiceCount, 2);
});

test('negative ordinary dice remain signed manual terms and can be removed independently', () => {
  const draft = createUnifiedRollDraft({ actor: gm, mode: 'manual', title: 'Ручной набор', formula: '1d20+1d6-2d6' });
  const pool = unifiedRollPoolPresentation(draft);
  assert.equal(pool.rolledDiceCount, 4);
  const negative = pool.chips.find((chip) => chip.sign === -1)!;
  assert.equal(negative.kind, 'die');
  assert.equal(negative.target, 'base');
  assert.equal(negative.count, 2);
  assert.equal(pool.chips.some((chip) => chip.kind === 'disadvantage'), false);
  const oneRemoved = editUnifiedRollDice(draft, 6, -1, 'base', -1).draft;
  assert.equal(oneRemoved.formula, '1d20+1d6-1d6');
  const bothRemoved = editUnifiedRollDice(oneRemoved, 6, -1, 'base', -1).draft;
  assert.equal(bothRemoved.formula, '1d20+1d6');
  assert.equal(bothRemoved.disadvantageCount, 0);
  assert.equal(editUnifiedRollDice(draft, 6, -1, 'base').draft.formula, '1d20-2d6');
  const customActor = changeUnifiedRollActor(draft, pc);
  assert.equal(customActor.mode, 'manual');
  assert.equal(customActor.formula, draft.formula);
  const reset = resetUnifiedRollDraft(customActor);
  assert.equal(editUnifiedRollDice(reset, 8, 1).draft.formula, '1d8');
  assert.equal(reset.actor.id, pc.id);
});
