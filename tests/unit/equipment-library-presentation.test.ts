import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mapRawEquipmentItem } from '../../src/domain/content/mappers';
import { equipmentLibraryDisplay } from '../../src/domain/content/libraryPresentation';

test('custom armor catalog display hides weapon defaults and translates the fallback type without changing data', () => {
  const armor = mapRawEquipmentItem({
    slug: 'qa-armor', name: 'QA — Лёгкий панцирь', type_slug: 'armor', tier: 1,
    armor_score: 2, base_thresholds: [5, 11], die_num: 1, die_size: 8,
    char_trait: 'agility', range: 'melee', burden: 1
  });
  assert.equal(armor.damageFormula, '1d8');
  const display = equipmentLibraryDisplay(armor);
  assert.equal(display.typeName, 'Броня');
  assert.equal(display.damageFormula, '');
  assert.equal(display.trait, null);
  assert.equal(display.range, '');
  assert.equal(display.burden, null);
  assert.equal(display.armorScore, 2);
  assert.deepEqual(display.baseThresholds, { major: 5, severe: 11 });
  assert.equal(armor.damageFormula, '1d8');
  assert.equal(display.raw, armor.raw);
});

test('non-armor equipment display remains unchanged', () => {
  const weapon = mapRawEquipmentItem({
    slug: 'qa-sword', name: 'QA Sword', type_slug: 'primary-weapon', tier: 1,
    char_trait: 'agility', range: 'melee', burden: 1, die_num: 1, die_size: 8,
    armor_score: 0, base_thresholds: [0, 0]
  });
  const display = equipmentLibraryDisplay(weapon);
  assert.equal(display, weapon);
  assert.equal(display.damageFormula, weapon.damageFormula);
  assert.equal(display.trait, weapon.trait);
  assert.equal(display.range, weapon.range);
  assert.equal(display.burden, weapon.burden);
  assert.equal(display.armorScore, weapon.armorScore);
  assert.equal(display.baseThresholds, weapon.baseThresholds);
});
