import assert from 'node:assert/strict';
import { test } from 'vitest';
import { applyCharacterPatch, createCharacterPatch, isCharacterPatch, type CharacterPatch } from '../../src/domain/p2p/characterPatch';
import { createCharacter } from '../../src/domain/rules/factories';
import { isPlayerCharacterUpdateMessage } from '../../src/services/SyncService';

test('character patches retain unacknowledged reversals and explicit deletions across JSON persistence', () => {
  const original = createCharacter({ notes: 'До', classSlug: 'bard', portraitUrl: 'portrait' });
  const first = { ...original, notes: 'После', classSlug: undefined };
  const pending = createCharacterPatch(original, first);
  const next = { ...first, notes: 'До', hope: { ...first.hope, value: 5 } };
  const patch: CharacterPatch = JSON.parse(JSON.stringify(createCharacterPatch(first, next, pending)));
  assert.deepEqual(patch, { set: { notes: 'До', hope: next.hope }, unset: ['classSlug'] });
  assert.equal(isCharacterPatch(patch), true);
  const applied = applyCharacterPatch({ ...original, name: 'Имя мастера' }, patch);
  assert.equal(applied.classSlug, undefined);
  assert.equal(applied.name, 'Имя мастера');
  assert.equal(applied.portraitUrl, 'portrait');
  assert.equal(applied.notes, 'До');
  assert.equal(applied.hope.value, 5);
  assert.equal(original.classSlug, 'bard');
  const message = { type: 'playerCharacterUpdate', actorId: original.id, participantId: 'player', revision: 3, updatedAt: 'now', patch };
  assert.equal(isPlayerCharacterUpdateMessage(JSON.parse(JSON.stringify(message))), true);
  assert.equal(isPlayerCharacterUpdateMessage({ ...message, character: original }), false);
});

test('patches cannot write authority fields or prototype keys', () => {
  for (const key of ['id', 'createdAt', 'updatedAt', 'changeHistory', 'playerSyncRevision', 'ruleModifiers', '__proto__', 'constructor', 'prototype']) {
    assert.equal(isCharacterPatch({ set: { [key]: 'spoofed' }, unset: [] }), false);
    assert.equal(isCharacterPatch({ set: {}, unset: [key] }), false);
  }
  assert.equal(isCharacterPatch({ set: [], unset: [] }), false);
  assert.equal(isCharacterPatch({ set: {}, unset: [null] }), false);
});
