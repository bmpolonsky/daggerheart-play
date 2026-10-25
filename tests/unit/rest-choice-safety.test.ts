import { test } from 'vitest';
import assert from 'node:assert/strict';
import { restMoveLabels, restProgress, restRemainingSummary, sceneRestCharacterIds } from '../../src/domain/rules/rest';
import { buildTableFeedFromEntries } from '../../src/domain/tabletop/feed';
import type { TokenState } from '../../src/domain/tabletop/types';
import { FeedService } from '../../src/services/FeedService';
import { feedStore, resetAllStores } from '../../src/stores/gameStores';

test('scene rest captures existing PCs once, deduplicates tokens, and excludes every other actor kind', () => {
  const tokens: Array<Pick<TokenState, 'actor'>> = [
    { actor: { kind: 'character', id: 'pc-b' } },
    { actor: { kind: 'npc', id: 'pc-a' } },
    { actor: { kind: 'character', id: 'pc-b' } },
    { actor: { kind: 'adversary', id: 'enemy' } },
    { actor: { kind: 'companion', id: 'pc-a' } },
    { actor: { kind: 'environment', id: 'environment' } },
    { actor: { kind: 'character', id: 'deleted' } },
    { actor: { kind: 'character', id: 'pc-a' } }
  ];
  const characters = { 'pc-a': { id: 'pc-a' }, 'pc-b': { id: 'pc-b' }, 'not-in-scene': { id: 'not-in-scene' } };
  const snapshot = sceneRestCharacterIds(tokens, characters);
  assert.deepEqual(snapshot, ['pc-b', 'pc-a']);
  tokens.splice(0, tokens.length, { actor: { kind: 'character', id: 'not-in-scene' } });
  assert.deepEqual(snapshot, ['pc-b', 'pc-a']);
  assert.deepEqual(sceneRestCharacterIds(tokens, characters), ['not-in-scene']);
  assert.deepEqual(sceneRestCharacterIds([], characters), []);
});

test('rest move rows retain rule order after all choices are selected', () => {
  const moves = ['Раны', 'Стресс', 'Броня'];
  const choices = [{ label: 'Броня' }, { label: 'Раны' }, { label: 'Раны' }];
  assert.deepEqual(restMoveLabels(moves, choices, true), moves);
  assert.deepEqual(restMoveLabels(moves, choices, false), ['Раны', 'Броня']);
  assert.deepEqual(restMoveLabels(moves, [...choices, { label: 'Особый ход' }], false), ['Раны', 'Броня', 'Особый ход']);
});

test('a resolved rest choice keeps its first authoritative result', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestRest('short', {
    participants: [{ actorId: 'hero', actorName: 'Герой', choices: [{ id: 'heal', label: 'Залечить Раны' }] }]
  });
  const result = { total: 6, appliedAmount: 1, note: 'Исцелено ран: 1.' };
  assert.ok(service.resolveRestParticipantChoice(entry.id, 'hero', 'heal', result));
  assert.equal(service.resolveRestParticipantChoice(entry.id, 'hero', 'heal', { appliedAmount: 9, note: 'Повтор' }), null);
  const stored = feedStore.get().find((item) => item.id === entry.id);
  assert.equal(stored?.type, 'rest');
  if (stored?.type === 'rest') assert.deepEqual(stored.rest.participants[0].choices[0].result, result);
});

test('rest completion preserves its original plan and rejects late choice results', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestRest('long', {
    participants: [{ actorId: 'hero', actorName: 'Герой', choices: [{ id: 'heal', label: 'Залечить все Раны' }] }]
  });
  const plan = { restType: 'long' as const, pcCount: 1, die: 1, modifier: 1, total: 2, formula: '1d4 + 1' };
  assert.ok(service.completeRest(entry.id, plan));
  assert.equal(service.completeRest(entry.id, { ...plan, total: 5, die: 4 }), null);
  assert.equal(service.resolveRestParticipantChoice(entry.id, 'hero', 'heal', { note: 'Поздний результат' }), null);
  const stored = feedStore.get().find((item) => item.id === entry.id);
  if (stored?.type === 'rest') assert.deepEqual(stored.rest.fearPlan, plan);
  else assert.fail('rest disappeared');
});

test('finishing without applying moves preserves pending choices and reports whose results are missing', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestRest('short', { participants: [
    { actorId: 'one', actorName: 'Первый', maxChoices: 3, choices: [{ id: 'heal', label: 'Залечить Раны', count: 2 }] },
    { actorId: 'two', actorName: 'Второй' }
  ] });
  const completed = service.completeRest(entry.id, { restType: 'short', pcCount: 2, die: 1, modifier: 0, total: 1, formula: '1d4' })!;
  assert.equal(completed.rest.status, 'resolved');
  assert.deepEqual(completed.rest.participants[0].choices, entry.rest.participants[0].choices);
  const progress = restProgress(completed.rest);
  assert.equal(progress.appliedCount, 0);
  assert.equal(progress.remainingCount, 5);
  assert.equal(progress.participants[0].pendingCount, 2);
  assert.equal(progress.participants[0].unselectedCount, 1);
  assert.equal(progress.participants[1].unselectedCount, 2);
  assert.match(restRemainingSummary(completed.rest), /Первый \(3\), Второй \(2\)/);
  assert.match(buildTableFeedFromEntries({ feed: [completed], role: 'gm' })[0].body, /без записанного результата: 5/);
  assert.equal(service.resolveRestParticipantChoice(entry.id, 'one', 'heal', { note: 'Позднее лечение' }), null);
});

test('legacy completed choices without results are never inferred to have healed the character', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestRest('short', { participants: [{ actorId: 'hero', actorName: 'Герой', choices: [
    { id: 'legacy', label: 'Залечить Раны', status: 'resolved' },
    { id: 'recorded', label: 'Снять Стресс' }
  ] }] });
  service.resolveRestParticipantChoice(entry.id, 'hero', 'recorded', { appliedAmount: 0, note: 'Очищено стресса: 0.' });
  const completed = service.completeRest(entry.id, { restType: 'short', pcCount: 1, die: 1, modifier: 0, total: 1, formula: '1d4' })!;
  const progress = restProgress(completed.rest);
  assert.equal(progress.appliedCount, 1);
  assert.equal(progress.remainingCount, 1);
  assert.equal(progress.participants[0].pendingCount, 1);
  assert.match(restRemainingSummary(completed.rest), /без записанного результата: 1/);
  assert.equal(completed.rest.participants[0].choices[0].result, undefined);
});

test('editing remaining rest slots preserves applied moves and permits another instance of the same move', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestRest('short', {
    participants: [{ actorId: 'elf', actorName: 'Эльф', maxChoices: 3 }]
  });
  const heal = entry.rest.availableMoves[0];
  const other = entry.rest.availableMoves[1];
  const firstSelection = service.updateRestParticipantChoices(entry.id, 'elf', [heal]);
  const original = firstSelection!.rest.participants[0].choices[0];
  const result = { appliedAmount: 1, note: 'Исцелено ран: 1.' };
  service.resolveRestParticipantChoice(entry.id, 'elf', original.id, result);

  const edited = service.updateRestParticipantChoices(entry.id, 'elf', [heal, other]);
  assert.deepEqual(edited!.rest.participants[0].choices[0], { ...original, status: 'resolved', result });
  assert.equal(service.resolveRestParticipantChoice(entry.id, 'elf', original.id, { note: 'Повтор' }), null);

  const repeated = service.updateRestParticipantChoices(entry.id, 'elf', [heal, other, heal]);
  const healChoices = repeated!.rest.participants[0].choices.filter((choice) => choice.label === heal);
  assert.equal(healChoices.length, 2);
  assert.equal(healChoices[0].status, 'resolved');
  assert.equal(healChoices[1].status, 'selected');
  assert.equal(healChoices[1].count, 1);
  assert.notEqual(healChoices[1].id, original.id);
  const pendingId = healChoices[1].id;
  const replayed = service.updateRestParticipantChoices(entry.id, 'elf', [heal, other, heal]);
  assert.equal(replayed!.rest.participants[0].choices.find((choice) => choice.status === 'selected' && choice.label === heal)?.id, pendingId);

  const reset = service.updateRestParticipantChoices(entry.id, 'elf', []);
  assert.deepEqual(reset!.rest.participants[0].choices, [{ ...original, status: 'resolved', result }]);
});
