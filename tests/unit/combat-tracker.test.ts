import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAdversary, createEncounterState } from '../../src/domain/rules/factories';
import { createTableScene, createTokenState } from '../../src/domain/tabletop/factories';
import { buildCombatTrackerEntries } from '../../src/ui/vtt/playerView/gmPanel/combatTrackerModel';

test('combat tracker keeps individual adversaries and maps scene tokens', () => {
  const first = createAdversary({
    id: 'adversary-first',
    sourceId: 42,
    sourceName: 'Алая Слизь',
    name: 'Алая Слизь 1',
    tier: 1,
    type: 'Skulk'
  });
  const second = createAdversary({
    ...first,
    id: 'adversary-second',
    name: 'Алая Слизь 2'
  });
  const encounter = {
    ...createEncounterState(),
    adversaries: { [first.id]: first, [second.id]: second },
    order: [first.id, 'missing-adversary', second.id]
  };
  const token = createTokenState(
    { kind: 'adversary', id: second.id },
    { id: 'token-second', hidden: true }
  );
  const scene = createTableScene({ tokens: [token] });

  const entries = buildCombatTrackerEntries(encounter, scene);

  assert.deepEqual(entries.map((entry) => ({
    id: entry.adversary.id,
    tokenId: entry.tokenId,
    hidden: entry.hidden
  })), [
    { id: first.id, tokenId: null, hidden: false },
    { id: second.id, tokenId: token.id, hidden: true }
  ]);
});

test('combat tracker preserves encounter order', () => {
  const leader = createAdversary({
    id: 'leader',
    sourceId: 7,
    sourceName: 'Командир',
    name: 'Командир',
    tier: 2,
    type: 'Leader',
    difficulty: 14
  });
  const solo = createAdversary({
    ...leader,
    id: 'solo',
    name: 'Командир — босс',
    type: 'Solo',
    difficulty: 18
  });
  const encounter = {
    ...createEncounterState(),
    adversaries: { [leader.id]: leader, [solo.id]: solo },
    order: [solo.id, leader.id]
  };

  const entries = buildCombatTrackerEntries(encounter, null);

  assert.deepEqual(entries.map((entry) => entry.adversary.id), [solo.id, leader.id]);
});

test('combat tracker never reassigns another adversary token after a removal', () => {
  const first = createAdversary({ id: 'stable-first', name: 'Страж 1' });
  const second = createAdversary({ id: 'stable-second', name: 'Страж 2' });
  const encounter = {
    ...createEncounterState(),
    adversaries: { [first.id]: first, [second.id]: second },
    order: [first.id, second.id]
  };
  const secondToken = createTokenState(
    { kind: 'adversary', id: second.id },
    { id: 'stable-second-token', x: 777, y: 333 }
  );

  const entries = buildCombatTrackerEntries(encounter, createTableScene({ tokens: [secondToken] }));

  assert.equal(entries[0]?.tokenId, null);
  assert.equal(entries[1]?.tokenId, secondToken.id);
});
