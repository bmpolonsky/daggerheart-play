import { test } from 'vitest';
import assert from 'node:assert/strict';
import { storedWeaponPresentation } from '../../src/domain/rules/storedWeaponPresentation';
import { createWeapon } from '../../src/domain/rules/factories';

const weapon = createWeapon({
  id: 'stored-runed-dagger', name: 'Рунный кинжал', category: 'secondary', trait: 'finesse',
  range: 'Far', damageFormula: '1d6+3', damageType: 'magic', burden: 'one-handed',
  featureText: 'Собственное свойство: +1 к проверке.', notes: 'Личная заметка.',
  sourceId: 42, sourceSlug: 'custom-runed-dagger'
});

test('stored weapon projection shows raw base damage and nested metadata without scaling or mutation', () => {
  const item = { name: 'Несовпадающее общее имя', sourceId: 'outer-source', sourceSlug: 'outer-slug', text: 'Не данные оружия.', weapon };
  const before = JSON.stringify(item);
  const display = storedWeaponPresentation(item)!;
  assert.equal(display.baseDamageFormula, '1d6+3');
  assert.equal(display.traitLabel, 'Искусность');
  assert.equal(display.rangeLabel, 'Далёкая');
  assert.equal(display.damageType, 'magic');
  assert.equal(display.damageTypeLabel, 'Магический');
  assert.equal(display.properties, weapon.featureText);
  assert.equal(display.notes, weapon.notes);
  assert.equal(display.sourceId, 42);
  assert.equal(display.sourceSlug, 'custom-runed-dagger');
  assert.match(display.description, /Базовый урон: 1d6\+3/);
  assert.match(display.description, /Собственное свойство/);
  assert.match(display.sourceLabel ?? '', /42.*custom-runed-dagger/);
  assert.equal(display.description.includes('outer-source'), false);
  assert.equal(display.description.includes('2d6+3'), false);
  assert.equal(JSON.stringify(item), before);
});

test('ordinary inventory names, descriptions and invalid nested payloads never imply a weapon', () => {
  for (const item of [null, [], {}, { name: 'Рунный кинжал', text: '1d6+3 Магический', sourceSlug: 'custom-runed-dagger' },
    { weapon: { name: 'Рунный кинжал', damageFormula: '1d6+3' } },
    { weapon: { ...weapon, trait: 'unknown' } }, { weapon: { ...weapon, damageType: 'unknown' } }]) {
    assert.equal(storedWeaponPresentation(item), null);
  }
});

test('missing source references stay absent and unfamiliar stored ranges remain literal', () => {
  const withoutSource = { ...weapon, sourceId: undefined, sourceSlug: undefined, range: 'Особая дистанция автора', featureText: '', notes: undefined };
  const display = storedWeaponPresentation({ weapon: withoutSource })!;
  assert.equal(display.sourceId, undefined);
  assert.equal(display.sourceSlug, undefined);
  assert.equal(display.sourceLabel, undefined);
  assert.equal(display.rangeLabel, 'Особая дистанция автора');
  assert.equal(display.properties, '');
  assert.equal(display.description.includes('Источник:'), false);
});
