import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assignStartingTrait, isCompleteStartingTraitDistribution, type TraitDraft } from '../../src/ui/characters/traitDistribution';
import { CharacterBuilderService } from '../../src/ui/characters/CharacterBuilderService';
import { equipmentFixture } from './helpers';

const full: TraitDraft = { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 };

test('occupied unique value clears its other owner without swapping', () => {
  const result = assignStartingTrait(full, 'strength', 2);
  assert.deepEqual(result, { traits: { agility: 0, strength: 2, finesse: 1, instinct: 0, knowledge: 1 }, clearedTrait: 'presence' });
  assert.equal(full.strength, -1);
  assert.equal(isCompleteStartingTraitDistribution(result.traits), false);
});

test('duplicate slots are used freely before releasing one stable owner', () => {
  const free = assignStartingTrait({ agility: 1, strength: 2 }, 'knowledge', 1);
  assert.equal(free.clearedTrait, undefined);
  assert.deepEqual(free.traits, { agility: 1, strength: 2, knowledge: 1 });
  const exhausted = assignStartingTrait({ knowledge: 1, finesse: 1, strength: 2 }, 'instinct', 1);
  assert.equal(exhausted.clearedTrait, 'finesse');
  assert.deepEqual(exhausted.traits, { knowledge: 1, strength: 2, instinct: 1 });
  assert.equal(assignStartingTrait(full, 'strength', 0).clearedTrait, 'agility');
});

test('reselect is a true no-op, empty clears only the chosen field, invalid inputs do nothing', () => {
  assert.equal(assignStartingTrait(full, 'presence', 2).traits, full);
  assert.equal(assignStartingTrait({}, 'presence', null).clearedTrait, undefined);
  assert.equal(assignStartingTrait(full, 'presence', 3).traits, full);
  const empty = assignStartingTrait(full, 'presence', null);
  assert.deepEqual(empty.traits, { agility: 0, strength: -1, finesse: 1, instinct: 0, knowledge: 1 });
  assert.equal(empty.clearedTrait, undefined);
});

test('service emits one atomic change, preserves cleared hints through Back, and gates final creation', () => {
  const service = new CharacterBuilderService();
  const model = () => service.buildModel({ content: { ancestries: [], communities: [], subclasses: [], domainCards: [] }, classes: [], equipment: equipmentFixture(), draft: service.draft$.get() });
  let emissions = 0;
  service.draft$.subscribe(() => emissions++);
  model().handlers.setTrait('strength', 2);
  assert.equal(emissions, 1);
  assert.equal(service.draft$.get().traits.presence, undefined);
  assert.deepEqual(model().fields.clearedTraits, ['presence']);
  assert.match(model().fields.traitAnnouncement, /Влияние/);
  assert.equal(model().canCreate, false);
  assert.equal(model().result.draft.traits?.strength, 2);
  assert.equal(model().fields.traits.presence, undefined);
  model().handlers.goToStep('traits');
  model().handlers.goNext();
  model().handlers.goBack();
  assert.deepEqual(model().fields.clearedTraits, ['presence']);
  const previous = emissions;
  model().handlers.setTrait('strength', 2);
  assert.equal(emissions, previous);
  model().handlers.setTrait('presence', -1);
  assert.equal(isCompleteStartingTraitDistribution(model().fields.traits), true);
  assert.deepEqual(model().fields.clearedTraits, []);
  assert.equal(model().fields.traitAnnouncement, '');
  service.reset();
  assert.deepEqual(model().fields.clearedTraits, []);
});

test('partial Bard preview preserves +2 reassignment and does not mark the missing slot ready', () => {
  const service = new CharacterBuilderService();
  const model = () => service.buildModel({ content: { ancestries: [], communities: [], subclasses: [], domainCards: [] }, classes: [], equipment: equipmentFixture(), draft: service.draft$.get() });
  model().handlers.setTrait('agility', 2);
  assert.equal(model().fields.traits.presence, undefined);
  assert.equal(model().result.draft.traits?.agility, 2);
  assert.equal(model().canCreate, false);
  assert.ok(model().issues.some(issue => issue.id === 'traits.distribution'));
  model().handlers.goToStep('loadout');
  model().handlers.goToStep('traits');
  assert.equal(model().fields.traits.agility, 2);
  model().handlers.setTrait('presence', 0);
  assert.equal(model().result.draft.traits?.agility, 2);
  assert.equal(model().result.draft.traits?.presence, 0);
  assert.ok(!model().issues.some(issue => issue.id === 'traits.distribution'));
});
