import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';
import { buildEffectiveCharacterStats } from '../../src/domain/rules/effects';
import { createCharacter } from '../../src/domain/rules/factories';

test('armor toggle preserves the same item, marks, inventory and equipped thresholds through hydration', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    level: 3,
    armor: { name: 'Plate', sourceId: 123, score: 5, markedSlots: 4, baseMajor: 8, baseSevere: 17, feature: '-1 to Agility' }
  });
  const original = service.getCharacter(character.id)!;
  service.setArmorEquipped(character.id, false);
  let stored = service.getCharacter(character.id)!;
  assert.deepEqual(stored.armor, { ...original.armor, equipped: false });
  assert.deepEqual(stored.inventory, original.inventory);
  assert.deepEqual(stored.thresholds, original.thresholds);
  assert.deepEqual(buildEffectiveCharacterStats(stored).thresholds, { major: 3, severe: 6 });
  stored = createCharacter(JSON.parse(JSON.stringify(stored)));
  assert.equal(stored.armor.equipped, false);
  assert.equal(stored.armor.markedSlots, 4);
  service.updateArmor(character.id, { name: 'Plate repaired name' });
  assert.equal(service.getCharacter(character.id)!.armor.markedSlots, 4);
  service.setArmorEquipped(character.id, true);
  stored = service.getCharacter(character.id)!;
  assert.equal(stored.armor.sourceId, 123);
  assert.equal(stored.armor.markedSlots, 4);
  assert.equal(buildEffectiveCharacterStats(stored).armorScore, 5);
  assert.deepEqual(buildEffectiveCharacterStats(stored).thresholds, original.thresholds);
});
