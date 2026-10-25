import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCharacter, createDomainCard, createSheetCard } from '../../src/domain/rules/factories';
import { buildEffectiveCharacterStats } from '../../src/domain/rules/effects';

const armor = { name: 'Heavy armor', baseMajor: 7, baseSevere: 16, score: 4, markedSlots: 3, feature: '-2 to Evasion' };

test('legacy armor remains equipped and unequipped armor uses level thresholds without armor penalties', () => {
  for (const level of [1, 3, 10]) {
    const character = createCharacter({ level, armor });
    const equipped = buildEffectiveCharacterStats(character);
    assert.equal(equipped.armorScore, 4);
    assert.deepEqual(equipped.thresholds, { major: 7 + level, severe: 16 + level });
    assert.equal(equipped.evasion, character.evasion - 2);
    character.armor.equipped = false;
    const unequipped = buildEffectiveCharacterStats(character);
    assert.equal(unequipped.armorScore, 0);
    assert.deepEqual(unequipped.thresholds, { major: level, severe: 2 * level });
    assert.equal(unequipped.evasion, character.evasion);
    assert.equal(character.armor.markedSlots, 3);
  }
});

test('unarmored characters retain non-armor modifiers and total Armor Score cap', () => {
  const character = createCharacter({
    armor: { ...armor, equipped: false },
    sheetCards: [createSheetCard({ kind: 'ancestryFeature', text: 'Получите бонус +1 к вашему Показателю Брони и Порогам Урона.' })]
  });
  const stats = buildEffectiveCharacterStats(character);
  assert.equal(stats.armorScore, 1);
  assert.deepEqual(stats.thresholds, { major: 2, severe: 3 });
});

test('Bare Bones supplies unarmored base armor and tier thresholds, only while in the loadout', () => {
  for (const [level, baseMajor, baseSevere] of [[1, 9, 19], [3, 11, 24], [6, 13, 31], [10, 15, 38]]) {
    const character = createCharacter({
      level,
      armor: { ...armor, equipped: false },
      traits: { agility: 0, strength: 2, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
      domainCards: [createDomainCard({ sourceId: 'domain-card:bare-bones', name: 'Ничего лишнего', inLoadout: true })]
    });
    let stats = buildEffectiveCharacterStats(character);
    assert.equal(stats.armorScore, 5);
    assert.deepEqual(stats.thresholds, { major: baseMajor + level, severe: baseSevere + level });
    character.domainCards[0].inLoadout = false;
    stats = buildEffectiveCharacterStats(character);
    assert.equal(stats.armorScore, 0);
    assert.deepEqual(stats.thresholds, { major: level, severe: 2 * level });
    character.domainCards[0].inLoadout = true;
    character.armor.equipped = true;
    stats = buildEffectiveCharacterStats(character);
    assert.equal(stats.armorScore, 4);
  }
});

test('Bare Bones uses effective Strength and caps the resulting Armor Score at twelve', () => {
  const character = createCharacter({
    armor: { ...armor, equipped: false },
    traits: { agility: 0, strength: 9, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
    sheetCards: [createSheetCard({ kind: 'communityFeature', text: 'Получите постоянный бонус +1 к вашей Силе.' })],
    domainCards: [createDomainCard({ name: 'Bare Bones', inLoadout: true })]
  });
  assert.equal(buildEffectiveCharacterStats(character).traits.strength, 10);
  assert.equal(buildEffectiveCharacterStats(character).armorScore, 12);
});
