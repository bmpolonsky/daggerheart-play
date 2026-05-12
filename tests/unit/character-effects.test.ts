import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";
import { buildCharacterSummary } from "../../src/domain/tabletop/playerView";
import { resetAllStores } from "../../src/stores/gameStores";
import { characterService } from "../../src/services/serviceRegistry";
import { mapRawBeastformItem } from "../../src/domain/content/mappers";
import { firstCharacter } from "./helpers";

test('passive domain card effects are derived dynamically without mutating base character stats', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateTrait(character.id, 'agility', 1);
  characterService.addDomainCard(character.id, {
    id: 'passive-card',
    name: 'Passive Card',
    text: '+2 к Уклонению. +1 к Стрессу. +1 к Проворности. +2 к тяжелому порогу.',
    inLoadout: true
  });
  const stored = characterService.getCharacter(character.id)!;
  const effective = buildEffectiveCharacterStats(stored);
  const summary = buildCharacterSummary(stored);

  assert.equal(stored.evasion, 10);
  assert.equal(stored.stress.max, 6);
  assert.equal(stored.traits.agility, 1);
  assert.equal(effective.evasion, 12);
  assert.equal(effective.stress.max, 7);
  assert.equal(effective.traits.agility, 2);
  assert.equal(effective.thresholds.major, stored.thresholds.major + 2);
  assert.equal(summary.evasion, 12);
  assert.equal(summary.stress.max, 7);
});

test('permanent SRD sheet card effects are derived from ancestry and subclass features', () => {
  resetAllStores();
  const character = firstCharacter();
  character.proficiency = 2;
  character.sheetCards = [
    {
      id: 'giant-endurance',
      kind: 'ancestryFeature',
      name: 'Выносливость',
      text: 'Получите дополнительную ячейку [Ран](/rule/hit-points) при создании персонажа.'
    },
    {
      id: 'human-endurance',
      kind: 'ancestryFeature',
      name: 'Высокая выносливость',
      text: 'Получаете дополнительную ячейку [Стресса](/rule/stress) при создании персонажа.'
    },
    {
      id: 'simiah-agile',
      kind: 'ancestryFeature',
      name: 'Ловкий',
      text: 'Получите постоянный бонус +1 к вашему [Уклонению](/rule/evasion) при создании персонажа.'
    },
    {
      id: 'stalwart-unflinching',
      kind: 'subclassFeature',
      name: 'Непоколебимый',
      text: 'Получите постоянный бонус +1 к порогам урона.'
    },
    {
      id: 'galapa-shell',
      kind: 'ancestryFeature',
      name: 'Панцирь',
      text: 'Вы получаете бонус к порогам урона, равный вашему [Мастерству](/rule/proficiency).'
    },
    {
      id: 'winged-ascendant',
      kind: 'subclassFeature',
      name: 'Вознесенный',
      text: 'Получите постоянный бонус +4 к вашему порогу [Тяжёлого](/rule/severe-damage) урона.'
    }
  ];

  const effective = buildEffectiveCharacterStats(character);

  assert.equal(effective.hp.max, character.hp.max + 1);
  assert.equal(effective.stress.max, character.stress.max + 1);
  assert.equal(effective.evasion, character.evasion + 1);
  assert.equal(effective.thresholds.major, character.thresholds.major + 3);
  assert.equal(effective.thresholds.severe, character.thresholds.severe + 7);
});

test('sheet card effects ignore non-permanent resource and situational bonuses', () => {
  resetAllStores();
  const character = firstCharacter();
  character.sheetCards = [
    {
      id: 'rogue-evasion',
      kind: 'classFeature',
      name: 'Уклонение Плута',
      text: 'Потратьте 3 Надежды, чтобы получить +2 к Уклонению до следующей успешной атаки.'
    },
    {
      id: 'plain-note',
      kind: 'note',
      name: 'Заметка',
      text: 'Получите постоянный бонус +9 к Уклонению.'
    }
  ];

  const effective = buildEffectiveCharacterStats(character);

  assert.equal(effective.evasion, character.evasion);
  assert.equal(effective.hp.max, character.hp.max);
  assert.equal(effective.stress.max, character.stress.max);
  assert.deepEqual(effective.thresholds, character.thresholds);
});

test('druid beastform is an active reversible SRD effect', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateClass(character.id, 'Druid');
  characterService.setHope(character.id, 3);
  const beastform = mapRawBeastformItem({
    id: 'agile-scout',
    slug: 'agile-scout',
    name: 'Ловкий разведчик',
    tier: 1,
    evasion: 2,
    attack_trait: 'agility',
    attack_type: 'physical',
    attack_die: 4,
    attack_range: 'melee',
    trait_type: 'agility',
    trait_bonus: 1,
    short_description: 'Маленькая скрытная форма.',
    advantages: 'скрытности',
    features: [{ id: 'fragile', name: 'Хрупкость', main_body: 'Когда вы получаете Ощутимый урон или больше, вы теряете Звериный Облик.' }]
  });

  assert.equal(characterService.enterBeastform(character.id, beastform, { mode: 'stress' }), true);
  const transformed = characterService.getCharacter(character.id)!;
  assert.equal(transformed.stress.marked, 1);
  assert.equal(transformed.activeBeastform?.name, 'Ловкий разведчик');
  const effective = buildEffectiveCharacterStats(transformed);
  assert.equal(effective.evasion, transformed.evasion + 2);
  assert.equal(effective.traits.agility, transformed.traits.agility + 1);
  const summary = buildCharacterSummary(transformed);
  assert.deepEqual(summary.weapons.map((weapon) => weapon.name), ['Ловкий разведчик: атака']);
  assert.equal(summary.weapons[0]?.damageFormula, '1d4');

  characterService.markSlots(character.id, 'hp', transformed.hp.max);
  assert.equal(characterService.getCharacter(character.id)?.activeBeastform, null);
  assert.equal(characterService.enterBeastform(character.id, beastform, { mode: 'stress' }), true);
  characterService.exitBeastform(character.id);
  const restored = characterService.getCharacter(character.id)!;
  assert.equal(restored.activeBeastform, null);
  assert.notDeepEqual(buildCharacterSummary(restored).weapons.map((weapon) => weapon.name), ['Ловкий разведчик: атака']);
});

test('druid evolution beastform spends Hope and adds the selected trait without stress', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 3);
  const beastform = mapRawBeastformItem({
    id: 'sturdy',
    slug: 'sturdy',
    name: 'Крепкая форма',
    tier: 1,
    evasion: 1,
    attack_trait: 'strength',
    attack_type: 'physical',
    attack_die: 6,
    attack_range: 'melee',
    trait_type: 'strength',
    trait_bonus: 1
  });

  assert.equal(characterService.enterBeastform(character.id, beastform, { mode: 'evolution', evolutionTrait: 'instinct' }), true);
  const transformed = characterService.getCharacter(character.id)!;
  assert.equal(transformed.hope.value, 0);
  assert.equal(transformed.stress.marked, 0);
  assert.equal(transformed.activeBeastform?.evolutionTrait, 'instinct');
  const effective = buildEffectiveCharacterStats(transformed);
  assert.equal(effective.traits.strength, transformed.traits.strength + 1);
  assert.equal(effective.traits.instinct, transformed.traits.instinct + 1);
});
