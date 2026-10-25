import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCharacter, createWeapon } from '../../src/domain/rules/factories';
import { buildCharacterSummary } from '../../src/domain/tabletop/playerView';

test('weapon display includes proficiency while the roll keeps its base formula', () => {
  for (const proficiency of [1, 2, 3]) {
    const character = createCharacter({
      proficiency,
      weapons: [createWeapon({ damageFormula: '1d6+3' })]
    });
    const weapon = buildCharacterSummary(character).weapons[0];
    assert.equal(weapon.damage, `${proficiency}d6+3`);
    assert.equal(weapon.damageFormula, '1d6+3');
    assert.equal(character.weapons[0].damageFormula, '1d6+3');
  }
});

test('weapon display scales each dice term and preserves flat modifiers', () => {
  const character = createCharacter({
    proficiency: 2,
    weapons: [createWeapon({ damageFormula: '2d6+1d4-3' })]
  });
  const weapon = buildCharacterSummary(character).weapons[0];
  assert.equal(weapon.damage, '4d6+2d4-3');
  assert.equal(weapon.damageFormula, '2d6+1d4-3');
});
