import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mapRawEquipmentItem } from '../../src/domain/content/mappers';
import { armorCatalogSelectionId, equipmentItemToArmorOption } from '../../src/domain/rules/equipment';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';

function armorItem(id: string, name = 'Одинаковое имя') {
  return mapRawEquipmentItem({ id, slug: id, name, type_slug: 'armor', tier: 1, armor_score: 4, base_thresholds: [7, 15], features: [] });
}

test('armor catalog selection uses source identity and never picks an arbitrary duplicate name', () => {
  const first = armorItem('core-armor');
  const custom = armorItem('custom-armor');
  const armor = { name: first.name, baseMajor: 1, baseSevere: 2, score: 1, markedSlots: 0 };
  assert.equal(armorCatalogSelectionId([first, custom], { ...armor, sourceId: custom.sourceId }), custom.id);
  assert.equal(armorCatalogSelectionId([first, custom], { ...armor, sourceSlug: custom.slug }), custom.id);
  assert.equal(armorCatalogSelectionId([first, custom], armor), '');
  assert.equal(armorCatalogSelectionId([custom], armor), custom.id);
  assert.equal(armorCatalogSelectionId([custom], { ...armor, sourceId: 'missing' }), '');
});

test('custom armor replacement owns its name, source and property while same-item reselect retains marks', () => {
  resetAllStores();
  const service = new CharacterService();
  const old = armorItem('old', 'Старые латы');
  const custom = armorItem('custom', 'Свой доспех');
  const character = service.createCharacter();
  assert.equal(service.replaceArmorFromEquipment(character.id, old).applied, true);
  service.updateArmor(character.id, { markedSlots: 3, feature: '-2 to Evasion', featureText: '-2 to Evasion' }, false);
  assert.equal(service.replaceArmorFromEquipment(character.id, custom).applied, true);
  let current = service.getCharacter(character.id)!;
  assert.equal(current.armor.name, custom.name);
  assert.equal(current.armor.sourceId, custom.sourceId);
  assert.equal(current.armor.sourceSlug, custom.slug);
  assert.equal(current.armor.feature, '');
  assert.equal(current.armor.featureText, '');
  assert.equal(current.armor.markedSlots, 0);
  service.updateArmor(character.id, { markedSlots: 2 }, false);
  assert.equal(service.replaceArmorFromEquipment(character.id, { ...custom, name: 'Переименованный свой доспех', featureText: '+1 to Evasion' }).applied, true);
  current = service.getCharacter(character.id)!;
  assert.equal(current.armor.markedSlots, 2);
  assert.equal(current.armor.name, 'Переименованный свой доспех');
  assert.equal(current.armor.feature, '+1 to Evasion');
});

test('explicit custom replacement clears omitted old provenance and rejects incomplete catalog armor without mutation', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ armor: { name: 'Old', sourceId: 'old', sourceSlug: 'old', tier: 2, score: 4, markedSlots: 2, baseMajor: 6, baseSevere: 12, feature: 'Old property', featureText: 'Old property' } });
  service.replaceArmor(character.id, { name: 'Custom without source', score: 2, markedSlots: 0, baseMajor: 3, baseSevere: 6 });
  const current = service.getCharacter(character.id)!;
  assert.equal(current.armor.sourceId, undefined);
  assert.equal(current.armor.sourceSlug, undefined);
  assert.equal(current.armor.tier, null);
  assert.equal(current.armor.feature, '');
  const invalid = { ...armorItem('invalid'), tier: null };
  assert.equal(equipmentItemToArmorOption(invalid), null);
  const result = service.replaceArmorFromEquipment(character.id, invalid);
  assert.equal(result.applied, false);
  assert.ok(result.message?.includes('проверьте'));
  assert.deepEqual(service.getCharacter(character.id), current);
});
