import { test } from "vitest";
import assert from "node:assert/strict";
import { canApplyRestChoice, canSelectRestChoices, rollRestFear } from "../../src/domain/rules/rest";
import { buildTableFeedFromEntries } from "../../src/domain/tabletop/feed";
import { resetAllStores, feedStore } from "../../src/stores/gameStores";
import { gameService, characterService, feedService, tabletopService } from "../../src/services/serviceRegistry";
import { LocalSyncTransport, SyncService } from "../../src/services/SyncService";
import { ActorStatus } from "../../src/domain/rules/statuses";

test('SRD rest fear helper uses short and long rest formulas', () => {
  const shortRest = rollRestFear('short', 4, () => 0.99);
  assert.equal(shortRest.die, 4);
  assert.equal(shortRest.modifier, 0);
  assert.equal(shortRest.total, 4);
  assert.equal(shortRest.formula, '1d4');

  const longRest = rollRestFear('long', 3, () => 0);
  assert.equal(longRest.die, 1);
  assert.equal(longRest.modifier, 3);
  assert.equal(longRest.total, 4);
  assert.equal(longRest.formula, '1d4 + 3');
});

test('tabletop rest flow grants Fear and explicit long rest recovery clears group tracks', () => {
  resetAllStores();
  const first = characterService.createCharacter({
    name: 'Rested One',
    hp: { marked: 2, max: 6 },
    stress: { marked: 3, max: 6 },
    armor: { name: 'Chain', baseMajor: 6, baseSevere: 12, score: 3, markedSlots: 2 },
    conditions: [{ id: 'condition-vulnerable', name: ActorStatus.Vulnerable }]
  });
  const second = characterService.createCharacter({
    name: 'Rested Two',
    hp: { marked: 1, max: 5 },
    stress: { marked: 1, max: 6 },
    armor: { name: 'Leather', baseMajor: 5, baseSevere: 10, score: 2, markedSlots: 1 }
  });

  const rest = tabletopService.conductRest('long', { pcCount: 2, rng: () => 0.5 });
  assert.equal(rest.total, 5);
  assert.equal(gameService.gameStore.getSnapshot().fear, 5);

  assert.equal(tabletopService.applyLongRestGroupRecovery('clearHp'), 2);
  assert.equal(tabletopService.applyLongRestGroupRecovery('clearStress'), 2);
  assert.equal(tabletopService.applyLongRestGroupRecovery('repairArmor'), 2);

  const updatedFirst = characterService.getCharacter(first.id);
  const updatedSecond = characterService.getCharacter(second.id);
  assert.equal(updatedFirst?.hp.marked, 0);
  assert.equal(updatedFirst?.stress.marked, 0);
  assert.equal(updatedFirst?.armor.markedSlots, 0);
  assert.equal(updatedFirst?.conditions.some((condition) => condition.name === ActorStatus.Vulnerable), false);
  assert.equal(updatedSecond?.hp.marked, 0);
  assert.equal(updatedSecond?.stress.marked, 0);
  assert.equal(updatedSecond?.armor.markedSlots, 0);
});

test('long rest group recovery only changes ranger companion stress on stress recovery', () => {
  resetAllStores();
  const ranger = characterService.createCharacter({ className: 'Ranger', name: 'Следопыт' });
  characterService.ensureRangerCompanion(ranger.id, { name: 'Компаньон' });
  characterService.markCompanionStress(ranger.id, 2);
  characterService.markSlots(ranger.id, 'hp', 1);
  characterService.markSlots(ranger.id, 'stress', 1);

  tabletopService.applyLongRestGroupRecovery('clearHp');
  assert.equal(characterService.getCharacter(ranger.id)?.companion?.stress.marked, 2);

  tabletopService.applyLongRestGroupRecovery('clearStress');
  assert.equal(characterService.getCharacter(ranger.id)?.companion?.stress.marked, 1);
});

test('rest request feed entry carries participant choices and respects publication filtering', () => {
  resetAllStores();
  const actor = characterService.createCharacter({ name: 'Rest Requester' });
  const stranger = characterService.createCharacter({ name: 'Not Invited' });

  const entry = feedService.requestRest('short', {
    publication: 'private',
    requestedBy: { actorId: actor.id, actorName: actor.name, actorType: 'character' },
    participants: [{
      actorId: actor.id,
      actorName: actor.name,
      ready: true,
      choices: [{ id: 'heal-hp', label: 'Исцелить HP', count: 2 }]
    }]
  });

  assert.equal(entry.type, 'rest');
  assert.equal(entry.rest.restType, 'short');
  assert.equal(entry.rest.status, 'requested');
  assert.equal(entry.rest.maxChoicesPerParticipant, 2);
  assert.equal(entry.rest.participants[0]?.choices[0]?.status, 'selected');
  assert.equal(entry.rest.participants[0]?.choices[0]?.count, 2);

  const ownerFeed = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'player', actorId: actor.id });
  const strangerFeed = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'player', actorId: stranger.id });
  const gmFeed = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'gm' });
  assert.equal(ownerFeed[0].kind, 'rest');
  assert.equal(ownerFeed[0].rest?.participants[0]?.ready, true);
  assert.equal(strangerFeed.length, 0);
  assert.equal(gmFeed[0].kind, 'rest');
});

test('rest feed choices update by participant slots and completion stores fear plan', () => {
  resetAllStores();
  const first = characterService.createCharacter({ name: 'Rest Slot One' });
  const second = characterService.createCharacter({ name: 'Rest Slot Two' });
  const entry = feedService.requestRest('short', {
    participants: [
      { actorId: first.id, actorName: first.name },
      { actorId: second.id, actorName: second.name }
    ]
  });
  const firstMove = entry.rest.availableMoves[0] ?? '';
  const secondMove = entry.rest.availableMoves[1] ?? '';

  const updated = feedService.updateRestParticipantChoices(entry.id, first.id, [firstMove, firstMove, secondMove]);
  assert.equal(updated?.rest.status, 'collecting');
  assert.equal(updated?.rest.participants[0]?.ready, true);
  assert.equal(updated?.rest.participants[0]?.choices.length, 1);
  assert.equal(updated?.rest.participants[0]?.choices[0]?.label, firstMove);
  assert.equal(updated?.rest.participants[0]?.choices[0]?.count, 2);

  const partial = feedService.updateRestParticipantChoices(entry.rest.id, second.id, [secondMove]);
  assert.equal(partial?.rest.participants[1]?.ready, false);
  assert.equal(partial?.rest.participants[1]?.choices[0]?.label, secondMove);
  assert.equal(feedService.updateRestParticipantChoices(entry.id, 'missing-actor', [firstMove]), null);

  const plan = tabletopService.conductRest('short', { pcCount: 2, rng: () => 0 });
  const completed = feedService.completeRest(entry.id, plan);
  assert.equal(completed?.rest.status, 'resolved');
  assert.equal(completed?.rest.fearPlan?.total, 1);
  assert.equal(completed?.rest.participants[0]?.choices[0]?.status, 'resolved');
  assert.equal(gameService.gameStore.getSnapshot().fear, 1);
});

test('teamwork feed cards track GM participant selection, roles, and roll results', () => {
  resetAllStores();
  const leader = characterService.createCharacter({ name: 'Лидер' });
  const support = characterService.createCharacter({ name: 'Поддержка' });
  const actors = [
    { actorId: leader.id, actorName: leader.name },
    { actorId: support.id, actorName: support.name }
  ];

  const entry = feedService.requestTeamworkRoll({
    kind: 'groupAction',
    difficulty: 13,
    requestedBy: { actorName: 'Мастер', actorType: 'system' },
    availableActors: actors
  });
  assert.equal(entry.type, 'teamwork');
  assert.equal(buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'gm' })[0]?.kind, 'teamwork');

  const selected = feedService.updateTeamworkRollParticipants(entry.id, actors);
  assert.deepEqual(selected?.teamwork.participants.map((participant) => [participant.actorName, participant.role]), [
    ['Лидер', 'leader'],
    ['Поддержка', 'support']
  ]);

  const promoted = feedService.updateTeamworkParticipantRole(entry.id, support.id, 'leader');
  assert.deepEqual(promoted?.teamwork.participants.map((participant) => [participant.actorName, participant.role]), [
    ['Лидер', 'support'],
    ['Поддержка', 'leader']
  ]);

  assert.equal(feedService.recordTeamworkParticipantResult(entry.id, 'missing-actor', {
    rollId: 'roll-missing',
    rollType: 'reaction',
    total: 20,
    difficulty: 13,
    success: true,
    note: 'missing'
  }), null);

  const requested = feedService.requestTeamworkParticipantRoll(entry.id, leader.id, 'agility');
  assert.equal(requested?.teamwork.participants.find((participant) => participant.actorId === leader.id)?.pendingRoll?.status, 'pending');

  const recorded = feedService.recordTeamworkParticipantResult(entry.id, leader.id, {
    rollId: 'roll-support',
    rollType: 'reaction',
    trait: 'agility',
    total: 15,
    difficulty: 13,
    success: true,
    note: 'Лидер: 15 успех'
  });
  assert.equal(recorded?.teamwork.participants.find((participant) => participant.actorId === leader.id)?.result?.success, true);
  assert.equal(recorded?.teamwork.participants.find((participant) => participant.actorId === leader.id)?.pendingRoll, undefined);
  assert.match(buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'gm' })[0]?.body ?? '', /1\/2 участников бросили/);

  feedService.completeTeamworkRoll(entry.id);
  assert.equal(feedService.requestTeamworkParticipantRoll(entry.id, support.id, 'strength'), null);
  assert.equal(feedService.recordTeamworkParticipantResult(entry.id, support.id, {
    rollId: 'roll-stale',
    rollType: 'reaction',
    total: 18,
    difficulty: 13,
    success: true,
    note: 'stale'
  }), null);
});

test('rest choice application stays GM-authoritative during connected player sessions', () => {
  assert.equal(canApplyRestChoice({ role: 'gm', isOwner: false, isClosed: false, connectedPlayerSession: false }), true);
  assert.equal(canApplyRestChoice({ role: 'player', isOwner: true, isClosed: false, connectedPlayerSession: false }), true);
  assert.equal(canApplyRestChoice({ role: 'player', isOwner: true, isClosed: false, connectedPlayerSession: true }), false);
  assert.equal(canApplyRestChoice({ role: 'player', isOwner: false, isClosed: false, connectedPlayerSession: false }), false);
  assert.equal(canApplyRestChoice({ role: 'gm', isOwner: false, isClosed: true, connectedPlayerSession: false }), false);
});

test('rest choice selection allows GM to operate for any participant', () => {
  assert.equal(canSelectRestChoices({ role: 'gm', isOwner: false, isClosed: false }), true);
  assert.equal(canSelectRestChoices({ role: 'player', isOwner: true, isClosed: false }), true);
  assert.equal(canSelectRestChoices({ role: 'player', isOwner: false, isClosed: false }), false);
  assert.equal(canSelectRestChoices({ role: 'gm', isOwner: false, isClosed: true }), false);
});

test('player rest choice sync applies to GM feed and completion preserves choices', async () => {
  resetAllStores();
  const first = characterService.createCharacter({ name: 'Rest Sync One' });
  const second = characterService.createCharacter({ name: 'Rest Sync Two' });
  const third = characterService.createCharacter({ name: 'Rest Sync Three' });
  const entry = feedService.requestRest('short', {
    participants: [
      { actorId: first.id, actorName: first.name },
      { actorId: second.id, actorName: second.name },
      { actorId: third.id, actorName: third.name }
    ]
  });
  const firstMove = entry.rest.availableMoves[0] ?? '';
  const secondMove = entry.rest.availableMoves[1] ?? '';
  const initialGmFeed = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'gm' });
  assert.equal(initialGmFeed[0].rest?.participants.filter((participant) => participant.ready).length, 0);

  const transport = new LocalSyncTransport();
  const gm = new SyncService();
  const player = new SyncService();
  gm.setTransport(transport);
  player.setTransport(transport);
  await gm.connectAuthority('room-rest', {
    id: 'gm-1',
    name: 'Мастер',
    role: 'gm',
    actorIds: [],
    connected: true,
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
  await player.connectReadOnly('room-rest', {
    id: 'player-1',
    name: 'Игрок',
    role: 'observer',
    actorIds: [first.id],
    connected: true,
    updatedAt: '2026-05-26T00:00:00.000Z'
  });

  let applied = false;
  const unsubscribe = gm.subscribePlayerRestChoices((message) => {
    applied = Boolean(feedService.updateRestParticipantChoices(message.restEntryId, message.actorId, message.choices));
  });
  assert.equal(await player.publishPlayerRestChoice({
    participantId: 'player-1',
    restEntryId: entry.id,
    actorId: first.id,
    choices: [firstMove, secondMove]
  }), true);
  unsubscribe();

  assert.equal(applied, true);
  const gmFeed = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'gm' });
  const participant = gmFeed[0].rest?.participants[0];
  assert.equal(gmFeed[0].body, '1/3 участников готовы. Каждый выбирает 2.');
  assert.equal(participant?.ready, true);
  assert.deepEqual(participant?.choices.map((choice) => choice.label), [firstMove, secondMove]);

  const completed = feedService.completeRest(entry.id, { restType: 'short', pcCount: 3, die: 1, modifier: 0, total: 1, formula: '1d4' });
  assert.deepEqual(completed?.rest.participants[0]?.choices.map((choice) => [choice.label, choice.status]), [
    [firstMove, 'resolved'],
    [secondMove, 'resolved']
  ]);
});
