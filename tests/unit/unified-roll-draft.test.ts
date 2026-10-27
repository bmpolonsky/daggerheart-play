import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  convertUnifiedRollToManual,
  createUnifiedRollDraft,
  editUnifiedRollDice,
  selectUnifiedRollBranch,
  setUnifiedRollQuantity,
  unifiedRollDraftError,
  type UnifiedRollActor
} from '../../src/domain/rules/unifiedRollDraft';
import { UnifiedRollDraftService } from '../../src/services/UnifiedRollDraftService';

const actor: UnifiedRollActor = { key: 'character:ari', id: 'ari', name: 'Ари', kind: 'character' };
const input = { id: 'draft-a', actor, mode: 'action' as const, title: 'Проверка', formula: '2d12', trait: 'agility' as const };

test('new roll requests prefill without execution and capture actor independently from mutable source views', () => {
  const service = new UnifiedRollDraftService();
  const sourceActor = { ...actor };
  service.request({ ...input, actor: sourceActor });
  sourceActor.name = 'Other sheet now visible';
  assert.equal(service.state$.get().draft?.actor.name, 'Ари');
  assert.equal(service.state$.get().dirty, false);
  assert.equal(service.state$.get().openRequest, 1);
  assert.equal(service.state$.get().draft?.formula, '2d12');
});

test('dirty draft survives a new prefill until an explicit replace or keep decision', () => {
  const service = new UnifiedRollDraftService();
  service.request(input);
  service.update({ manualModifier: 6, experienceIds: ['scout'] });
  service.request({ ...input, id: 'draft-b', title: 'New card', formula: '1d8', mode: 'manual' });
  assert.equal(service.state$.get().draft?.id, 'draft-a');
  assert.equal(service.state$.get().draft?.manualModifier, 6);
  assert.equal(service.state$.get().pending?.id, 'draft-b');
  assert.equal(service.state$.get().openRequest, 2);
  service.choosePending(false);
  assert.equal(service.state$.get().pending, null);
  assert.equal(service.state$.get().dirty, true);
  assert.deepEqual(service.state$.get().draft?.experienceIds, ['scout']);
  service.request({ ...input, id: 'draft-c', title: 'Next card', mode: 'damage', formula: '2d6+3' });
  service.choosePending(true);
  assert.equal(service.state$.get().draft?.id, 'draft-c');
  assert.equal(service.state$.get().dirty, false);
});

test('explicit roll completion releases dirty protection but keeps the last draft for another deliberate roll', () => {
  const service = new UnifiedRollDraftService();
  service.request(input);
  service.update({ manualModifier: -2 });
  service.markRolled();
  assert.equal(service.state$.get().draft?.manualModifier, -2);
  assert.equal(service.state$.get().dirty, false);
  service.request({ ...input, id: 'draft-b' });
  assert.equal(service.state$.get().draft?.id, 'draft-b');
  service.clear();
  assert.equal(service.state$.get().draft, null);
  assert.equal(service.state$.get().pending, null);
});

test('draft scope is captured at request and does not silently follow a changed game or session', () => {
  const service = new UnifiedRollDraftService();
  let scope = 'game-a/room-a/peer-a';
  const release = service.setScopeProvider(() => scope);
  service.request(input);
  scope = 'game-b/room-b/peer-b';
  assert.equal(service.state$.get().draft?.scopeKey, 'game-a/room-a/peer-a');
  assert.equal(service.currentScopeKey(), 'game-b/room-b/peer-b');
  service.request({ ...input, id: 'new-game-draft' });
  assert.equal(service.state$.get().draft?.scopeKey, 'game-b/room-b/peer-b');
  service.request({ ...input, scopeKey: 'explicit-source-scope' });
  assert.equal(service.state$.get().draft?.scopeKey, 'explicit-source-scope');
  release();
  assert.notEqual(service.currentScopeKey(), scope);
});

test('additive dice retain typed semantics while removing reserved base dice requires explicit conversion', () => {
  const action = createUnifiedRollDraft(input);
  const added = editUnifiedRollDice(action, 6, 1);
  assert.equal(added.requiresManual, false);
  assert.equal(added.draft.formula, '2d12');
  assert.deepEqual(added.draft.extraDice, [{ count: 1, sides: 6 }]);
  assert.equal(action.extraDice, undefined);
  const gmAttack = createUnifiedRollDraft({ ...input, mode: 'gmAttack', formula: '1d20' });
  const removed = editUnifiedRollDice(gmAttack, 20, -1);
  assert.equal(removed.requiresManual, true);
  assert.equal(removed.draft.mode, 'gmAttack');
  assert.equal(unifiedRollDraftError({ ...action, formula: '3d12' }), 'Для изменения базовых костей явно перейдите к ручному броску.');
});

test('explicit manual conversion uses the supplied full formula and clears typed costs/options', () => {
  const draft = createUnifiedRollDraft({ ...input, experienceIds: ['scout'], manualModifier: 2, advantageCount: 1 });
  const converted = convertUnifiedRollToManual(draft, '2d12+1d6+4');
  assert.equal(converted.mode, 'manual');
  assert.equal(converted.formula, '2d12+4');
  assert.deepEqual(converted.experienceIds, []);
  assert.equal(converted.manualModifier, 0);
  assert.equal(converted.advantageCount, 1);
  assert.equal(converted.spendHopeForExperiences, false);
  assert.equal(converted.actor.id, draft.actor.id);
  assert.equal(unifiedRollDraftError(converted), null);
});

test('manual and damage dice pool edits preserve constants and actor without enabling experience costs', () => {
  const draft = createUnifiedRollDraft({ ...input, mode: 'damage', formula: '2d6+3', damageType: 'physical' });
  const added = editUnifiedRollDice(draft, 8, 2);
  assert.equal(added.requiresManual, false);
  assert.equal(added.draft.formula, '2d6+3+2d8');
  const removed = editUnifiedRollDice(added.draft, 6, -1);
  assert.equal(removed.draft.formula, '1d6+3+2d8');
  assert.equal(removed.draft.actor.id, 'ari');
  assert.deepEqual(removed.draft.experienceIds, []);
  assert.equal(removed.draft.mode, 'damage');
});

test('unresolved count and branch stay explicit; literal count bindings compile valid formulas without evaluating abilities', () => {
  const draft = createUnifiedRollDraft({ ...input, mode: 'manual', formula: '', quantity: { label: 'Потраченные жетоны', value: null, min: 1, max: 4, formulaTemplate: '{count}d10', explanation: 'Не оставшиеся жетоны.' } });
  assert.match(unifiedRollDraftError(draft) ?? '', /Потраченные жетоны/);
  const resolved = setUnifiedRollQuantity(draft, 3);
  assert.equal(resolved.formula, '3d10');
  assert.equal(unifiedRollDraftError(resolved), null);
  assert.match(unifiedRollDraftError(setUnifiedRollQuantity(draft, 5)) ?? '', /Некорректное количество/);
  const scaledFlat = setUnifiedRollQuantity({ ...draft, quantity: { label: 'Цели', value: null, min: 1, formulaTemplate: '{count}d20', flatPerCount: 2 } }, 3);
  assert.equal(scaledFlat.formula, '3d20+6');
  const branches = createUnifiedRollDraft({ ...input, mode: 'manual', formula: '', branches: [{ id: 'normal', label: 'Обычно', formula: '1d6' }, { id: 'fear', label: 'Со Страхом', formula: '2d6+2' }] });
  assert.equal(unifiedRollDraftError(branches), 'Выберите вариант броска.');
  const chosen = selectUnifiedRollBranch(branches, 'fear');
  assert.equal(chosen.formula, '2d6+2');
  assert.equal(unifiedRollDraftError(chosen), null);
});

test('manual and damage drafts with no positive dice refuse rather than inventing a die', () => {
  for (const mode of ['manual', 'damage'] as const) {
    for (const formula of ['0', '6', '0d6', '-1d6+2']) {
      assert.equal(unifiedRollDraftError(createUnifiedRollDraft({ ...input, mode, formula })), 'Нет костей для броска. Измените количество или добавьте кости.');
    }
    assert.equal(unifiedRollDraftError(createUnifiedRollDraft({ ...input, mode, formula: '1d6-1' })), null);
  }
  const zeroCount = createUnifiedRollDraft({ ...input, mode: 'manual', formula: '0d6', quantity: { label: 'Характеристика Заклинателя', value: 0, min: 0, formulaTemplate: '{count}d6' } });
  assert.equal(unifiedRollDraftError(zeroCount), 'Нет костей для броска. Измените количество или добавьте кости.');
});

test('editor input survives updates, pending prefill, keep and completion until explicit accepted replacement or clear', () => {
  const service = new UnifiedRollDraftService();
  service.request(input);
  service.setEditor({ formulaInput: '2d12+', formulaError: 'Incomplete formula' });
  service.setEditor({ proposal: '2d12+1d6', modifierInput: '-' });
  const editor = service.state$.get().editor;
  assert.equal(service.state$.get().dirty, true);
  service.update({ notes: 'Other editable field' });
  assert.deepEqual(service.state$.get().editor, editor);
  service.request({ ...input, id: 'pending-draft' });
  assert.equal(service.state$.get().draft?.id, input.id);
  assert.deepEqual(service.state$.get().editor, editor);
  service.choosePending(false);
  assert.deepEqual(service.state$.get().editor, editor);
  service.markRolled();
  assert.deepEqual(service.state$.get().editor, editor);
  service.request({ ...input, id: 'accepted-draft' });
  assert.deepEqual(service.state$.get().editor, { formulaInput: null, formulaError: null, proposal: null, modifierInput: null });
  service.setEditor({ modifierInput: '+6' });
  service.request({ ...input, id: 'replace-confirmed' });
  service.choosePending(true);
  assert.equal(service.state$.get().draft?.id, 'replace-confirmed');
  assert.equal(service.state$.get().editor?.modifierInput, null);
  service.setEditor({ formulaInput: 'edited' });
  service.clear();
  assert.equal(service.state$.get().editor?.formulaInput, null);
});
