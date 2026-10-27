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

test('beastform attack display includes proficiency without changing its base roll formula', () => {
  const character = createCharacter({ proficiency: 2, activeBeastform: {
    slug: 'qa-beast', name: 'QA Звероформа', tier: 1, level: 1,
    evasionModifier: 0, traitType: 'agility', traitBonus: 0,
    attackTrait: 'agility', attackRange: 'Melee', attackFormula: '1d6+2',
    attackDamageType: 'physical', featureText: '', activatedAt: '2026-10-27T09:00:00.000Z'
  } });
  const weapon = buildCharacterSummary(character).weapons[0];
  assert.equal(weapon.damage, '2d6+2');
  assert.equal(weapon.damageFormula, '1d6+2');
  assert.equal(character.activeBeastform?.attackFormula, '1d6+2');
});
