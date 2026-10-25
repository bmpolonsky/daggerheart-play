import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CharacterRollService } from '../../src/services/CharacterRollService';
import { characterRollExperienceSelection } from '../../src/domain/rules/characterRollSelection';

function fixture(connected = false, remoteAccepted = true) {
  const calls: Array<{ kind: string; request: unknown }> = [];
  const record = (kind: string) => (request: unknown): never => {
    calls.push({ kind, request });
    return undefined as never;
  };
  const service = new CharacterRollService({
    dice: { rollAction: record('action'), rollReaction: record('reaction'), rollDamage: record('damage'), rollManualDice: record('manual') },
    session: {
      isConnectedPlayerSession: () => connected,
      submitPlayerRollIntent: async (request) => { calls.push({ kind: 'remote', request }); return remoteAccepted; }
    },
    autoApplyConsequences: () => true
  });
  return { service, calls };
}

const actor = { id: 'actor-explicit', name: 'Rogue' };
const actionOptions = { advantageCount: 2, disadvantageCount: 0, experienceIds: ['sneak'], spendHopeForExperiences: true };

test('local action preserves explicit actor, trait, experiences and cost selection', () => {
  const { service, calls } = fixture();
  service.action(actor, { kind: 'trait', title: 'Sneak', trait: 'agility', difficulty: 15 }, actionOptions, 'action', 'private', 'gm');
  assert.deepEqual(calls, [{ kind: 'action', request: {
    actorId: actor.id, actorName: actor.name, publication: 'private', trait: 'agility', difficulty: 15,
    ...actionOptions, notes: undefined, applyConsequences: true
  } }]);
});

test('connected player sends the same reaction intent and never rolls locally', () => {
  const { service, calls } = fixture(true);
  service.action(actor, { kind: 'card', title: 'Reaction', trait: 'finesse', difficulty: 12, notes: 'card-source' }, actionOptions, 'reaction', 'public', 'player');
  assert.deepEqual(calls, [{ kind: 'remote', request: {
    actorId: actor.id, actorName: actor.name, publication: 'public', intent: {
      type: 'duality', rollType: 'reaction', trait: 'finesse', difficulty: 12, ...actionOptions, notes: 'card-source'
    }
  } }]);
});

test('unassigned player keeps local unbound dice instead of silently dropping the roll', () => {
  const { service, calls } = fixture(true);
  const unassigned = { id: null, name: 'Без персонажа' };
  service.action(unassigned, { kind: 'trait', title: 'Дуальность' }, { ...actionOptions, experienceIds: [] }, 'action', 'public', 'player');
  service.manual(unassigned, { formula: '1d6', label: 'Кости' }, 'public', 'player');
  assert.deepEqual(calls.map((call) => call.kind), ['action', 'manual']);
  assert.equal((calls[0].request as { actorId: string | null }).actorId, null);
  assert.equal((calls[1].request as { actorId: string | null }).actorId, null);
});

test('assigned online player rejection never falls back to an unauthorized local roll', () => {
  const { service, calls } = fixture(true, false);
  service.action(actor, { kind: 'trait', title: 'Action', trait: 'agility' }, actionOptions, 'action', 'public', 'player');
  assert.deepEqual(calls.map((call) => call.kind), ['remote']);
});

test('weapon damage scales once and cannot be dispatched as an action', () => {
  const { service, calls } = fixture();
  service.weaponDamage(actor, { kind: 'weapon', title: 'Dagger', damageFormula: '1d6+3', damageType: 'physical' }, 2, 'public', 'gm');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'damage');
  assert.equal((calls[0].request as { formula: string }).formula, '2d6+3');
});

test('prepared manual dice and damage keep their distinct dispatch and critical setting', () => {
  const { service, calls } = fixture();
  assert.equal(calls.length, 0);
  service.dice(actor, { kind: 'manualDice', title: 'Healing', formula: '1d4+2' }, 'private', 'gm');
  service.dice(actor, { kind: 'damage', title: 'Spell damage', formula: '2d8', damageType: 'magic' }, 'public', 'gm', true);
  assert.deepEqual(calls.map((call) => call.kind), ['manual', 'damage']);
  assert.equal((calls[1].request as { critical: boolean }).critical, true);
});

test('experience preview ignores removed/duplicate selected IDs and accounts for Hope cost', () => {
  const experiences = [{ id: 'sneak', name: 'Sneak', modifier: 2 }, { id: 'scout', name: 'Scout', modifier: 3 }];
  assert.deepEqual(characterRollExperienceSelection(experiences, ['sneak', 'sneak', 'removed'], true, 1), {
    experienceIds: ['sneak'], modifier: 2, hopeCost: 1, canAfford: true
  });
  assert.equal(characterRollExperienceSelection(experiences, ['sneak', 'scout'], true, 1).canAfford, false);
  assert.equal(characterRollExperienceSelection(experiences, ['sneak', 'scout'], false, 0).hopeCost, 0);
});
