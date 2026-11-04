import { afterEach, expect, test, vi } from 'vitest';
import { batchStoreUpdates, Store } from '../../src/core/store/Store';
import { EventRollService, type EventRollDependencies } from '../../src/services/EventRollService';
import { TagTeamService } from '../../src/services/TagTeamService';
import { characterService, diceService, feedService, gameService, tabletopService } from '../../src/services/serviceRegistry';
import * as formula from '../../src/domain/rules/diceFormula';
import { createUnifiedRollDraft } from '../../src/domain/rules/unifiedRollDraft';
import { createGameDocument, gameDocumentToPersistedState } from '../../src/domain/game/gameDocument';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { charactersStore, feedStore, gameStore, resetAllStores, rollLogStore } from '../../src/stores/gameStores';
import type { TeamworkRollFeedEntry, TeamworkRollResult } from '../../src/domain/rules/types';

const scopeKey = 'tag-test';
afterEach(() => { vi.restoreAllMocks(); resetAllStores(); });
function setup() {
  resetAllStores(); gameService.setFear(0);
  const actors = ['A', 'B', 'C'].map(name => characterService.createCharacter({ name: `QA ${name}`,
    hope: { value: 3, max: 6 }, stress: { marked: 2, max: 6 },
    traits: { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 } }));
  const options = actors.map(actor => ({ actorId: actor.id, actorName: actor.name }));
  const entry = feedService.requestTeamworkRoll({ kind: 'tagTeam', difficulty: 12, participants: options.slice(0, 2) });
  const events = new EventRollService({ diceService, characterService, feedService, tabletopService,
    currentScopeKey: () => scopeKey, autoApplyRollConsequences: () => gameStore.get().autoApplyRollConsequences,
    session: { isConnectedPlayerSession: () => false, session$: { get: () => ({ role: 'idle', connected: false }) } } as unknown as EventRollDependencies['session'] });
  const service = new TagTeamService({ dice: diceService, currentScopeKey: () => scopeKey, isConnectedPlayer: () => false });
  function prepare(index: number) {
    const prepared = events.prepare({ kind: 'teamwork', entryId: entry.id, actorId: actors[index].id, trait: 'agility' }, 'gm');
    if (!prepared.ok) throw new Error(prepared.error);
    return createUnifiedRollDraft(prepared.input);
  }
  function roll(index: number, hope: number, fear: number) {
    vi.spyOn(formula, 'rollDie').mockReturnValueOnce(hope).mockReturnValueOnce(fear);
    const result = events.execute(prepare(index), 'gm', 'public', []); expect(result.ok).toBe(true);
    return result.rollId!;
  }
  const current = () => feedStore.get().find(item => item.id === entry.id) as TeamworkRollFeedEntry;
  const selection = (index: number) => ({ entryId: entry.id, actorId: actors[index].id, rollId: current().teamwork.participants[index].result!.rollId, scopeKey });
  const hopes = () => actors.slice(0, 2).map(actor => characterService.getCharacter(actor.id)!.hope.value);
  return { actors, options, entry, events, service, prepare, roll, current, selection, hopes };
}

for (const chosen of [0, 1]) test(`both candidates are free of automatic consequences; chosen ${chosen} applies one common outcome`, () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10);
  expect(h.hopes()).toEqual([3, 3]); expect(gameStore.get().fear).toBe(0);
  expect(rollLogStore.get()).toHaveLength(2);
  expect(rollLogStore.get().every(roll => roll.type === 'action' && !roll.consequenceApplied)).toBe(true);
  expect(h.service.resolve(h.selection(chosen), 'gm')).toEqual({ ok: true, applied: true });
  expect(h.hopes()).toEqual(chosen === 0 ? [4, 4] : [3, 3]); expect(gameStore.get().fear).toBe(chosen === 0 ? 0 : 2);
  expect(h.current().teamwork.status).toBe('resolved');
  expect(h.service.resolve(h.selection(chosen), 'gm')).toEqual({ ok: true, applied: false });
  expect(h.service.resolve(h.selection(chosen === 0 ? 1 : 0), 'gm').ok).toBe(false);
  expect(h.hopes()).toEqual(chosen === 0 ? [4, 4] : [3, 3]); expect(gameStore.get().fear).toBe(chosen === 0 ? 0 : 2);
  expect(rollLogStore.get()).toHaveLength(2);
});

test('chosen critical uses only the chosen outcome for both PCs', () => {
  const h = setup(); h.roll(0, 7, 7); h.roll(1, 3, 10);
  expect(h.actors.slice(0, 2).map(a => characterService.getCharacter(a.id)!.stress.marked)).toEqual([2, 2]);
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(true);
  expect(h.hopes()).toEqual([4, 4]); expect(gameStore.get().fear).toBe(0);
  expect(h.actors.slice(0, 2).map(a => characterService.getCharacter(a.id)!.stress.marked)).toEqual([1, 1]);
});

test('auto setting is sampled at choice; changing it after a manual resolution never reapplies effects', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10);
  gameService.updateSettings({ autoApplyRollConsequences: false });
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(true);
  expect(h.current().teamwork.sharedResult?.consequences).toBe('manual'); expect(h.hopes()).toEqual([3, 3]);
  gameService.updateSettings({ autoApplyRollConsequences: true });
  expect(h.service.resolve(h.selection(0), 'gm')).toEqual({ ok: true, applied: false }); expect(h.hopes()).toEqual([3, 3]);
});

test('turning auto on after rolling applies the selected Fear exactly once', () => {
  const h = setup(); gameService.updateSettings({ autoApplyRollConsequences: false });
  h.roll(0, 10, 3); h.roll(1, 3, 10); gameService.updateSettings({ autoApplyRollConsequences: true });
  expect(h.service.resolve(h.selection(1), 'gm').ok).toBe(true); expect(gameStore.get().fear).toBe(2);
});

test('early completion and selection are rejected; cancellation invalidates an open candidate draft', () => {
  const h = setup(); h.roll(0, 10, 3); const draft = h.prepare(1);
  expect(feedService.completeTeamworkRoll(h.entry.id)).toBeNull(); expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(false);
  expect(h.service.cancel(h.entry.id, scopeKey, 'gm')).toEqual({ ok: true, applied: true });
  expect(h.events.execute(draft, 'gm', 'public', []).ok).toBe(false); expect(rollLogStore.get()).toHaveLength(1);
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(false); expect(h.hopes()).toEqual([3, 3]);
  expect(h.service.cancel(h.entry.id, scopeKey, 'gm')).toEqual({ ok: true, applied: false });
});

test('roster is a pair and freezes at the first candidate; duplicate and conflicting candidates never replace a result', () => {
  const h = setup(); expect(feedService.updateTeamworkRollParticipants(h.entry.id, h.options)?.teamwork.participants).toHaveLength(2);
  h.roll(0, 10, 3); const stored = h.current().teamwork.participants[0].result!;
  expect(feedService.updateTeamworkRollParticipants(h.entry.id, [h.options[0], h.options[2]])).toBeNull();
  expect(feedService.recordTeamworkParticipantResult(h.entry.id, h.actors[0].id, { ...stored, rollId: 'conflict', total: 100 })).toBeNull();
  expect(feedService.recordTeamworkParticipantResult(h.entry.id, h.actors[1].id, stored)).toBeNull();
  expect(feedService.recordTeamworkParticipantResult(h.entry.id, h.actors[1].id, { ...stored, rollId: 'already-applied', consequencesApplied: true })).toBeNull();
  expect(h.current().teamwork.participants[0].result).toEqual(stored);
  h.roll(1, 3, 10); expect(h.service.resolve({ ...h.selection(0), rollId: 'stale-roll' }, 'gm').ok).toBe(false);
  expect(h.hopes()).toEqual([3, 3]);
});

test('manual candidate with no Duality outcome stays manual even with auto enabled', () => {
  const h = setup(); const manual: TeamworkRollResult = { rollId: 'manual-a', rollType: 'action', total: 16, difficulty: 12, success: true, note: 'GM manual' };
  feedService.recordTeamworkParticipantResult(h.entry.id, h.actors[0].id, manual); h.roll(1, 3, 10);
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(true); expect(h.current().teamwork.sharedResult?.consequences).toBe('manual'); expect(h.hopes()).toEqual([3, 3]);
});

test('a replayed saved resolution remains idempotent after export/import and a new service instance', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10); const choice = h.selection(0); const stale = h.current(); h.service.resolve(choice, 'gm');
  const state = gameDocumentToPersistedState(JSON.parse(JSON.stringify(createGameDocument(snapshotPersistedState()))));
  feedStore.set(state.feed); charactersStore.set(state.characters); gameStore.set(state.game);
  feedService.receiveRemote(stale);
  const fresh = new TagTeamService({ dice: diceService, currentScopeKey: () => scopeKey, isConnectedPlayer: () => false });
  expect(fresh.resolve(choice, 'gm')).toEqual({ ok: true, applied: false }); expect(h.hopes()).toEqual([4, 4]);
});

test('old resolved events and Group Action cannot enter the new resolution path', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10); const choice = h.selection(0);
  const old = { ...h.current(), teamwork: { ...h.current().teamwork, tagTeamMode: undefined, status: 'resolved' as const } };
  feedStore.set([old]); const original = JSON.stringify(feedStore.get());
  expect(h.service.resolve(choice, 'gm').ok).toBe(false); expect(JSON.stringify(feedStore.get())).toBe(original); expect(h.hopes()).toEqual([3, 3]);
  const group = feedService.requestTeamworkRoll({ kind: 'groupAction', participants: h.options.slice(0, 2) });
  expect(h.service.cancel(group.id, scopeKey, 'gm').ok).toBe(false); expect(feedService.completeTeamworkRoll(group.id)).not.toBeNull();
});

test('player and stale-world choices are refused without changing resources', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10);
  expect(h.service.resolve(h.selection(0), 'player').ok).toBe(false);
  expect(h.service.resolve({ ...h.selection(0), scopeKey: 'old-world' }, 'gm').ok).toBe(false); expect(h.hopes()).toEqual([3, 3]);
});

test('observers see resources and resolution together; a reentrant delivery cannot double-apply', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10); const choice = h.selection(0); const observations: unknown[] = [];
  const stop = charactersStore.subscribe(() => observations.push({ hopes: h.hopes(), resolved: h.current().teamwork.status, retry: h.service.resolve(choice, 'gm') }));
  try { expect(h.service.resolve(choice, 'gm').ok).toBe(true); } finally { stop(); }
  expect(observations).toEqual([{ hopes: [4, 4], resolved: 'resolved', retry: { ok: true, applied: false } }]);
});

test('a failed consequence callback rolls back the whole transition before notifying observers', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 3, 10); const apply = diceService.applySharedActionConsequences.bind(diceService);
  vi.spyOn(diceService, 'applySharedActionConsequences').mockImplementationOnce((ids, result) => { apply(ids, result); throw new Error('injected'); });
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(false); expect(h.hopes()).toEqual([3, 3]); expect(h.current().teamwork.sharedResult).toBeUndefined();
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(true); expect(h.hopes()).toEqual([4, 4]);
});

test('nested store batches publish each store once with all final values', () => {
  const a = new Store(0), b = new Store(0), seen: number[][] = [];
  a.subscribe(() => seen.push([a.get(), b.get()])); b.subscribe(() => seen.push([a.get(), b.get()]));
  batchStoreUpdates(() => { a.set(1); batchStoreUpdates(() => a.set(2)); b.set(3); expect(seen).toEqual([]); });
  expect(seen).toEqual([[2, 3], [2, 3]]);
});


test('conflicting delivered candidates cannot replace accepted values or reopen a cancelled action', () => {
  const h = setup(); h.roll(0, 10, 3); const accepted = h.current();
  feedService.receiveRemote({ ...accepted, teamwork: { ...accepted.teamwork, participants: accepted.teamwork.participants.map((actor, index) => index === 0 ? { ...actor, result: { ...actor.result!, total: 100 } } : actor) } });
  expect(h.current().teamwork.participants[0].result?.total).toBe(13);
  h.service.cancel(h.entry.id, scopeKey, 'gm'); feedService.receiveRemote(accepted);
  expect(h.current().teamwork.status).toBe('cancelled'); expect(h.hopes()).toEqual([3, 3]);
});

test('a discarded failure never takes the spotlight or awards Fear', () => {
  const h = setup(); h.roll(0, 10, 3); h.roll(1, 1, 2);
  expect(gameStore.get().spotlight).toBe('players'); expect(gameStore.get().fear).toBe(0);
  expect(h.service.resolve(h.selection(0), 'gm').ok).toBe(true);
  expect(gameStore.get().spotlight).toBe('players'); expect(gameStore.get().fear).toBe(0);
});
