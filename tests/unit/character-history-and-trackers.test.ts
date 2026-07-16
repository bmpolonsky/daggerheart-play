import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applySafeCharacterUndo,
  appendCharacterChangeHistory,
  createCharacterChangeRecord,
  diffCharacterChanges
} from '../../src/domain/rules/characterHistory';
import { createCharacter, createDomainCard, createSheetCard } from '../../src/domain/rules/factories';
import {
  createCharacterUsageTracker,
  resetCharacterUsageTrackers,
  updateCharacterUsageTracker
} from '../../src/domain/rules/usageTrackers';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';

test('character history stores actor/time/field diff and safely undoes non-conflicting changes', () => {
  const before = createCharacter({ id: 'history-character', name: 'Before', updatedAt: '2026-01-01T00:00:00.000Z' });
  const after = { ...before, name: 'After', notes: 'New notes', updatedAt: '2026-01-02T00:00:00.000Z' };
  const record = createCharacterChangeRecord(before, after, {
    actor: { id: 'player-1', name: 'Ivan', role: 'player' },
    changedAt: '2026-01-02T00:00:00.000Z',
    summary: 'Identity update'
  });
  assert.ok(record);
  assert.equal(record.actor.role, 'player');
  assert.deepEqual(record.changes.map((change) => change.path.join('.')).sort(), ['name', 'notes']);

  const current = {
    ...after,
    hope: { ...after.hope, value: after.hope.value + 1 },
    changeHistory: [record]
  };
  const undo = applySafeCharacterUndo(current, record.id);
  assert.equal(undo.status, 'applied');
  assert.equal(undo.character.name, 'Before');
  assert.equal(undo.character.notes, '');
  assert.equal(undo.character.hope.value, current.hope.value);
});

test('safe undo refuses to overwrite a later edit to the same field', () => {
  const before = createCharacter({ name: 'Before' });
  const after = { ...before, name: 'After' };
  const record = createCharacterChangeRecord(before, after)!;
  const current = { ...after, name: 'Later', changeHistory: [record] };
  const undo = applySafeCharacterUndo(current, record.id);
  assert.equal(undo.status, 'conflict');
  assert.deepEqual(undo.conflicts, [['name']]);
  assert.equal(undo.character.name, 'Later');
});

test('rapid edits by one actor coalesce into one useful audit entry', () => {
  const actor = { id: 'player-1', name: 'Player', role: 'player' as const };
  const original = createCharacter({ notes: '' });
  const first = { ...original, notes: 'П', updatedAt: '2026-01-01T00:00:00.000Z' };
  const firstRecord = createCharacterChangeRecord(original, first, { actor, changedAt: first.updatedAt });
  const withFirst = appendCharacterChangeHistory(first, firstRecord);
  const second = { ...withFirst, notes: 'Привет', updatedAt: '2026-01-01T00:00:01.000Z' };
  const secondRecord = createCharacterChangeRecord(withFirst, second, { actor, changedAt: second.updatedAt });
  const withSecond = appendCharacterChangeHistory(second, secondRecord);
  const history = withSecond.changeHistory ?? [];

  assert.equal(history.length, 1);
  assert.equal(history[0]!.changes.length, 1);
  assert.equal(history[0]!.changes[0]!.before, '');
  assert.equal(history[0]!.changes[0]!.after, 'Привет');
});

test('CharacterService actor provider audits ordinary mutations and undo creates an inverse record', () => {
  resetAllStores();
  const service = new CharacterService();
  service.setMutationActorProvider(() => ({ id: 'gm-1', name: 'Master', role: 'gm' }));
  const character = service.createCharacter({ name: 'Original' });
  service.updateIdentity(character.id, { name: 'Edited' });
  const edit = service.getCharacter(character.id)?.changeHistory?.at(-1);
  assert.equal(edit?.actor.id, 'gm-1');
  assert.equal(edit?.changes.some((change) => change.path.join('.') === 'name'), true);

  const undo = service.undoChange(character.id, edit!.id, { id: 'gm-1', name: 'Master', role: 'gm' });
  assert.equal(undo?.status, 'applied');
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.name, 'Original');
  assert.equal(updated.changeHistory?.at(-1)?.undoesChangeId, edit?.id);
});

test('trusted full player updates ignore client audit history and produce one authority record', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ name: 'Before' });
  const forged = createCharacterChangeRecord(character, { ...character, name: 'Forged' })!;
  const next = { ...character, name: 'Player edit', notes: 'Changed', changeHistory: [forged] };
  assert.equal(service.applyTrustedPlayerUpdate(character.id, next, { id: 'player-1', name: 'Player', role: 'player' }), true);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.name, 'Player edit');
  assert.equal(updated.changeHistory?.length, 1);
  assert.equal(updated.changeHistory?.[0]?.actor.id, 'player-1');
  assert.notEqual(updated.changeHistory?.[0]?.id, forged.id);
  assert.equal(service.applyTrustedPlayerUpdate(character.id, next, { id: 'gm', name: 'GM', role: 'gm' }), false);
});

test('trusted player updates reject duplicate and out-of-order revisions from the same participant', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ name: 'Before' });
  const actor = { id: 'player-1', name: 'Player', role: 'player' as const };

  assert.equal(service.applyTrustedPlayerUpdate(
    character.id,
    { ...character, name: 'Revision 2' },
    actor,
    { participantId: actor.id, revision: 2 }
  ), true);
  assert.equal(service.applyTrustedPlayerUpdate(
    character.id,
    { ...character, name: 'Stale revision 1' },
    actor,
    { participantId: actor.id, revision: 1 }
  ), false);
  assert.equal(service.applyTrustedPlayerUpdate(
    character.id,
    { ...character, name: 'Duplicate revision 2' },
    actor,
    { participantId: actor.id, revision: 2 }
  ), false);

  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.name, 'Revision 2');
  assert.deepEqual(updated.playerSyncRevision, { participantId: actor.id, revision: 2 });
  assert.equal(updated.changeHistory?.length, 1);
});

test('audit treats JSON-stripped optional undefined fields as unchanged', () => {
  const before = createCharacter({
    notes: 'Before',
    domainCards: [createDomainCard({ id: 'transport-card', name: 'Transport card' })]
  });
  const transported = JSON.parse(JSON.stringify(before)) as typeof before;
  const normalizedAfter = createCharacter({ ...transported, notes: 'After' });
  const record = createCharacterChangeRecord(before, normalizedAfter);
  assert.ok(record);
  assert.deepEqual(record.changes.map((change) => change.path.join('.')), ['notes']);
});

test('generic usage trackers target cards/features, clamp updates and reset by rest cadence', () => {
  const short = createCharacterUsageTracker({
    id: 'short', targetKind: 'card', targetId: 'card', label: 'Once per rest', current: 1, max: 1, reset: 'short'
  });
  const long = createCharacterUsageTracker({
    id: 'long', targetKind: 'feature', targetId: 'feature', current: 2, max: 2, reset: 'long'
  });
  const manual = createCharacterUsageTracker({
    id: 'manual', targetKind: 'feature', targetId: 'feature', current: 3, max: 3, reset: 'manual'
  });
  const updated = updateCharacterUsageTracker([short, long, manual], 'short', { current: 99, max: 2 });
  assert.deepEqual(updated.find((tracker) => tracker.id === 'short') && {
    current: updated[0].current, max: updated[0].max
  }, { current: 2, max: 2 });
  assert.deepEqual(resetCharacterUsageTrackers(updated, 'short').map((tracker) => tracker.current), [0, 2, 3]);
  assert.deepEqual(resetCharacterUsageTrackers(updated, 'long').map((tracker) => tracker.current), [0, 0, 3]);
});

test('CharacterService only configures trackers for real targets and audits updates/resets', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    domainCards: [createDomainCard({ id: 'chaos', name: 'Unleash Chaos' })],
    sheetCards: [createSheetCard({ id: 'feature', kind: 'subclassFeature', name: 'Perfect Recall' })]
  });
  assert.equal(service.configureUsageTracker(character.id, {
    targetKind: 'card', targetId: 'missing', max: 1
  }), null);
  const tracker = service.configureUsageTracker(character.id, {
    id: 'once-rest', targetKind: 'feature', targetId: 'feature', current: 1, max: 1, reset: 'short'
  }, { actor: { id: 'player', name: 'Player', role: 'player' } });
  assert.equal(tracker?.id, 'once-rest');
  assert.equal(service.resetUsageTrackersForRest(character.id, 'short'), 1);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.usageTrackers?.[0]?.current, 0);
  assert.equal(updated.changeHistory?.at(-1)?.kind, 'tracker');
  assert.equal(diffCharacterChanges(character, updated).some((change) => change.path[0] === 'usageTrackers'), true);
});

test('legacy characters normalize optional audit, tracker and advancement fields compatibly', () => {
  const character = createCharacter({
    changeHistory: undefined,
    usageTrackers: undefined,
    advancement: undefined,
    domainCards: [createDomainCard({ id: 'permanent', permanentlyVaulted: true, inLoadout: true })]
  });
  assert.deepEqual(character.changeHistory, []);
  assert.deepEqual(character.usageTrackers, []);
  assert.deepEqual(character.advancement, { choiceUsesByRank: {}, markedTraits: [], multiclass: null });
  assert.equal(character.domainCards[0].inLoadout, false);
});
