import { afterEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { EventRollService, type EventRollDependencies } from '../../src/services/EventRollService';
import { createUnifiedRollDraft, convertUnifiedRollToManual } from '../../src/domain/rules/unifiedRollDraft';
import { rollFormula } from '../../src/domain/rules/diceFormula';
import type { EventRollRequest } from '../../src/domain/rules/eventRoll';
import type { ManualDiceRollEntry } from '../../src/domain/rules/types';
import { resetAllStores } from '../../src/stores/gameStores';
import { characterService, diceService, feedService, tabletopService } from '../../src/services/serviceRegistry';

afterEach(() => vi.restoreAllMocks());

function harness() {
  resetAllStores();
  let scope = 'event-scope';
  let connected = false;
  const character = characterService.createCharacter({ name: 'Event actor', level: 1, hp: { marked: 1, max: 6 }, hope: { value: 3, max: 6 } });
  let sequence = 0;
  const rolls: ManualDiceRollEntry[] = [];
  const manual = vi.spyOn(diceService, 'rollManualDice').mockImplementation((request) => {
    const rolled = rollFormula(request.formula, { rng: () => 0 });
    const entry: ManualDiceRollEntry = {
      id: `event-roll-${++sequence}`, type: 'manual', createdAt: new Date().toISOString(), title: request.label ?? 'Event', text: 'Rolled once',
      actorId: request.actorId ?? undefined, actorName: request.actorName ?? character.name, formula: request.formula,
      terms: rolled.terms, total: rolled.total, visibility: 'public', publication: request.publication ?? 'public'
    };
    rolls.push(entry);
    return entry;
  });
  const dependencies: EventRollDependencies = {
    diceService, characterService, feedService, tabletopService,
    currentScopeKey: () => scope, autoApplyRollConsequences: () => false,
    session: {
      isConnectedPlayerSession: () => connected,
      session$: { get: () => ({ role: connected ? 'player' : 'idle', connected, status: connected ? 'connected' : 'idle' }) }
    } as unknown as EventRollDependencies['session']
  };
  const service = new EventRollService(dependencies);
  const prepare = (request: EventRollRequest) => {
    const prepared = service.prepare(request, 'gm');
    if (!prepared.ok) throw new Error(prepared.error);
    return createUnifiedRollDraft(prepared.input);
  };
  const rest = () => {
    const entry = feedService.requestRest('short', { participants: [{ actorId: character.id, actorName: character.name,
      choices: [{ id: 'heal', label: 'Исцелить HP: 1d4 + ранг', count: 1, status: 'selected' }] }] });
    const choice = entry.rest.participants[0].choices[0];
    return { entry, draft: prepare({ kind: 'rest', entryId: entry.id, actorId: character.id, choiceId: choice.id }) };
  };
  return { character, service, dependencies, manual, rolls, prepare, rest,
    setScope: (next: string) => { scope = next; }, setConnected: () => { connected = true; } };
}

function restResult(entryId: string) {
  const entry = feedService.feed$.get().find((entry) => entry.id === entryId);
  if (!entry || entry.type !== 'rest') throw new Error('Missing rest');
  return entry.rest.participants[0].choices[0];
}

test('bound recovery rolls once, commits the same roll id and actual recovery, and refuses replay after reconnect', () => {
  const h = harness();
  const { entry, draft } = h.rest();
  const result = h.service.execute(draft, 'gm', 'public', []);
  assert.equal(result.ok, true);
  assert.equal(h.manual.mock.calls.length, 1);
  assert.equal(result.rollId, h.rolls[0].id);
  assert.equal(restResult(entry.id).result?.rollId, h.rolls[0].id);
  assert.equal(restResult(entry.id).result?.total, h.rolls[0].total);
  assert.equal(restResult(entry.id).result?.appliedAmount, 1);
  assert.equal(characterService.getCharacter(h.character.id)?.hp.marked, 0);
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  const reconnected = new EventRollService(h.dependencies);
  assert.equal(reconnected.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 1);
});

test('edited rest pool keeps its choice binding and requires explicit GM recovery override', () => {
  const h = harness();
  const { entry, draft } = h.rest();
  const edited = convertUnifiedRollToManual(draft, '1d20+100');
  assert.equal(edited.eventContext?.entryId, entry.id);
  assert.equal(h.service.execute(edited, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 0);
  const approved = { ...edited, eventContext: { ...edited.eventContext!, manualOverride: true } };
  assert.equal(h.service.execute(approved, 'player', 'public', [h.character.id]).ok, false);
  assert.equal(h.service.execute(approved, 'gm', 'public', []).ok, true);
  assert.equal(h.manual.mock.calls.length, 1);
  assert.equal(restResult(entry.id).result?.rollId, h.rolls[0].id);
  assert.equal(restResult(entry.id).result?.total, 101);
});

test('closed events, stale scope, changed actor and preparation cancellation perform no RNG or payment', () => {
  const h = harness();
  const { entry, draft } = h.rest();
  const before = JSON.parse(JSON.stringify(characterService.getCharacter(h.character.id)));
  // Preparing and dismissing a tray has no event or resource side effect.
  assert.equal(restResult(entry.id).status, 'selected');
  assert.equal(h.manual.mock.calls.length, 0);
  h.setScope('other-world');
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  h.setScope('event-scope');
  assert.equal(h.service.execute({ ...draft, actor: { ...draft.actor, id: 'other' } }, 'gm', 'public', []).ok, false);
  feedService.completeRest(entry.id, { restType: 'short', pcCount: 1, die: 1, modifier: 0, total: 1, formula: '1d4' });
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(characterService.getCharacter(h.character.id))), before);
});

test('death incompatible pool is blocked, canonical roll adds one scar and records the same id once', () => {
  const h = harness();
  const entry = feedService.requestDeathMove({ actor: { actorId: h.character.id, actorName: h.character.name, actorType: 'character' } });
  const draft = h.prepare({ kind: 'death', entryId: entry.id, actorId: h.character.id, deathChoice: 'avoidDeath' });
  assert.equal(h.service.execute({ ...draft, formula: '1d20' }, 'gm', 'public', []).ok, false);
  assert.equal(h.service.execute({ ...draft, manualModifier: 1 }, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 0);
  const result = h.service.execute(draft, 'gm', 'public', []);
  assert.equal(result.ok, true);
  assert.equal(h.manual.mock.calls.length, 1);
  assert.equal(characterService.getCharacter(h.character.id)?.scars.length, 1);
  const saved = feedService.feed$.get().find((item) => item.id === entry.id);
  assert.equal(saved?.type === 'deathMove' && saved.deathMove.rollId, result.rollId);
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(characterService.getCharacter(h.character.id)?.scars.length, 1);
});

test('late death choice/cancellation is refused before a scar or a die is produced', () => {
  const h = harness();
  const entry = feedService.requestDeathMove({ actor: { actorId: h.character.id, actorName: h.character.name, actorType: 'character' } });
  const draft = h.prepare({ kind: 'death', entryId: entry.id, actorId: h.character.id, deathChoice: 'avoidDeath' });
  feedService.updateDeathMove(entry.id, { choice: 'riskItAll' });
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  feedService.updateDeathMove(entry.id, { status: 'cancelled' });
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 0);
  assert.equal(characterService.getCharacter(h.character.id)?.scars.length, 0);
});

test('teamwork manual result needs GM override and records total without outcome or Hope costs', () => {
  const h = harness();
  const entry = feedService.requestTeamworkRoll({ kind: 'groupAction', difficulty: 12, participants: [{ actorId: h.character.id, actorName: h.character.name }] });
  const draft = h.prepare({ kind: 'teamwork', entryId: entry.id, actorId: h.character.id, trait: 'agility' });
  const manual = convertUnifiedRollToManual(draft, '1d20+20');
  assert.equal(manual.eventContext?.entryId, entry.id);
  assert.equal(h.service.execute(manual, 'gm', 'public', []).ok, false);
  const approved = { ...manual, eventContext: { ...manual.eventContext!, manualOverride: true } };
  assert.equal(h.service.execute(approved, 'gm', 'public', []).ok, true);
  const saved = feedService.feed$.get().find((item) => item.id === entry.id);
  assert.ok(saved?.type === 'teamwork');
  const result = saved.teamwork.participants[0].result!;
  assert.equal(result.rollId, h.rolls[0].id);
  assert.equal(result.total, 21);
  assert.equal(result.success, true);
  assert.equal(result.outcome, undefined);
  assert.equal(result.trait, undefined);
  assert.match(result.note, /Ручной итог/);
  assert.equal(characterService.getCharacter(h.character.id)?.hope.value, 3);
});

test('teamwork pending request fingerprint, role and participant changes block before Dice or XP payment', () => {
  const h = harness();
  const action = vi.spyOn(diceService, 'rollAction');
  const entry = feedService.requestTeamworkRoll({ kind: 'groupAction', participants: [{ actorId: h.character.id, actorName: h.character.name }] });
  feedService.requestTeamworkParticipantRoll(entry.id, h.character.id, 'agility');
  const draft = h.prepare({ kind: 'teamwork', entryId: entry.id, actorId: h.character.id, trait: 'strength' });
  assert.equal(draft.trait, 'agility');
  assert.equal(h.service.execute({ ...draft, mode: 'reaction' }, 'gm', 'public', []).ok, false);
  assert.equal(h.service.execute({ ...draft, trait: 'strength' }, 'gm', 'public', []).ok, false);
  feedService.rejectTeamworkParticipantRoll(entry.id, h.character.id);
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(action.mock.calls.length, 0);
  assert.equal(h.manual.mock.calls.length, 0);
  assert.equal(characterService.getCharacter(h.character.id)?.hope.value, 3);
});

test('connected players retain the decision/GM approval boundary instead of locally resolving an event', () => {
  const h = harness();
  const { draft } = h.rest();
  h.setConnected();
  assert.equal(h.service.execute(draft, 'player', 'public', [h.character.id]).ok, false);
  assert.equal(h.manual.mock.calls.length, 0);
  assert.equal(characterService.getCharacter(h.character.id)?.hp.marked, 1);
});

test('approved teamwork uses the requested trait and support modifier once, checking XP affordability before RNG', () => {
  const h = harness();
  const support = characterService.createCharacter({ name: 'Support' });
  const entry = feedService.requestTeamworkRoll({ kind: 'groupAction', difficulty: 12, participants: [
    { actorId: h.character.id, actorName: h.character.name }, { actorId: support.id, actorName: support.name }
  ] });
  feedService.recordTeamworkParticipantResult(entry.id, support.id, { rollId: 'support-roll', rollType: 'reaction', total: 15, difficulty: 12, success: true, note: 'Support succeeds' });
  feedService.requestTeamworkParticipantRoll(entry.id, h.character.id, 'agility');
  const draft = h.prepare({ kind: 'teamwork', entryId: entry.id, actorId: h.character.id, trait: 'strength' });
  assert.equal(draft.trait, 'agility');
  assert.equal(draft.manualModifier, 1);
  draft.experienceIds = [h.character.experiences[0].id];
  draft.spendHopeForExperiences = true;
  characterService.setHope(h.character.id, 0);
  const action = vi.spyOn(diceService, 'rollAction');
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(action.mock.calls.length, 0);
  characterService.setHope(h.character.id, 3);
  const executed = h.service.execute(draft, 'gm', 'public', []);
  assert.equal(executed.ok, true);
  assert.equal(action.mock.calls.length, 1);
  assert.equal(action.mock.calls[0][0].manualModifier, 1);
  assert.equal(action.mock.calls[0][0].trait, 'agility');
  const saved = feedService.feed$.get().find((item) => item.id === entry.id);
  assert.ok(saved?.type === 'teamwork');
  assert.equal(saved.teamwork.participants[0].result?.rollId, action.mock.results[0].value.id);
  assert.equal(characterService.getCharacter(h.character.id)?.hope.value, 2);
  assert.equal(h.manual.mock.calls.length, 0);
});

test('synchronous event cancellation during a recorded death roll cannot apply a scar or reroll it', () => {
  const h = harness();
  const entry = feedService.requestDeathMove({ actor: { actorId: h.character.id, actorName: h.character.name, actorType: 'character' } });
  const draft = h.prepare({ kind: 'death', entryId: entry.id, actorId: h.character.id, deathChoice: 'avoidDeath' });
  const generate = h.manual.getMockImplementation()!;
  h.manual.mockImplementationOnce((request) => {
    const rolled = generate(request);
    feedService.updateDeathMove(entry.id, { status: 'cancelled' });
    return rolled;
  });
  const result = h.service.execute(draft, 'gm', 'public', []);
  assert.equal(result.ok, false);
  assert.equal(result.rollId, h.rolls[0].id);
  assert.equal(characterService.getCharacter(h.character.id)?.scars.length, 0);
  assert.equal(h.service.execute(draft, 'gm', 'public', []).ok, false);
  assert.equal(h.manual.mock.calls.length, 1);
});
