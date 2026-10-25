import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCharacter, sanitizeWealth } from '../../src/domain/rules/factories';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';
import { formatWealthSummary } from '../../src/domain/rules/wealthPresentation';
import type { CharacterWealth } from '../../src/domain/rules/types';

test('wealth preserves 9, 10 and 70 in each denomination without converting the others', () => {
  for (const field of ['coins', 'handfuls', 'bags', 'chests'] as const) {
    for (const amount of [9, 10, 70]) {
      const wealth: CharacterWealth = { coins: 0, handfuls: 0, bags: 0, chests: 0, [field]: amount };
      assert.deepEqual(sanitizeWealth(wealth), wealth);
      const character = createCharacter({ wealth });
      assert.deepEqual(createCharacter(JSON.parse(JSON.stringify(character))).wealth, wealth);
    }
  }
});

test('Library edits survive character service update and serialized reopening without silent loss', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ wealth: { coins: 0, handfuls: 9, bags: 0, chests: 0 } });
  for (const handfuls of [10, 70]) {
    service.updateWealth(character.id, { handfuls });
    const reopened = createCharacter(JSON.parse(JSON.stringify(service.getCharacter(character.id))));
    assert.deepEqual(reopened.wealth, { coins: 0, handfuls, bags: 0, chests: 0 });
    assert.equal(formatWealthSummary(reopened.wealth), `Горсти: ${handfuls}`);
  }
});

test('wealth still normalizes invalid, negative and fractional quantities', () => {
  assert.deepEqual(sanitizeWealth({ coins: Number.NaN, handfuls: -10, bags: 10.9, chests: Number.POSITIVE_INFINITY }), {
    coins: 0, handfuls: 0, bags: 10, chests: 0
  });
  assert.deepEqual(sanitizeWealth(null), { coins: 0, handfuls: 0, bags: 0, chests: 0 });
  assert.equal(sanitizeWealth({ coins: 1e100 }).coins, Number.MAX_SAFE_INTEGER);
});
