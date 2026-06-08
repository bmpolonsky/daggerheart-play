import { test } from "vitest";
import assert from "node:assert/strict";
import { createEncounterState } from "../../src/domain/rules/factories";
import { migratePersistedState } from "../../src/domain/migrations/persistedState";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { buildCombatBuilderEncounterFromCoreEncounter, buildCoreAdversariesFromCombatBuilder } from "../../src/domain/combatBuilderBridge/index";
import { createAdversaryFromLibrary, mapRawAdversary } from "../../src/domain/content/mappers";

test('combat builder bridge maps encounter entries into core adversaries', () => {
  const result = buildCoreAdversariesFromCombatBuilder({
    entries: [{
      count: 2,
      instances: [
        { id: 'a', currentHp: 1, currentStress: 0 },
        { id: 'b', currentHp: 3, currentStress: 1 }
      ],
      adversary: {
        id: 7,
        tier: 1,
        roleId: 'ranged',
        name: 'Лучник',
        attackBonus: '+2',
        attackRange: 'Далеко',
        damageType: 'physical',
        damageDieCount: 1,
        damageDieSize: 8,
        damageBonus: 2,
        hp: 4,
        stress: 2,
        difficulty: 13,
        damageThresholds: [6, 12],
        weaponName: 'Лук',
        experiences: 'Выслеживание +2',
        features: [{ id: 1, name: 'Volley', text: 'Spend Fear to attack.' }]
      }
    }]
  });

  assert.equal(result.adversaries.length, 2);
  assert.equal(result.battlePointBudget, 4);
  assert.equal(result.adversaries[0].name, 'Лучник 1');
  assert.equal(result.adversaries[0].type, 'Ranged');
  assert.equal(result.adversaries[0].standardAttack.damageFormula, '1d8+2');
  assert.deepEqual(result.adversaries[0].thresholds, { major: 6, severe: 12 });
  assert.equal(result.adversaries[1].hp.marked, 3);
  assert.equal(result.adversaries[1].stress.marked, 1);
  assert.equal(result.adversaries[0].features[0].kind, 'fear');
});

test('combat builder bridge maps core encounter back into builder snapshot', () => {
  const encounter = createEncounterState();
  const adversary = createAdversaryFromLibrary(mapRawAdversary({
    id: 10,
    name: 'Железный страж',
    tier: 2,
    type_slug: 'bruiser',
    type_name: 'Bruiser',
    attack_bonus: '+3',
    attack_range: 'melee',
    damage_die_count: 2,
    damage_die_size: 8,
    damage_bonus: 4,
    damage_type: 'physical',
    hp: 7,
    stress: 3,
    difficulty: 15,
    damage_thresholds: [9, 18],
    weapon_name: 'Кулак',
    experiences: 'Страж +2',
    image_url: 'https://example.test/guard.png'
  }));
  adversary.hp.marked = 2;
  adversary.stress.marked = 1;
  const snapshot = buildCombatBuilderEncounterFromCoreEncounter({
    ...encounter,
    adversaries: { [adversary.id]: adversary },
    order: [adversary.id],
    updatedAt: '2026-05-26T00:00:00.000Z'
  });

  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0]?.adversary.name, 'Железный страж');
  assert.equal(snapshot.entries[0]?.adversary.roleId, 'bruiser');
  assert.equal(snapshot.entries[0]?.adversary.damageDieCount, 2);
  assert.equal(snapshot.entries[0]?.adversary.damageDieSize, 8);
  assert.equal(snapshot.entries[0]?.adversary.damageBonus, 4);
  assert.deepEqual(snapshot.entries[0]?.instances?.[0], { id: adversary.id, currentHp: 2, currentStress: 1 });
});

test('v4 persisted encounter snapshots migrate old adversary shapes', () => {
  const state = {
    ...snapshotPersistedState(),
    schemaVersion: 4 as const,
    encounter: {
      ...createEncounterState(),
      adversaries: {
        legacy: {
          id: 'legacy',
          name: 'Старый противник'
        }
      },
      order: ['legacy']
    }
  };

  const migrated = migratePersistedState(state);

  assert.equal(migrated.schemaVersion, 5);
  assert.equal(migrated.encounter.adversaries.legacy?.name, 'Старый противник');
  assert.equal(migrated.encounter.adversaries.legacy?.summary, '');
  assert.equal(migrated.encounter.order[0], 'legacy');
});

test('combat builder bridge groups core adversary instances by source', () => {
  const libraryAdversary = mapRawAdversary({
    id: 21,
    name: 'Алая Слизь',
    tier: 1,
    type_slug: 'skulk',
    type_name: 'Skulk',
    hp: 4,
    stress: 1
  });
  const first = createAdversaryFromLibrary(libraryAdversary);
  const second = createAdversaryFromLibrary(libraryAdversary);
  first.hp.marked = 1;
  second.stress.marked = 1;

  const snapshot = buildCombatBuilderEncounterFromCoreEncounter({
    ...createEncounterState(),
    adversaries: { [first.id]: first, [second.id]: second },
    order: [first.id, second.id],
    updatedAt: '2026-05-26T00:00:00.000Z'
  });

  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0]?.count, 2);
  assert.equal(snapshot.entries[0]?.adversary.id, 21);
  assert.equal(snapshot.entries[0]?.adversary.name, 'Алая Слизь');
  assert.deepEqual(snapshot.entries[0]?.instances, [
    { id: first.id, currentHp: 1, currentStress: 0 },
    { id: second.id, currentHp: 0, currentStress: 1 }
  ]);
});

test('combat builder bridge keeps adversary raw fields stable across round trips', () => {
  const firstImport = buildCoreAdversariesFromCombatBuilder({
    entries: [{
      count: 1,
      adversary: {
        id: 11,
        tier: 1,
        roleId: 'skulk',
        name: 'Алая Слизь',
        summary: 'Движущаяся масса полупрозрачной горящей алой слизи.',
        motives: 'Замаскироваться, поглощать и делиться',
        mainBody: 'Пылает, делится и оставляет горящие следы.',
        image: '/image/adversary/ooze-red.png'
      }
    }]
  });
  const adversary = firstImport.adversaries[0];
  const snapshot = buildCombatBuilderEncounterFromCoreEncounter({
    ...createEncounterState(),
    adversaries: { [adversary.id]: adversary },
    order: [adversary.id],
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
  const secondImport = buildCoreAdversariesFromCombatBuilder(snapshot);

  assert.equal(adversary.notes, '');
  assert.equal(adversary.summary, 'Движущаяся масса полупрозрачной горящей алой слизи.');
  assert.equal(adversary.motives, 'Замаскироваться, поглощать и делиться');
  assert.equal(adversary.mainBody, 'Пылает, делится и оставляет горящие следы.');
  assert.equal(adversary.imageUrl, '/image/adversary/ooze-red.png');
  assert.equal(snapshot.entries[0]?.adversary.summary, 'Движущаяся масса полупрозрачной горящей алой слизи.');
  assert.equal(snapshot.entries[0]?.adversary.motives, 'Замаскироваться, поглощать и делиться');
  assert.equal(snapshot.entries[0]?.adversary.mainBody, 'Пылает, делится и оставляет горящие следы.');
  assert.equal(snapshot.entries[0]?.adversary.image, '/image/adversary/ooze-red.png');
  assert.equal(secondImport.adversaries[0]?.notes, '');
  assert.equal(secondImport.adversaries[0]?.summary, adversary.summary);
  assert.equal(secondImport.adversaries[0]?.motives, adversary.motives);
  assert.equal(secondImport.adversaries[0]?.mainBody, adversary.mainBody);
  assert.equal(secondImport.adversaries[0]?.imageUrl, adversary.imageUrl);
});
