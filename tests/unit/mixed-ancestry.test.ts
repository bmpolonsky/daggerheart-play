import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mapGenericItem } from '../../src/domain/content/mappers';
import { buildCharacterDraft } from '../../src/domain/characterBuilder';
import { mixedAncestryProblem } from '../../src/domain/characterBuilder/ancestry';
import { validateCharacterBuilderReadiness } from '../../src/domain/characterBuilder/validation';
import { buildEffectiveCharacterStats } from '../../src/domain/rules/effects';
import { createCharacter } from '../../src/domain/rules/factories';

// Reviewed upstream cache ancestry features preserve SRD first/second order.
const giant = mapGenericItem({ slug: 'giant', name: 'Великан', source_slugs: ['core', 'srd'], features: [
  { id: 238, name: 'Выносливость', main_body: 'Получите дополнительную ячейку Ран при создании персонажа.' },
  { id: 239, name: 'Размах', main_body: 'Ваша досягаемость увеличивается.' }
]}, 'ancestry');
const human = mapGenericItem({ slug: 'human', name: 'Человек', source_slugs: ['core', 'srd'], features: [
  { id: 244, name: 'Высокая выносливость', main_body: 'Получаете дополнительную ячейку Стресса при создании персонажа.' },
  { id: 245, name: 'Адаптивность', main_body: 'Вы можете повторить бросок.' }
]}, 'ancestry');
const content = { ancestries: [giant, human], communities: [], subclasses: [], domainCards: [] };

function draft(ancestryId: string, secondaryAncestryId?: string) {
  return buildCharacterDraft({ content, ancestryId, secondaryAncestryId }).draft;
}

test('mixed ancestry keeps first feature of A and second feature of B, with both source identities', () => {
  const result = draft(giant.id, human.id);
  assert.equal(result.ancestry, 'Великан / Человек');
  const features = result.sheetCards!.filter((card) => card.kind === 'ancestryFeature');
  assert.deepEqual(features.map((card) => card.name), ['Выносливость', 'Адаптивность']);
  assert.deepEqual(features.map((card) => card.sourceId), [giant.id, human.id]);
  assert.equal(result.sheetCards!.some((card) => card.text?.includes('ячейку Стресса')), false);
  const character = createCharacter(result);
  const effective = buildEffectiveCharacterStats(character);
  assert.equal(effective.hp.max, character.hp.max + 1);
  assert.equal(effective.stress.max, character.stress.max);
});

test('either orientation works and single ancestry behavior remains unchanged', () => {
  assert.deepEqual(draft(human.id, giant.id).sheetCards!.filter((card) => card.kind === 'ancestryFeature').map((card) => card.name), ['Высокая выносливость', 'Размах']);
  const single = draft(giant.id);
  assert.equal(single.ancestry, giant.name);
  assert.deepEqual(single.sheetCards!.filter((card) => card.kind === 'ancestryFeature').map((card) => card.name), ['Выносливость', 'Размах']);
});

test('invalid mixed selections block readiness and never silently grant a full ancestry set', () => {
  for (const secondaryAncestryId of ['', giant.id, 'missing']) {
    const readiness = validateCharacterBuilderReadiness({ content, classes: [], equipment: [], className: 'Bard', ancestryId: giant.id, secondaryAncestryId });
    assert.equal(readiness.issues.some((issue) => issue.id === 'ancestry.mixedInvalid' && issue.severity === 'blocking'), true);
    assert.equal(draft(giant.id, secondaryAncestryId).sheetCards!.some((card) => card.kind === 'ancestryFeature'), false);
  }
  const missingSecond = mapGenericItem({ slug: 'incomplete', name: 'Incomplete', features: [{ name: 'Only first' }] }, 'ancestry');
  assert.ok(mixedAncestryProblem(giant, missingSecond));
});
