import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildRollActorOptions, resolveRollActor } from '../../src/domain/tabletop/rollActorContext';
import { selectManualDice, type DiceTrayItem } from '../../src/domain/rules/manualDiceTray';
import { createAdversary, createCharacter, createEncounterEnvironment, createEncounterState } from '../../src/domain/rules/factories';
import { createTokenState } from '../../src/domain/tabletop/factories';

function actorFixture() {
  const first = createCharacter({ id: 'first', name: 'First' });
  const second = createCharacter({ id: 'second', name: 'Second' });
  const characters = { entities: { first, second }, order: ['first', 'second'], selectedId: 'second', updatedAt: '' };
  const encounter = createEncounterState();
  encounter.adversaries = { on: createAdversary({ id: 'on', name: 'On scene' }), off: createAdversary({ id: 'off', name: 'Off scene' }) };
  encounter.environments = { env: createEncounterEnvironment({ id: 'env', name: 'Environment' }) };
  const sceneTokens = [createTokenState({ kind: 'adversary', id: 'on' }), createTokenState({ kind: 'adversary', id: 'on' }), createTokenState({ kind: 'environment', id: 'env' })];
  return { characters, encounter, sceneTokens, playerCharacterId: 'first' };
}

test('GM actor choices contain all PCs and only unique scene NPC/environment actors', () => {
  const options = buildRollActorOptions({ ...actorFixture(), role: 'gm' });
  assert.deepEqual(options.map((option) => option.key), ['gm', 'character:first', 'character:second', 'adversary:on', 'environment:env']);
  assert.equal(resolveRollActor(options, null, 'gm').key, 'gm');
  assert.equal(resolveRollActor(options, 'character:first', 'gm').key, 'character:first');
  assert.equal(resolveRollActor(options.filter((option) => option.id !== 'first'), 'character:first', 'gm').key, 'gm');
});

test('player roll context is restricted to its assigned PC and ignores a foreign selection', () => {
  const options = buildRollActorOptions({ ...actorFixture(), role: 'player' });
  assert.deepEqual(options.map((option) => option.key), ['character:first']);
  assert.equal(resolveRollActor(options, 'character:second', 'player').id, 'first');
  const unassigned = buildRollActorOptions({ ...actorFixture(), role: 'player', playerCharacterId: null });
  assert.equal(resolveRollActor(unassigned, null, 'player').id, null);
});

test('manual dice add preserves the set while replace selects exactly the requested die', () => {
  const original: DiceTrayItem[] = [{ id: 'd20', kind: 'die', sides: 20 }];
  const added = selectManualDice(original, { kind: 'die', sides: 6 }, 'add', 'd6');
  assert.deepEqual(added.map((item) => item.kind === 'die' && item.sides), [20, 6]);
  assert.equal(original.length, 1);
  const replaced = selectManualDice(added, { kind: 'die', sides: 8 }, 'replace', 'd8');
  assert.deepEqual(replaced, [{ id: 'd8', kind: 'die', sides: 8 }]);
});

test('adding Duality deduplicates Hope/Fear and replacing removes unrelated dice and bonuses', () => {
  const original: DiceTrayItem[] = [{ id: 'hope', kind: 'hope' }, { id: 'd20', kind: 'die', sides: 20 }, { id: 'adv', kind: 'advantage' }];
  const added = selectManualDice(original, { kind: 'duality' }, 'add', 'dual');
  assert.deepEqual(added.map((item) => item.kind), ['hope', 'fear', 'die', 'advantage']);
  assert.equal(selectManualDice(added, { kind: 'duality' }, 'add', 'again').length, 4);
  assert.deepEqual(selectManualDice(added, { kind: 'duality' }, 'replace', 'replace').map((item) => item.kind), ['hope', 'fear']);
});
