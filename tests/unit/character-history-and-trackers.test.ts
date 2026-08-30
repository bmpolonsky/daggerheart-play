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
  addMissingAutomaticUsageTrackers,
  automaticUsageTrackerCandidates,
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

test('one explicit edit session stays one undoable record even when edits are far apart', () => {
  const actor = { id: 'gm-1', name: 'Master', role: 'gm' as const };
  const original = createCharacter({ name: 'Before', notes: '' });
  const first = { ...original, name: 'After', updatedAt: '2026-01-01T00:00:00.000Z' };
  const firstRecord = createCharacterChangeRecord(original, first, {
    actor,
    changedAt: first.updatedAt,
    historyGroupId: 'edit-session'
  });
  const withFirst = appendCharacterChangeHistory(first, firstRecord);
  const second = { ...withFirst, notes: 'Session note', updatedAt: '2026-01-01T00:30:00.000Z' };
  const secondRecord = createCharacterChangeRecord(withFirst, second, {
    actor,
    changedAt: second.updatedAt,
    historyGroupId: 'edit-session'
  });
  const withSecond = appendCharacterChangeHistory(second, secondRecord);

  assert.equal(withSecond.changeHistory?.length, 1);
  assert.deepEqual(withSecond.changeHistory?.[0]?.changes.map((change) => change.path.join('.')).sort(), ['name', 'notes']);
});

test('two explicit edit sessions never coalesce even when they happen immediately', () => {
  const original = createCharacter({ name: 'Before', notes: '' });
  const first = { ...original, name: 'After', updatedAt: '2026-01-01T00:00:00.000Z' };
  const withFirst = appendCharacterChangeHistory(first, createCharacterChangeRecord(original, first, {
    changedAt: first.updatedAt,
    historyGroupId: 'first-session'
  }));
  const second = { ...withFirst, notes: 'Separate edit', updatedAt: '2026-01-01T00:00:01.000Z' };
  const withSecond = appendCharacterChangeHistory(second, createCharacterChangeRecord(withFirst, second, {
    changedAt: second.updatedAt,
    historyGroupId: 'second-session'
  }));
  assert.equal(withSecond.changeHistory?.length, 2);
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

test('trusted player level-up is labeled as level-up in authority history', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ level: 1 });
  const next = createCharacter({ ...character, level: 2, changeHistory: [] });
  assert.equal(service.applyTrustedPlayerUpdate(character.id, next, { id: 'player-1', name: 'Player', role: 'player' }), true);
  const record = service.getCharacter(character.id)?.changeHistory?.at(-1);
  assert.equal(record?.kind, 'levelUp');
  assert.equal(record?.summary, 'Повышение до 2 уровня');
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
  const structuralHistoryLength = service.getCharacter(character.id)?.changeHistory?.length;
  assert.equal(tracker?.id, 'once-rest');
  assert.equal(service.resetUsageTrackersForRest(character.id, 'short'), 1);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.usageTrackers?.[0]?.current, 0);
  assert.equal(updated.changeHistory?.at(-1)?.kind, 'tracker');
  assert.equal(updated.changeHistory?.length, structuralHistoryLength);
  assert.equal(diffCharacterChanges(character, updated).some((change) => change.path[0] === 'usageTrackers'), true);
});

test('CharacterService creates safe usage trackers on acquisition, supports several per target and removes orphans', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    domainCards: [createDomainCard({
      id: 'book',
      name: 'Книга',
      text: 'Один раз до следующего отдыха откройте проход. Один раз до следующего продолжительного отдыха откройте врата.'
    })],
    usageTrackers: [{ id: 'manual-book-short', targetKind: 'card', targetId: 'book', label: 'Мой счётчик', current: 0, max: 1, reset: 'short' }]
  });
  assert.deepEqual(service.getCharacter(character.id)?.usageTrackers?.map((tracker) => [tracker.targetId, tracker.reset]), [
    ['book', 'short'], ['book', 'long']
  ]);

  const removedId = service.getCharacter(character.id)!.usageTrackers![0]!.id;
  assert.equal(service.removeUsageTracker(character.id, removedId), true);
  service.addDomainCard(character.id, createDomainCard({ id: 'other', name: 'Без лимита', text: 'Получите преимущество.' }));
  assert.equal(service.getCharacter(character.id)?.usageTrackers?.some((tracker) => tracker.id === removedId), false, 'deleted tracker must not resurrect');

  service.addInventoryItem(character.id, { id: 'amulet', name: 'Амулет', kind: 'item', text: 'Один раз за продолжительный отдых активируйте амулет.' });
  assert.equal(service.getCharacter(character.id)?.usageTrackers?.some((tracker) => tracker.targetKind === 'inventory' && tracker.targetId === 'amulet'), true);
  service.addInventoryItem(character.id, { id: 'potion', name: 'Зелье', kind: 'consumable', uses: { current: 1, max: 1 }, text: 'Один раз за продолжительный отдых.' });
  assert.equal(service.getCharacter(character.id)?.usageTrackers?.some((tracker) => tracker.targetId === 'potion'), false, 'dedicated uses must not get a second tracker');

  service.updateArmor(character.id, { name: 'Обычная броня', sourceSlug: 'plain', featureText: 'Гибкая: +1 к Уклонению.' });
  assert.equal(service.getCharacter(character.id)?.usageTrackers?.some((tracker) => tracker.targetKind === 'armor'), false);
  service.updateArmor(character.id, { name: 'Драконья броня', sourceSlug: 'dragon', featureText: 'Один раз за короткий отдых уменьшите урон.' });
  assert.equal(service.getCharacter(character.id)?.usageTrackers?.some((tracker) => tracker.targetKind === 'armor' && tracker.reset === 'short'), true);

  service.removeInventoryItem(character.id, 'amulet');
  service.removeDomainCard(character.id, 'book');
  const finalTrackers = service.getCharacter(character.id)?.usageTrackers ?? [];
  assert.equal(finalTrackers.some((tracker) => tracker.targetId === 'amulet' || tracker.targetId === 'book'), false);
});

test('automatic tracker matching is one-to-one and content edits preserve manual tracker state', () => {
  const [candidate] = automaticUsageTrackerCandidates({
    targetKind: 'card', targetId: 'duplicates', targetName: 'Два лимита', text: 'Один раз за короткий отдых.'
  });
  assert.ok(candidate);
  assert.equal(addMissingAutomaticUsageTrackers([], [candidate, {
    ...candidate,
    tracker: { ...candidate.tracker, id: `${candidate.tracker.id}-second` }
  }]).length, 2);

  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    domainCards: [createDomainCard({ id: 'editable-card', name: 'Карта', text: 'Один раз за короткий отдых получите преимущество.' })],
    sheetCards: [createSheetCard({ id: 'editable-feature', kind: 'custom', name: 'Свойство', text: 'Один раз за короткий отдых получите преимущество.' })]
  });
  service.addInventoryItem(character.id, { id: 'editable-item', name: 'Предмет', kind: 'item', text: 'Один раз за короткий отдых получите преимущество.' });
  service.updateArmor(character.id, { name: 'Драконья броня', sourceSlug: 'dragon', featureText: 'Один раз за короткий отдых уменьшите урон.' });
  const armorAuto = service.getCharacter(character.id)!.usageTrackers!.find((tracker) => tracker.targetKind === 'armor')!;
  service.updateUsageTracker(character.id, armorAuto.id, { current: 1 });
  service.configureUsageTracker(character.id, { id: 'manual-armor', targetKind: 'armor', targetId: 'armor', label: 'Ручной', max: 7 });

  service.updateDomainCard(character.id, 'editable-card', { text: 'Три раза за продолжительный отдых получите преимущество.' });
  service.updateSheetCard(character.id, 'editable-feature', { text: 'Два раза за продолжительный отдых получите преимущество.' });
  service.updateInventoryItem(character.id, 'editable-item', { text: 'Три раза за продолжительный отдых получите преимущество.' });
  service.updateArmor(character.id, { featureText: 'Один раз за короткий отдых уменьшите урон. Затем опишите результат.' }, false);

  const trackers = service.getCharacter(character.id)!.usageTrackers!;
  assert.deepEqual(trackers.filter((tracker) => tracker.targetKind === 'card').map((tracker) => [tracker.max, tracker.reset]), [[3, 'long']]);
  assert.deepEqual(trackers.filter((tracker) => tracker.targetKind === 'feature').map((tracker) => [tracker.max, tracker.reset]), [[2, 'long']]);
  assert.deepEqual(trackers.filter((tracker) => tracker.targetKind === 'inventory').map((tracker) => [tracker.max, tracker.reset]), [[3, 'long']]);
  assert.equal(trackers.find((tracker) => tracker.id === armorAuto.id)?.current, 1);
  assert.equal(trackers.some((tracker) => tracker.id === 'manual-armor'), true);
});

test('level-up refreshes existing option trackers when mastery changes their limit', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    level: 1,
    sheetCards: [createSheetCard({
      id: 'troubadour-songs',
      kind: 'subclassFeature',
      name: 'Одарённый исполнитель',
      text: 'Вы можете исполнить каждую песню один раз до следующего Продолжительного отдыха:\n- Расслабляющая песня: снимите Рану.\n- Эпическая песня: цель Уязвима.\n- Душераздирающая песня: получите Надежду.'
    })]
  });
  assert.deepEqual(service.getCharacter(character.id)?.usageTrackers?.map((tracker) => tracker.max), [1, 1, 1]);

  assert.equal(service.applyLevelUpDetailed(character.id, {
    level: 2,
    advancementChoices: ['manual'],
    subclassCards: [{
      id: 'troubadour-mastery',
      kind: 'subclassFeature',
      name: 'Виртуоз',
      text: 'Вы можете исполнить каждую из ваших песен “Одаренного Исполнителя” не один, а два раза до следующего Продолжительного отдыха.'
    }],
    freeformOverride: {
      enabled: true,
      actor: { id: 'gm', name: 'Мастер', role: 'gm' },
      reason: 'Проверка мастерства'
    }
  }).applied, true);
  assert.deepEqual(service.getCharacter(character.id)?.usageTrackers?.filter((tracker) => tracker.targetId === 'troubadour-songs').map((tracker) => tracker.max), [2, 2, 2]);
});

test('runtime resource clicks do not flood structural character history', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    hope: { value: 3, max: 6 },
    hp: { marked: 0, max: 6 },
    companion: {
      name: 'Спутник',
      evasion: 10,
      stress: { marked: 0, max: 1 },
      attackName: 'Укус',
      attackRange: 'Ближняя',
      attackFormula: 'd8',
      attackDamageType: 'physical',
      experiences: [],
      unavailableUntilLongRest: false
    }
  });
  service.adjustHope(character.id, -1);
  service.markSlots(character.id, 'hp', 1);
  service.setActionTokens(character.id, 2);
  service.markCompanionStress(character.id, 1);
  assert.equal(service.getCharacter(character.id)?.changeHistory?.length, 0);
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
