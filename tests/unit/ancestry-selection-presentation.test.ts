import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mapGenericItem } from '../../src/domain/content/mappers';
import { ancestrySelectionPresentation, filterAncestryOptions } from '../../src/ui/characters/builder/ancestrySelectionPresentation';

const giant = mapGenericItem({ slug: 'giant', name: 'Великан', main_body: 'Описание народа.', features: [
  { id: 1, name: 'Выносливость', main_body: 'Первая механика Великана.' },
  { id: 2, name: 'Размах', main_body: 'Вторая механика Великана.' }
] }, 'ancestry');
const elf = mapGenericItem({ slug: 'elf', name: 'Эльф', features: [
  { id: 3, name: 'Быстрые рефлексы', main_body: 'Первая механика Эльфа.' },
  { id: 4, name: 'Небесный транс', main_body: 'Вторая механика Эльфа.' }
] }, 'ancestry');
const items = [giant, elf];

test('mixed previews contain only the feature at the selected position', () => {
  const view = ancestrySelectionPresentation(items, giant.id, elf.id);
  assert.equal(view.first?.description, 'Первая механика Великана.');
  assert.equal(view.second?.description, 'Вторая механика Эльфа.');
  assert.deepEqual(view.pair, ['Великан — Выносливость', 'Эльф — Небесный транс']);
  assert.equal(view.issue, null);
  const reverse = ancestrySelectionPresentation(items, elf.id, giant.id);
  assert.deepEqual(reverse.pair, ['Эльф — Быстрые рефлексы', 'Великан — Размах']);
});

test('single ancestry retains both features and the separate ancestry description', () => {
  const view = ancestrySelectionPresentation(items, giant.id);
  assert.equal(view.mixed, false);
  assert.deepEqual(view.singleFeatures.map(item => item.name), ['Выносливость', 'Размах']);
  assert.equal(view.singleDescription, 'Описание народа.');
});

test('invalid existing pairs remain selected with a visible problem rather than being replaced', () => {
  const before = JSON.stringify(items);
  const same = ancestrySelectionPresentation(items, giant.id, giant.id);
  assert.equal(same.first?.id, giant.id);
  assert.equal(same.second?.id, giant.id);
  assert.match(same.issue!, /две разные/);
  const missing = ancestrySelectionPresentation(items, giant.id, 'missing');
  assert.equal(missing.second, null);
  assert.match(missing.issue!, /недоступна/);
  assert.equal(JSON.stringify(items), before);
});

test('an unfinished second choice is explicit and does not receive a default feature', () => {
  const view = ancestrySelectionPresentation(items, giant.id, '');
  assert.equal(view.mixed, true);
  assert.equal(view.second, null);
  assert.equal(view.pair[1], 'Второе свойство не выбрано');
});

test('search matches ancestry, selected-position feature and its text without changing the selected pair', () => {
  const view = ancestrySelectionPresentation(items, giant.id, elf.id);
  assert.deepEqual(filterAncestryOptions(view.secondOptions, ' эЛьФ ').map(item => item.id), [elf.id]);
  assert.deepEqual(filterAncestryOptions(view.secondOptions, 'транс').map(item => item.id), [elf.id]);
  assert.deepEqual(filterAncestryOptions(view.firstOptions, 'Размах'), []);
  assert.equal(filterAncestryOptions(view.secondOptions, '').length, 2);
  assert.deepEqual(view.pair, ['Великан — Выносливость', 'Эльф — Небесный транс']);
});
