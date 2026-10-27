import { test } from 'vitest';
import assert from 'node:assert/strict';
import { applyCustomConditionEdit, customConditionDraft, isCustomCondition } from '../../src/domain/rules/customConditions';

test('simple editor preserves legacy text without migrating on open, and folds it only on save', () => {
  const legacy = { id: 'cold', name: 'Холод', notes: 'Болит рука', removalCondition: 'Согреться' };
  const original = { ...legacy };
  const draft = customConditionDraft(legacy);
  assert.deepEqual(draft, { name: 'Холод', notes: 'Болит рука\n\nУсловие снятия: Согреться' });
  assert.deepEqual(legacy, original);
  const saved = applyCustomConditionEdit([legacy], draft, legacy.id).conditions[0];
  assert.equal(saved.notes, draft.notes);
  assert.equal(saved.removalCondition, undefined);
  assert.deepEqual(customConditionDraft(saved), draft);
  assert.deepEqual(customConditionDraft(), { name: '', notes: '' });
  assert.equal(customConditionDraft({ id: 'x', name: 'Тест', removalCondition: 'Отдых' }).notes, 'Условие снятия: Отдых');
});

test('manual conditions preserve name, description and removal reminder through an edit', () => {
  const added = applyCustomConditionEdit([], { name: '  Обморожение  ', notes: ' Болит рука ', removalCondition: ' После согревания ' }, 'cold');
  assert.equal(added.issue, null);
  assert.deepEqual(added.conditions, [{ id: 'cold', name: 'Обморожение', notes: 'Болит рука', removalCondition: 'После согревания' }]);
  const edited = applyCustomConditionEdit(added.conditions, { name: 'Обморожение', notes: 'Прошло онемение', removalCondition: '' }, 'cold');
  assert.equal(edited.conditions.length, 1);
  assert.equal(edited.conditions[0].id, 'cold');
  assert.equal(edited.conditions[0].removalCondition, undefined);
  assert.equal(added.conditions[0].notes, 'Болит рука');
});

test('manual conditions cannot impersonate or edit core statuses', () => {
  for (const name of ['vulnerable', ' Уязвим ', 'defeated', 'Побеждён', 'Hidden', 'Обездвижен']) {
    assert.notEqual(applyCustomConditionEdit([], { name }, 'x').issue, null);
  }
  const conditions = [{ id: 'core', name: 'restrained', notes: 'core note' }];
  const result = applyCustomConditionEdit(conditions, { name: 'Другое имя' }, 'core');
  assert.notEqual(result.issue, null);
  assert.deepEqual(result.conditions, conditions);
  assert.equal(isCustomCondition(conditions[0]), false);
});

test('duplicate and blank custom states are rejected without touching existing conditions', () => {
  const conditions = [{ id: 'a', name: 'Проклятие', notes: 'Снять вручную' }, { id: 'b', name: 'hidden' }];
  assert.notEqual(applyCustomConditionEdit(conditions, { name: ' проклятие ' }, 'c').issue, null);
  assert.notEqual(applyCustomConditionEdit(conditions, { name: ' ' }, 'c').issue, null);
  const result = applyCustomConditionEdit(conditions, { name: 'Проклятие', notes: 'Новое описание' }, 'a');
  assert.equal(result.issue, null);
  assert.equal(result.conditions[1], conditions[1]);
});
