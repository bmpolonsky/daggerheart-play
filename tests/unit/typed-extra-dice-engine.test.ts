import { test } from 'vitest';
import assert from 'node:assert/strict';
import { DiceService } from '../../src/services/DiceService';
import { createAdversary, createCharacter } from '../../src/domain/rules/factories';
import type { ExtraDieTerm } from '../../src/domain/rules/extraDice';
import { charactersStore, encounterStore, gameStore, resetAllStores, rollLogStore } from '../../src/stores/gameStores';
import { hydratePersistedState, snapshotPersistedState } from '../../src/stores/persistedState';

function setup() {
  resetAllStores();
  const actor = createCharacter({ id: 'extra-actor', name: 'Extra actor', hope: { value: 2, max: 6 },
    experiences: [{ id: 'hero-xp', name: 'Scout', modifier: 3 }] });
  actor.traits.strength = 2;
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const adversary = createAdversary({ id: 'extra-npc', name: 'Extra NPC', attackModifier: 3,
    experiences: [{ id: 'npc-xp', name: 'Hunter', modifier: 2 }] });
  encounterStore.update((state) => ({ ...state, adversaries: { [adversary.id]: adversary }, order: [adversary.id] }));
  gameStore.update((state) => ({ ...state, fear: 2 }));
  return { actor, adversary, dice: new DiceService() };
}

function withRolls<T>(values: number[], run: () => T): T {
  const original = Math.random;
  const queue = [...values];
  Math.random = () => queue.shift() ?? 0.25;
  try { return run(); } finally { Math.random = original; }
}

test('action adds extra dice once to typed result and pays selected experience once in one log entry', () => {
  const { actor, dice } = setup();
  const roll = withRolls([0.1, 0.5, 0.5], () => dice.rollAction({ actorId: actor.id, trait: 'strength', difficulty: 20,
    experienceIds: ['hero-xp', 'hero-xp'], manualModifier: 6, extraDice: [{ count: 1, sides: 6 }], applyConsequences: false }));
  assert.equal(roll.type, 'action');
  assert.equal(roll.hopeDie, 2);
  assert.equal(roll.fearDie, 7);
  assert.equal(roll.total, 2 + 7 + 2 + 3 + 6 + 4);
  assert.equal(roll.outcome, 'successWithFear');
  assert.equal(roll.modifiers.find((part) => part.label === 'Дополнительные кости')?.value, 4);
  assert.deepEqual(roll.extraDiceTerms, [{ sign: 1, count: 1, sides: 6, rolls: [4], subtotal: 4 }]);
  assert.deepEqual(roll.advantageRolls, []);
  assert.equal(charactersStore.get().entities[actor.id].hope.value, 1);
  assert.equal(rollLogStore.get().length, 1);
  assert.equal(rollLogStore.get()[0].id, roll.id);
});

test('only the reserved Hope/Fear pair determines critical and tone, never an extra d12', () => {
  const { actor, dice } = setup();
  const critical = withRolls([0.34, 0.34, 0.99], () => dice.rollAction({ actorId: actor.id, difficulty: 99, extraDice: [{ count: 1, sides: 12 }] }));
  assert.equal(critical.hopeDie, 5);
  assert.equal(critical.fearDie, 5);
  assert.equal(critical.isCritical, true);
  assert.equal(critical.outcome, 'criticalSuccess');
  assert.equal(critical.extraDiceTerms?.[0].rolls[0], 12);
  const ordinary = withRolls([0.34, 0.45, 0.34], () => dice.rollAction({ actorId: actor.id, difficulty: 99, extraDice: [{ count: 1, sides: 12 }] }));
  assert.equal(ordinary.hopeDie, 5);
  assert.equal(ordinary.fearDie, 6);
  assert.equal(ordinary.extraDiceTerms?.[0].rolls[0], 5);
  assert.equal(ordinary.isCritical, false);
  assert.equal(ordinary.outcome, 'failureWithFear');
});

test('ordinary advantage and an additive same-sided d6 remain separate random terms', () => {
  const { actor, dice } = setup();
  const roll = withRolls([0.1, 0.5, 0.99, 0, 0], () => dice.rollAction({ actorId: actor.id, difficulty: 12,
    advantageCount: 3, disadvantageCount: 1, extraDice: [{ count: 1, sides: 6 }] }));
  assert.deepEqual(roll.advantageRolls, [6, 1]);
  assert.equal(roll.keptExtraDie, 6);
  assert.deepEqual(roll.extraDiceTerms?.[0].rolls, [1]);
  assert.equal(roll.total, 2 + 7 + 6 + 1);
});

test('reaction keeps typed outcome and extra terms, spends experience once and applies no action consequences', () => {
  const { actor, dice } = setup();
  const fearBefore = gameStore.get().fear;
  const roll = withRolls([0.1, 0.5, 0.99, 0], () => dice.rollReaction({ actorId: actor.id, difficulty: 12,
    experienceIds: ['hero-xp'], extraDice: [{ count: 2, sides: 8 }] }));
  assert.equal(roll.type, 'reaction');
  assert.equal(roll.total, 2 + 7 + 3 + 8 + 1);
  assert.equal(roll.outcome, 'successWithFear');
  assert.equal(roll.consequenceApplied, false);
  assert.equal(charactersStore.get().entities[actor.id].hope.value, 1);
  assert.equal(gameStore.get().fear, fearBefore);
  assert.equal(rollLogStore.get().length, 1);
});

test('NPC extras appear as dice terms and are not counted again in formula or flat modifier', () => {
  const { adversary, dice } = setup();
  const roll = withRolls([0.45, 0.99], () => dice.rollGmAttackCheck({ adversaryId: adversary.id,
    experienceIds: ['npc-xp'], manualModifier: 4, extraDice: [{ count: 1, sides: 6 }] }))!;
  assert.equal(roll.total, 10 + 3 + 2 + 4 + 6);
  assert.equal(roll.formula, '1d20+1d6+9');
  assert.deepEqual(roll.terms, [
    { sign: 1, count: 1, sides: 20, rolls: [10], subtotal: 10 },
    { sign: 1, count: 1, sides: 6, rolls: [6], subtotal: 6 },
    { sign: 1, value: 9, subtotal: 9 }
  ]);
  assert.equal(roll.terms.reduce((sum, term) => sum + term.subtotal, 0), roll.total);
  assert.match(roll.notes ?? '', /Дополнительные кости \+6/);
  assert.equal(gameStore.get().fear, 1);
  assert.equal(rollLogStore.get().length, 1);
});

test('NPC procedural d20 keep does not consume or keep the additive d20', () => {
  const { adversary, dice } = setup();
  const roll = withRolls([0.05, 0.85, 0], () => dice.rollGmAttackCheck({ adversaryId: adversary.id,
    advantageCount: 1, extraDice: [{ count: 1, sides: 20 }] }))!;
  assert.deepEqual(roll.terms[0], { sign: 1, count: 2, sides: 20, rolls: [2, 18], subtotal: 18 });
  assert.deepEqual(roll.terms[1], { sign: 1, count: 1, sides: 20, rolls: [1], subtotal: 1 });
  assert.equal(roll.total, 18 + 1 + 3);
  assert.equal(roll.formula, '1d20+1d20+3');
});

test('invalid extra pools fail before RNG, resources and logs for action, reaction and NPC', () => {
  const { actor, adversary, dice } = setup();
  const invalidPools = [[{ count: -1, sides: 6 }], [{ count: 1, sides: 100 }], [{ count: 100, sides: 6 }, { count: 1, sides: 8 }]];
  const before = JSON.stringify(snapshotPersistedState());
  const original = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return 0; };
  try {
    for (const extraDice of invalidPools) {
      assert.throws(() => dice.rollAction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'], extraDice }));
      assert.throws(() => dice.rollReaction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'], extraDice }));
      assert.throws(() => dice.rollGmAttackCheck({ adversaryId: adversary.id, experienceIds: ['npc-xp'], extraDice }));
    }
    assert.equal(randomCalls, 0);
    assert.equal(JSON.stringify(snapshotPersistedState()), before);
  } finally { Math.random = original; }
});

test('extras preflight rejects unaffordable or missing selected XP before RNG or partial cost', () => {
  const { actor, adversary, dice } = setup();
  charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...state.entities[actor.id], hope: { ...actor.hope, value: 0 } } } }));
  gameStore.update((state) => ({ ...state, fear: 0 }));
  const before = JSON.stringify(snapshotPersistedState());
  const extraDice: ExtraDieTerm[] = [{ count: 1, sides: 4 }];
  const original = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return 0; };
  try {
    assert.throws(() => dice.rollAction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'], extraDice }), /Недостаточно Надежды/);
    assert.throws(() => dice.rollReaction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'], extraDice }), /Недостаточно Надежды/);
    assert.throws(() => dice.rollGmAttackCheck({ adversaryId: adversary.id, experienceIds: ['npc-xp'], extraDice }), /Недостаточно Страха/);
    assert.throws(() => dice.rollAction({ actorId: actor.id, difficulty: 12, experienceIds: ['removed-xp'], spendHopeForExperiences: false, extraDice }), /Опыт не найден/);
    assert.throws(() => dice.rollGmAttackCheck({ adversaryId: adversary.id, experienceIds: ['removed-xp'], spendFearForExperiences: false, extraDice }), /Опыт не найден/);
    assert.equal(randomCalls, 0);
    assert.equal(JSON.stringify(snapshotPersistedState()), before);
  } finally { Math.random = original; }
});

test('explicit free XP remains free, and legacy no-extras warning policy remains unchanged', () => {
  const { actor, adversary, dice } = setup();
  charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...state.entities[actor.id], hope: { ...actor.hope, value: 0 } } } }));
  gameStore.update((state) => ({ ...state, fear: 0 }));
  const extraDice: ExtraDieTerm[] = [{ count: 1, sides: 4 }];
  const free = withRolls([0.1, 0.5, 0], () => dice.rollAction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'], spendHopeForExperiences: false, extraDice }));
  assert.equal(free.modifiers.find((part) => part.label === 'Опыт без списания: Scout')?.value, 3);
  assert.equal(charactersStore.get().entities[actor.id].hope.value, 0);
  const npc = withRolls([0.1, 0], () => dice.rollGmAttackCheck({ adversaryId: adversary.id, experienceIds: ['npc-xp'], spendFearForExperiences: false, extraDice }))!;
  assert.match(npc.notes ?? '', /Опыт без списания: Hunter \+2/);
  assert.equal(gameStore.get().fear, 0);
  const legacy = dice.rollAction({ actorId: actor.id, difficulty: 12, experienceIds: ['hero-xp'] });
  assert.ok(legacy.warnings?.some((warning) => warning.includes('Недостаточно Надежды')));
  assert.equal(legacy.modifiers.find((part) => part.label === 'Опыт: Scout')?.value, 3);
  assert.equal('extraDiceTerms' in legacy, false);
});

test('typed extra dice values survive persisted-state JSON roundtrip in the same roll', () => {
  const { actor, dice } = setup();
  const roll = withRolls([0.1, 0.5, 0.99, 0], () => dice.rollAction({ actorId: actor.id, difficulty: 12,
    extraDice: [{ count: 1, sides: 8 }, { count: 1, sides: 6 }] }));
  const serialized = JSON.parse(JSON.stringify(snapshotPersistedState()));
  hydratePersistedState(serialized);
  const restored = rollLogStore.get()[0];
  assert.equal(restored.id, roll.id);
  assert.equal(restored.type, 'action');
  if (restored.type !== 'action') assert.fail('Typed action must remain an action');
  assert.deepEqual(restored.extraDiceTerms, roll.extraDiceTerms);
  assert.deepEqual(restored.modifiers, roll.modifiers);
  assert.equal(restored.total, roll.total);
  assert.equal(rollLogStore.get().length, 1);
});
