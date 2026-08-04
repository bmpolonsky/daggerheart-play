import { test } from "vitest";
import assert from "node:assert/strict";
import { createGameHandout, createGameState, createEncounterState } from "../../src/domain/rules/factories";
import { buildPlayerViewModel } from "../../src/domain/tabletop/playerView";
import { buildTableFeedFromEntries, createFeedEntriesFromRollLog } from "../../src/domain/tabletop/feed";
import { createTableScene } from "../../src/domain/tabletop/factories";
import { resetAllStores, charactersStore, feedStore } from "../../src/stores/gameStores";
import { characterService, diceService, encounterService, feedService, rollLogService } from "../../src/services/serviceRegistry";
import type { RollLogEntry } from "../../src/domain/rules/types";
import { firstCharacter } from "./helpers";

test('feed service keeps player chat separate from technical roll log and filters GM visibility', () => {
  resetAllStores();

  feedService.addMessage('Мастер', 'Дверь открывается.', { visibility: 'public' });
  feedService.addMessage('Мастер', 'Скрытая ловушка активна.', { visibility: 'gm' });

  assert.equal(rollLogService.rollLog$.get().length, 0);
  assert.equal(feedStore.get().length, 2);

  const playerFeed = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player' });
  const gmFeed = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'gm' });

  assert.deepEqual(playerFeed.map((entry) => entry.body), ['Дверь открывается.']);
  assert.deepEqual(gmFeed.map((entry) => entry.body), ['Скрытая ловушка активна.', 'Дверь открывается.']);
});

test('titled gameplay messages keep their event label in the chronicle', () => {
  resetAllStores();

  feedService.addMessage('Заброшенная роща', 'Осквернитель · -1 Страх', {
    title: 'Окружение',
    publication: 'public'
  });
  feedService.addMessage('Леся', 'Я осматриваю алтарь.', { publication: 'public' });

  const [chat, environment] = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player' });
  assert.deepEqual(
    [chat.kicker, chat.title, environment.kicker, environment.title],
    ['Сообщение', 'Леся', 'Окружение', 'Заброшенная роща']
  );
});

test('dice rolls append public feed roll entries without replacing roll log history', () => {
  resetAllStores();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const entry = diceService.rollManualDice({ formula: '1d20', label: 'Проверка', visibility: 'gm' });
    assert.equal(rollLogService.rollLog$.get()[0], entry);
    assert.equal(feedStore.get()[0]?.type, 'roll');
    assert.equal(feedStore.get()[0]?.visibility, 'gm');
    assert.equal(buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player' }).length, 0);
    assert.equal(buildTableFeedFromEntries({ feed: feedStore.get(), role: 'gm' })[0].kind, 'roll');
  } finally {
    Math.random = originalRandom;
  }
});

test('roll publication filtering shows public to all, GM only to GM, and private to GM plus actor owner', () => {
  resetAllStores();
  const actor = firstCharacter();
  const other = characterService.createCharacter({ name: 'Чужой герой' });
  const rollLog: RollLogEntry[] = [
    {
      id: 'roll-private',
      type: 'manual',
      createdAt: '2026-05-21T08:02:00.000Z',
      title: 'Скрытая проверка',
      text: 'd20[7]',
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20',
      label: 'Скрытая проверка',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [7], subtotal: 7 }],
      total: 7,
      visibility: 'gm',
      publication: 'private'
    },
    {
      id: 'roll-gm',
      type: 'manual',
      createdAt: '2026-05-21T08:01:00.000Z',
      title: 'Ловушка',
      text: 'd20[12]',
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20',
      label: 'Ловушка',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [12], subtotal: 12 }],
      total: 12,
      visibility: 'gm',
      publication: 'gm'
    },
    {
      id: 'roll-public',
      type: 'manual',
      createdAt: '2026-05-21T08:00:00.000Z',
      title: 'Открытый бросок',
      text: 'd20[15]',
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20',
      label: 'Открытый бросок',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [15], subtotal: 15 }],
      total: 15,
      visibility: 'public',
      publication: 'public'
    }
  ];
  const feed = createFeedEntriesFromRollLog(rollLog);

  const ownerFeed = buildTableFeedFromEntries({ feed, role: 'player', actorId: actor.id });
  const strangerFeed = buildTableFeedFromEntries({ feed, role: 'player', actorId: other.id });
  const gmFeed = buildTableFeedFromEntries({ feed, role: 'gm' });

  assert.deepEqual(ownerFeed.map((entry) => entry.rollId), ['roll-private', 'roll-public']);
  assert.deepEqual(strangerFeed.map((entry) => entry.rollId), ['roll-public']);
  assert.deepEqual(gmFeed.map((entry) => entry.rollId), ['roll-private', 'roll-gm', 'roll-public']);
  assert.equal(ownerFeed[0].publication, 'private');
});

test('private feed roll reveal promotes feed copy and roll log copy to public', () => {
  resetAllStores();
  const actor = firstCharacter();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const roll = diceService.rollManualDice({
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20',
      label: 'Скрытая проверка',
      publication: 'private'
    });
    const feedEntry = feedStore.get()[0];
    assert.equal(feedEntry?.type, 'roll');
    assert.equal(feedEntry?.publication, 'private');
    assert.equal(buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player' }).length, 0);

    const revealed = feedService.revealToPublic(feedEntry.id);
    assert.equal(revealed?.publication, 'public');

    const updatedFeedEntry = feedStore.get()[0];
    assert.equal(updatedFeedEntry?.publication, 'public');
    assert.equal(updatedFeedEntry?.visibility, 'public');
    assert.equal(updatedFeedEntry?.type === 'roll' && 'publication' in updatedFeedEntry.roll ? updatedFeedEntry.roll.publication : null, 'public');
    assert.equal(updatedFeedEntry?.type === 'roll' && 'visibility' in updatedFeedEntry.roll ? updatedFeedEntry.roll.visibility : null, 'public');
    const updatedRoll = rollLogService.rollLog$.get().find((entry) => entry.id === roll.id);
    assert.equal(updatedRoll && 'publication' in updatedRoll ? updatedRoll.publication : null, 'public');
    assert.equal(updatedRoll && 'visibility' in updatedRoll ? updatedRoll.visibility : null, 'public');
    assert.equal(buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player' })[0].rollId, roll.id);
  } finally {
    Math.random = originalRandom;
  }
});

test('rich roll feed summary exposes structured action and manual dice data', () => {
  resetAllStores();
  const actor = firstCharacter();
  const rollLog: RollLogEntry[] = [
    {
      id: 'roll-action-rich',
      type: 'action',
      createdAt: '2026-05-21T08:05:00.000Z',
      actorId: actor.id,
      actorName: actor.name,
      trait: 'agility',
      difficulty: 12,
      hopeDie: 8,
      fearDie: 3,
      advantageRolls: [2, 5],
      disadvantageRolls: [],
      keptExtraDie: 5,
      modifiers: [{ label: 'Преимущество', value: 5 }, { label: 'Вручную', value: 1 }],
      total: 17,
      success: true,
      isCritical: false,
      outcome: 'successWithHope',
      consequenceApplied: true,
      publication: 'public'
    },
    {
      id: 'roll-manual-rich',
      type: 'manual',
      createdAt: '2026-05-21T08:04:00.000Z',
      title: 'Проверка',
      text: 'd20[14] + 2 = 16',
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20+2',
      label: 'Проверка',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [14], subtotal: 14 }, { sign: 1, value: 2, subtotal: 2 }],
      total: 16,
      visibility: 'public',
      publication: 'public'
    }
  ];

  const items = buildTableFeedFromEntries({ feed: createFeedEntriesFromRollLog(rollLog), role: 'player', actorId: actor.id });
  const actionDice = items[0].roll?.dice;
  assert.equal(actionDice?.kind, 'duality');
  assert.equal(actionDice?.kind === 'duality' ? actionDice.hope.value : null, 8);
  assert.deepEqual(actionDice?.kind === 'duality' ? actionDice.advantageRolls : [], [2, 5]);
  assert.equal(actionDice?.kind === 'duality' ? actionDice.keptExtraDie : null, 5);
  assert.equal(actionDice?.kind === 'duality' ? actionDice.modifierTotal : null, 6);
  assert.equal(actionDice?.kind === 'duality' ? actionDice.outcome : null, 'successWithHope');

  const manualDice = items[1].roll?.dice;
  assert.equal(manualDice?.kind, 'formula');
  assert.equal(manualDice?.kind === 'formula' ? manualDice.formula : null, '1d20+2');
  assert.deepEqual(manualDice?.kind === 'formula' ? manualDice.terms[0] : null, { sign: 1, count: 1, sides: 20, rolls: [14], subtotal: 14 });
});

test('player latest roll ignores another actor private roll for overlay summary', () => {
  resetAllStores();
  const actor = firstCharacter();
  const other = characterService.createCharacter({ name: 'Чужой герой' });
  const rollLog: RollLogEntry[] = [
    {
      id: 'roll-private-other',
      type: 'manual',
      createdAt: '2026-05-21T08:03:00.000Z',
      title: 'Чужая тайна',
      text: 'd20[4]',
      actorId: other.id,
      actorName: other.name,
      formula: '1d20',
      label: 'Чужая тайна',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [4], subtotal: 4 }],
      total: 4,
      visibility: 'gm',
      publication: 'private'
    },
    {
      id: 'roll-public',
      type: 'manual',
      createdAt: '2026-05-21T08:00:00.000Z',
      title: 'Открытый бросок',
      text: 'd20[15]',
      actorId: actor.id,
      actorName: actor.name,
      formula: '1d20',
      label: 'Открытый бросок',
      terms: [{ sign: 1, count: 1, sides: 20, rolls: [15], subtotal: 15 }],
      total: 15,
      visibility: 'public',
      publication: 'public'
    }
  ];

  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.get(),
    encounter: createEncounterState(),
    liveScene: createTableScene(),
    assets: {},
    assetUrls: {},
    rollLog,
    playerCharacterId: actor.id,
    role: 'player'
  });

  assert.equal(model.latestRoll?.id, 'roll-public');
  assert.deepEqual(model.activity.map((entry) => entry.rollId), ['roll-public']);
});

test('fixed damage feed entries do not wait for dice animation', () => {
  resetAllStores();
  const originalRandom = Math.random;
  const randomValues = [0.1, 0, 0.2];
  Math.random = () => randomValues.shift() ?? 0.3;
  try {
    const fixed = diceService.rollDamage({ formula: '1', actorName: 'Giant Rat' });
    const rolled = diceService.rollDamage({ formula: '1d8+2', actorName: 'Blade' });
    const feed = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'gm' });

    assert.equal(feed.find((entry) => entry.rollId === fixed.id)?.roll?.hasAnimatedDice, false);
    assert.equal(feed.find((entry) => entry.rollId === rolled.id)?.roll?.hasAnimatedDice, true);
  } finally {
    Math.random = originalRandom;
  }
});

test('manual dice feed avoids repeating actor and formula labels', () => {
  resetAllStores();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    diceService.rollManualDice({ formula: '1d20', actorName: 'Ари, демо-герой', label: 'Ари, демо-герой: d20' });
    const item = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'gm' })[0];

    assert.equal(item.kind, 'roll');
    assert.equal(item.kicker, 'Ари, демо-герой');
    assert.equal(item.title, 'd20: 1');
    assert.equal(item.body, '1d20[1]');
  } finally {
    Math.random = originalRandom;
  }
});

test('handout feed entries persist presented handouts without duplicate live preview', () => {
  resetAllStores();
  const game = createGameState();
  const handout = createGameHandout();
  game.handouts = [handout];
  handout.visibleToPlayers = true;
  handout.title = 'Письмо из руин';
  handout.body = 'Воск на печати еще теплый.';
  game.presentedHandoutId = handout.id;

  feedService.addHandout('Мастер', handout, { title: 'Материал' });

  const model = buildPlayerViewModel({
    game,
    characters: charactersStore.get(),
    encounter: encounterService.encounter$.get(),
    liveScene: createTableScene(),
    assets: {},
    assetUrls: {},
    rollLog: [],
    feed: feedStore.get()
  });

  const handoutEntries = model.activity.filter((entry) => entry.kind === 'handout' && entry.handout?.id === handout.id);
  assert.equal(handoutEntries.length, 1);
  assert.equal(handoutEntries[0]?.kicker, 'Материал');
  assert.equal(handoutEntries[0]?.title, 'Письмо из руин');
});
