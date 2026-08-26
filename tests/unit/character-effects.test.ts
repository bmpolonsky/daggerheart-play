import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";
import { buildCharacterSummary } from "../../src/domain/tabletop/playerView";
import { resetAllStores } from "../../src/stores/gameStores";
import { characterService } from "../../src/services/serviceRegistry";
import { mapRawBeastformItem } from "../../src/domain/content/mappers";
import { equipmentFeatureModifiers } from "../../src/domain/rules/equipmentFeatureModifiers";
import { firstCharacter } from "./helpers";

test('domain-card prose never becomes a permanent character stat effect', () => {
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
  assert.equal(effective.evasion, stored.evasion);
  assert.equal(effective.stress.max, stored.stress.max);
  assert.equal(effective.traits.agility, stored.traits.agility);
  assert.deepEqual(effective.thresholds, stored.thresholds);
  assert.equal(summary.evasion, stored.evasion);
  assert.equal(summary.stress.max, stored.stress.max);
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
    },
    {
      id: 'homebrew-permanent-trait',
      kind: 'communityFeature',
      name: 'Меткий взгляд',
      text: 'Получите постоянный бонус +1 к вашему Знанию.'
    },
    {
      id: 'earthkin-stone-skin',
      kind: 'ancestryFeature',
      name: 'Каменная кожа',
      text: 'Получите бонус +1 к вашему Показателю Брони и Порогам Урона.'
    }
  ];

  const effective = buildEffectiveCharacterStats(character);

  assert.equal(effective.hp.max, character.hp.max + 1);
  assert.equal(effective.stress.max, character.stress.max + 1);
  assert.equal(effective.evasion, character.evasion + 1);
  assert.equal(effective.armorScore, character.armor.score + 1);
  assert.equal(effective.traits.knowledge, character.traits.knowledge + 1);
  assert.equal(effective.thresholds.major, character.thresholds.major + 4);
  assert.equal(effective.thresholds.severe, character.thresholds.severe + 8);
});

test('equipped armor modifiers are effective without changing base stats', () => {
  resetAllStores();
  const character = firstCharacter();
  character.armor = {
    ...character.armor,
    name: 'Стеганый Доспех',
    sourceSlug: 'gambeson-armor',
    feature: 'Гибкое: +1 к [Уклонению](/rule/evasion)'
  };

  assert.equal(buildEffectiveCharacterStats(character).evasion, character.evasion + 1);

  character.armor = {
    ...character.armor,
    name: 'Латный Доспех',
    sourceSlug: 'full-plate-armor',
    feature: 'Очень тяжёлое: −2 к Уклонению; −1 к Проворности'
  };
  const plateStats = buildEffectiveCharacterStats(character);
  assert.equal(plateStats.evasion, character.evasion - 2);
  assert.equal(plateStats.traits.agility, character.traits.agility - 1);

  character.armor = {
    ...character.armor,
    name: 'Кольчуга Спасителя',
    sourceSlug: 'savior-chainmail',
    feature: 'Сложное: −1 ко всем Характеристикам и Уклонению'
  };
  const saviorStats = buildEffectiveCharacterStats(character);
  assert.equal(saviorStats.evasion, character.evasion - 1);
  assert.equal(saviorStats.traits.knowledge, character.traits.knowledge - 1);

  character.armor = { ...character.armor, name: 'Кожаный Доспех', sourceSlug: 'leather-armor', feature: '' };
  assert.equal(buildEffectiveCharacterStats(character).evasion, character.evasion);

  character.armor = { ...character.armor, feature: '', featureText: '+1 к Уклонению' };
  assert.equal(buildEffectiveCharacterStats(character).evasion, character.evasion + 1);
});

test('conditional armor-slot bonuses do not become permanent armor modifiers', () => {
  assert.deepEqual(
    equipmentFeatureModifiers('Отметьте Ячейку Брони, чтобы получить +2 к Уклонению до конца хода'),
    { armorScoreModifier: 0, evasionModifier: 0, traitModifiers: {} }
  );
  assert.equal(equipmentFeatureModifiers('+2 к Показателю Брони').armorScoreModifier, 2);
});

test('safe passive grammar also applies to a custom pasted feature', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.addSheetCard(character.id, {
    id: 'custom-passive',
    kind: 'custom',
    name: 'Домашнее правило',
    text: 'Получаете постоянный бонус +2 к Уклонению.'
  });
  characterService.configureUsageTracker(character.id, {
    id: 'custom-passive-uses',
    targetKind: 'feature',
    targetId: 'custom-passive',
    max: 1
  });

  let stored = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(stored).evasion, stored.evasion + 2);

  characterService.updateSheetCard(character.id, 'custom-passive', {
    text: 'Получаете постоянный бонус +1 к Уклонению.'
  });
  stored = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(stored).evasion, stored.evasion + 1);

  characterService.removeSheetCard(character.id, 'custom-passive');
  stored = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(stored).evasion, stored.evasion);
  assert.equal(stored.usageTrackers?.some((tracker) => tracker.targetId === 'custom-passive') ?? false, false);
});

test('editing a base track maximum preserves marks allowed by a parsed permanent slot', () => {
  resetAllStores();
  const character = characterService.createCharacter({
    hp: { marked: 0, max: 5 },
    stress: { marked: 0, max: 6 }
  });
  characterService.addSheetCard(character.id, {
    id: 'extra-capacity',
    kind: 'custom',
    name: 'Запас сил',
    text: 'Получите дополнительную ячейку Ран. Получите дополнительную ячейку Стресса.'
  });
  characterService.markSlots(character.id, 'hp', 6);
  characterService.markSlots(character.id, 'stress', 7);

  characterService.updateResourceMax(character.id, 'hp', 4);
  characterService.updateResourceMax(character.id, 'stress', 5);
  const updated = characterService.getCharacter(character.id)!;
  assert.equal(updated.hp.marked, 5);
  assert.equal(updated.stress.marked, 6);
  assert.equal(buildEffectiveCharacterStats(updated).hp.max, 5);
  assert.equal(buildEffectiveCharacterStats(updated).stress.max, 6);
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
