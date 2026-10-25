import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCharacter, createInventoryItem, createWeapon, sanitizeInventory } from '../../src/domain/rules/factories';
import { planEquipWeapon, planUnequipWeapon } from '../../src/domain/rules/weaponInventory';
import { CharacterService } from '../../src/services/CharacterService';
import { charactersStore, resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { createGameDocument, gameDocumentToPersistedState } from '../../src/domain/game/gameDocument';

const weapon = createWeapon({
  id: 'weapon-custom-qa', name: 'QA Runed Sword', sourceId: 'custom-source', sourceSlug: 'qa-runed-sword',
  category: 'secondary', trait: 'finesse', range: 'Close', damageFormula: '2d8+3', damageType: 'mixed',
  burden: 'one-handed', featureText: 'Собственное свойство +1', notes: 'Личная заметка'
});

test('unequip and re-equip preserve every weapon field through sanitization and game export/import', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ weapons: [weapon], inventory: [] });
  assert.equal(service.unequipWeapon(character.id, weapon.id).applied, true);
  let stored = service.getCharacter(character.id)!;
  assert.equal(stored.weapons.length, 0);
  assert.equal(stored.inventory.length, 1);
  assert.deepEqual(stored.inventory[0].weapon, weapon);
  assert.equal(stored.inventory[0].quantity, 1);
  const stowedItem = stored.inventory[0];
  service.updateInventoryItem(character.id, stowedItem.id, { name: 'Lossy generic edit', quantity: 0, sourceSlug: '' });
  service.adjustInventoryQuantity(character.id, stowedItem.id, -1);
  service.useInventoryItem(character.id, stowedItem.id);
  assert.deepEqual(service.getCharacter(character.id)!.inventory[0], stowedItem);
  assert.deepEqual(sanitizeInventory(stored.inventory)[0].weapon, weapon);
  const document = createGameDocument(snapshotPersistedState());
  const imported = gameDocumentToPersistedState(JSON.parse(JSON.stringify(document)));
  stored = createCharacter(imported.characters.entities[character.id]);
  assert.deepEqual(stored.inventory[0].weapon, weapon);
  charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [stored.id]: stored } }));
  assert.equal(service.equipInventoryWeapon(character.id, stored.inventory[0].id).applied, true);
  const equipped = service.getCharacter(character.id)!;
  assert.deepEqual(equipped.weapons, [weapon]);
  assert.equal(equipped.inventory.length, 0);
});

test('repeated transfers and duplicate identity never create a second equipped or stored copy', () => {
  let character = createCharacter({ weapons: [weapon], inventory: [] });
  const unequip = planUnequipWeapon(character, weapon.id);
  assert.equal(unequip.applied, true);
  if (!unequip.applied) return;
  character = unequip.character;
  assert.equal(planUnequipWeapon(character, weapon.id).applied, false);
  const itemId = character.inventory[0].id;
  const equip = planEquipWeapon(character, itemId);
  assert.equal(equip.applied, true);
  if (!equip.applied) return;
  assert.equal(planEquipWeapon(equip.character, itemId).applied, false);
  const duplicate = { ...character, weapons: [weapon] };
  const before = JSON.stringify(duplicate);
  assert.equal(planEquipWeapon(duplicate, itemId).applied, false);
  assert.equal(JSON.stringify(duplicate), before);
});

test('two-handed conflict leaves the original inventory item intact and never swaps other equipment', () => {
  const heavy = createWeapon({ ...weapon, id: 'heavy', name: 'QA Heavy', category: 'primary', burden: 'two-handed' });
  const character = createCharacter({ weapons: [weapon], inventory: [createInventoryItem({ id: 'heavy-item', name: heavy.name, weapon: heavy })] });
  const before = JSON.stringify(character);
  const rejected = planEquipWeapon(character, 'heavy-item');
  assert.equal(rejected.applied, false);
  assert.equal(JSON.stringify(character), before);
  const stowed = planUnequipWeapon(character, weapon.id);
  assert.equal(stowed.applied, true);
  if (!stowed.applied) return;
  const equipped = planEquipWeapon(stowed.character, 'heavy-item');
  assert.equal(equipped.applied, true);
  if (!equipped.applied) return;
  assert.deepEqual(equipped.character.weapons, [heavy]);
  assert.deepEqual(equipped.character.inventory[0].weapon, weapon);
  assert.equal(planEquipWeapon(equipped.character, equipped.character.inventory[0].id).applied, false);
});

test('legacy item names never become weapons and malformed transfer requests leave the item unchanged', () => {
  const legacy = createInventoryItem({ name: weapon.name, text: weapon.featureText });
  assert.equal(legacy.weapon, undefined);
  const character = createCharacter({ weapons: [], inventory: [legacy] });
  const before = JSON.stringify(character);
  assert.equal(planEquipWeapon(character, legacy.id).applied, false);
  assert.equal(JSON.stringify(character), before);
  assert.equal(createInventoryItem({ name: 'Stored', quantity: 70, weapon }).quantity, 1);
  const malformed = { id: 'incomplete', name: 'Imported broken weapon', notes: 'Keep this metadata' } as typeof weapon;
  const imported = createCharacter(JSON.parse(JSON.stringify({ ...character, inventory: [{ id: 'broken', name: 'Invalid', quantity: 1, weapon: malformed }] })));
  assert.deepEqual(imported.inventory[0].weapon, malformed);
  const malformedBefore = JSON.stringify(imported);
  assert.equal(planEquipWeapon(imported, 'broken').applied, false);
  assert.equal(JSON.stringify(imported), malformedBefore);
});

test('known hand capacity and primary/secondary slots reject conflicting equipment without mutation', () => {
  const primary = createWeapon({ ...weapon, id: 'primary', category: 'primary' });
  const secondary = createWeapon({ ...weapon, id: 'secondary', category: 'secondary' });
  for (const equipped of [[primary, secondary], [secondary]]) {
    const character = createCharacter({ weapons: equipped, inventory: [createInventoryItem({ id: 'candidate', name: weapon.name, weapon })] });
    const before = JSON.stringify(character);
    assert.equal(planEquipWeapon(character, 'candidate').applied, false);
    assert.equal(JSON.stringify(character), before);
  }
  const primaryConflict = createCharacter({ weapons: [primary], inventory: [createInventoryItem({ id: 'candidate-primary', weapon: { ...weapon, category: 'primary' } })] });
  assert.equal(planEquipWeapon(primaryConflict, 'candidate-primary').applied, false);
  const customAttack = createWeapon({ id: 'claws', category: 'custom', burden: null });
  const character = createCharacter({ weapons: [customAttack], inventory: [createInventoryItem({ id: 'candidate', weapon })] });
  assert.equal(planEquipWeapon(character, 'candidate').applied, true);
});
