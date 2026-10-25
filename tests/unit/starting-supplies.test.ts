import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildStartingEquipmentLoadout } from '../../src/domain/rules/equipment';
import { createCharacter, createInventoryItem } from '../../src/domain/rules/factories';

test('generated basic supplies have an app-authored description without changing custom class items', () => {
  const loadout = buildStartingEquipmentLoadout({
    className: 'Custom',
    equipment: [],
    classItems: ['Мои дорожные припасы'],
    traits: { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 }
  });
  const supplies = loadout.inventory.find((item) => item.name === 'Основные припасы');
  assert.equal(supplies?.text, 'Базовые припасы из стартового снаряжения. Состав уточняется с мастером.');
  const custom = loadout.inventory.find((item) => item.name === 'Мои дорожные припасы');
  assert.equal(custom?.name, 'Мои дорожные припасы');
  assert.equal(custom?.text, '');
});

test('default character supplies use the same text without rewriting supplied inventory', () => {
  const character = createCharacter();
  const supplies = character.inventory.find((item) => item.name === 'Основные припасы');
  assert.equal(supplies?.text, 'Базовые припасы из стартового снаряжения. Состав уточняется с мастером.');
  const authored = createInventoryItem({ name: 'Основные припасы', text: 'Мой список припасов.' });
  assert.equal(createCharacter({ inventory: [authored] }).inventory[0].text, 'Мой список припасов.');
  const savedBlank = createInventoryItem({ name: 'Основные припасы' });
  assert.equal(createCharacter({ inventory: [savedBlank] }).inventory[0].text, '');
});
