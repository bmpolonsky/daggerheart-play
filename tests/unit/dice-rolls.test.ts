import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores } from "../../src/stores/gameStores";
import { gameService, characterService, diceService, encounterService } from "../../src/services/serviceRegistry";
import { diceBoxNotationForRoll } from "../../src/ui/dice/diceBoxNotation";
import { firstCharacter } from "./helpers";

test('warrior physical damage does not get an implicit flat level bonus', () => {
  resetAllStores();
  const warrior = characterService.createCharacter({ className: 'Warrior', level: 3, name: 'Боец' });

  const physical = diceService.rollDamage({
    actorId: warrior.id,
    formula: '1',
    damageType: 'physical'
  });
  const magic = diceService.rollDamage({
    actorId: warrior.id,
    formula: '1',
    damageType: 'magic'
  });

  assert.equal(physical.formula, '1');
  assert.equal(physical.total, 1);
  assert.equal(physical.notes, undefined);
  assert.equal(magic.formula, '1');
  assert.equal(magic.total, 1);
});

test('ranger companion tracks SRD stress and uses owner proficiency for damage', () => {
  resetAllStores();
  const ranger = characterService.createCharacter({ className: 'Ranger', level: 3, proficiency: 2, name: 'Следопыт' });

  assert.equal(characterService.ensureRangerCompanion(ranger.id, { name: 'Волчок', imageUrl: ' https://example.test/wolf.webp ' }), true);
  const companion = characterService.getCharacter(ranger.id)?.companion;

  assert.equal(companion?.name, 'Волчок');
  assert.equal(companion?.imageUrl, 'https://example.test/wolf.webp');
  assert.equal(companion?.evasion, 10);
  assert.deepEqual(companion?.stress, { marked: 0, max: 3 });

  characterService.markCompanionStress(ranger.id, 3);
  const exhausted = characterService.getCharacter(ranger.id)?.companion;
  assert.equal(exhausted?.stress.marked, 3);
  assert.equal(exhausted?.unavailableUntilLongRest, true);

  const damage = diceService.rollDamage({
    actorId: ranger.id,
    actorName: exhausted?.name,
    formula: '2d6',
    damageType: 'physical'
  });
  assert.equal(damage.formula, '2d6');

  const command = diceService.rollAction({
    actorId: ranger.id,
    trait: 'instinct',
    difficulty: 0,
    experienceIds: ['companion-exp-1'],
    spendHopeForExperiences: true
  });
  assert.equal(characterService.getCharacter(ranger.id)?.hope.value, ranger.hope.value - 1);
  assert.equal(command.modifiers.some((modifier) => modifier.label === 'Опыт компаньона: Разведчик' && modifier.value === 2), true);
});

test('manual dice rolls support launcher formulas and reject unsupported dice', () => {
  resetAllStores();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const entry = diceService.rollManualDice({ formula: '2d6+d20+3', label: 'Spot check', visibility: 'gm' });
    assert.equal(entry.type, 'manual');
    assert.equal(entry.title, 'Spot check');
    assert.equal(entry.total, 6);
    assert.equal(entry.visibility, 'gm');
    assert.deepEqual(entry.terms.filter((term) => 'rolls' in term).map((term) => term.sides), [6, 20]);
    assert.equal(diceService.rollLog$.get()[0], entry);
    assert.throws(() => diceService.rollManualDice({ formula: '1d100' }), /Unsupported manual die/);
  } finally {
    Math.random = originalRandom;
  }
});
test('manual d20 advantage keeps the best d20 instead of adding a d6', () => {
  resetAllStores();
  const rolls = [0.2, 0.95, 0.1];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;
  try {
    const entry = diceService.rollManualDice({
      formula: '1d20+2',
      label: 'Мастер: d20',
      advantageCount: 1
    });
    assert.equal(entry.formula, '1d20+2');
    assert.equal(entry.total, 22);
    assert.deepEqual(entry.terms[0], { sign: 1, count: 2, sides: 20, rolls: [5, 20], subtotal: 20 });
    assert.deepEqual(entry.terms[1], { sign: 1, value: 2, subtotal: 2 });
  } finally {
    Math.random = originalRandom;
  }
});

test('manual d20 disadvantage keeps the worst d20 instead of subtracting a d6', () => {
  resetAllStores();
  const rolls = [0.95, 0.2, 0.99];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;
  try {
    const entry = diceService.rollManualDice({
      formula: '1d20+2',
      label: 'Мастер: d20',
      disadvantageCount: 1
    });
    assert.equal(entry.formula, '1d20+2');
    assert.equal(entry.total, 7);
    assert.deepEqual(entry.terms[0], { sign: 1, count: 2, sides: 20, rolls: [20, 5], subtotal: 5 });
    assert.deepEqual(entry.terms[1], { sign: 1, value: 2, subtotal: 2 });
  } finally {
    Math.random = originalRandom;
  }
});

test('manual mixed dice advantage adds d6 bonus and keeps the best bonus die', () => {
  resetAllStores();
  const rolls = [0, 0.5, 0.16, 0.99];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;
  try {
    const entry = diceService.rollManualDice({
      formula: '2d12',
      label: 'Дуальность',
      advantageCount: 2,
      diceTones: ['hope', 'fear']
    });
    assert.equal(entry.total, 14);
    assert.deepEqual(entry.terms[0], { sign: 1, count: 2, sides: 12, rolls: [1, 7], subtotal: 8 });
    assert.deepEqual(entry.terms[1], { sign: 1, count: 2, sides: 6, rolls: [1, 6], subtotal: 6 });
    assert.deepEqual(entry.diceTones, ['hope', 'fear', 'advantage', 'advantage']);
  } finally {
    Math.random = originalRandom;
  }
});

test('manual mixed dice disadvantage subtracts the best penalty die', () => {
  resetAllStores();
  const rolls = [0, 0.5, 0.16, 0.99];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;
  try {
    const entry = diceService.rollManualDice({
      formula: '2d12',
      label: 'Дуальность',
      disadvantageCount: 2,
      diceTones: ['hope', 'fear']
    });
    assert.equal(entry.total, 2);
    assert.deepEqual(entry.terms[1], { sign: -1, count: 2, sides: 6, rolls: [1, 6], subtotal: -6 });
    assert.deepEqual(entry.diceTones, ['hope', 'fear', 'disadvantage', 'disadvantage']);
  } finally {
    Math.random = originalRandom;
  }
});

test('dice-box notation puts predetermined mixed results after one shared marker', () => {
  assert.equal(diceBoxNotationForRoll({
    id: 'roll',
    dice: [
      { id: 'a', sides: 12, value: 5, tone: 'hope' },
      { id: 'b', sides: 20, value: 17, tone: 'neutral' }
    ]
  }), '1d12+1d20@5,17');
});

test('reaction rolls use Duality dice without Hope/Fear consequences', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 1);
  characterService.updateResourceMax(character.id, 'stress', 3);
  characterService.markStress(character.id, 2);
  gameService.setFear(0);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const entry = diceService.rollReaction({
      actorId: character.id,
      trait: 'agility',
      difficulty: 1
    });
    const updated = characterService.getCharacter(character.id);
    assert.equal(entry.type, 'reaction');
    assert.equal(entry.isCritical, true);
    assert.equal(entry.consequenceApplied, false);
    assert.equal(updated?.hope.value, 1);
    assert.equal(updated?.stress.marked, 2);
    assert.equal(gameService.game$.get().fear, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('GM attack check rolls without target or automatic damage', () => {
  resetAllStores();
  gameService.setFear(1);
  const adversary = encounterService.createAdversary({
    attackModifier: 1,
    experiences: [{ id: 'sharp', name: 'Острые чувства', modifier: 2 }]
  });
  const rolls = [0.2, 0.99];
  const originalRandom = Math.random;
  Math.random = () => rolls.shift() ?? 0;
  try {
    const entry = diceService.rollGmAttackCheck({
      adversaryId: adversary.id,
      experienceIds: ['sharp'],
      advantageCount: 1
    });
    const rollLog = diceService.rollLog$.get();
    assert.equal(entry?.type, 'manual');
    assert.equal(entry?.label, 'Атака');
    assert.equal(entry?.actorName, adversary.name);
    assert.equal(entry?.total, 23);
    assert.equal(entry?.text.includes('d20[5,20] -> 20'), true);
    assert.equal(gameService.game$.get().fear, 0);
    assert.equal(rollLog.length, 1);
    assert.equal(rollLog[0].type, 'manual');
  } finally {
    Math.random = originalRandom;
  }
});
