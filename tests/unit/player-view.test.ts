import { test } from "vitest";
import assert from "node:assert/strict";
import { buildPresentedHandoutOverlay, selectPresentedHandout } from "../../src/domain/rules/handouts";
import { createGameHandout, createGameState, createInventoryItem } from "../../src/domain/rules/factories";
import { buildPlayerViewModel } from "../../src/domain/tabletop/playerView";
import { defaultCharacterPortraitUrl, defaultSceneImageUrl } from "../../src/domain/tabletop/defaultArt";
import { createTableScene, createTokenState } from "../../src/domain/tabletop/factories";
import { resetAllStores, charactersStore, sceneTableStore } from "../../src/stores/gameStores";
import { gameService, characterService, encounterService, sceneTableService } from "../../src/services/serviceRegistry";
import { buildSessionRosterActors } from "../../src/ui/vtt/playerView/helpers";
import { resolveMiniDiceLauncherMode, resolveMiniDiceTrayBonusMode } from "../../src/ui/vtt/MiniDiceLauncher";
import { firstCharacter } from "./helpers";

test('session presentation state tracks live scene and presented handout', () => {
  resetAllStores();
  const scene = sceneTableService.createScene({ name: 'Сцена в таверне' });
  assert.equal(sceneTableService.publishScene(scene.id), true);
  assert.equal(sceneTableStore.getSnapshot().liveSceneId, scene.id);

  const handout = gameService.addHandout({ title: 'Письмо', visibleToPlayers: false });
  assert.equal(gameService.presentHandout(handout.id), true);
  assert.equal(gameService.gameStore.getSnapshot().presentedHandoutId, handout.id);
  assert.equal(gameService.gameStore.getSnapshot().handouts.find((item) => item.id === handout.id)?.visibleToPlayers, true);

  gameService.updateHandout(handout.id, { visibleToPlayers: false });
  assert.equal(gameService.gameStore.getSnapshot().presentedHandoutId, null);
});

test('handout presentation selector exposes only player-visible live handouts', () => {
  const game = createGameState();
  const hidden = createGameHandout();
  game.handouts = [hidden];
  hidden.visibleToPlayers = false;
  game.presentedHandoutId = hidden.id;
  assert.equal(selectPresentedHandout(game), null);
  assert.equal(buildPresentedHandoutOverlay(game), null);

  hidden.visibleToPlayers = true;
  hidden.title = '  ';
  hidden.body = ' First clue. \n\n Second clue. ';
  hidden.imageUrl = ' https://example.test/handout.png ';

  assert.equal(selectPresentedHandout(game)?.id, hidden.id);
  assert.deepEqual(buildPresentedHandoutOverlay(game), {
    id: hidden.id,
    title: 'Материал',
    body: 'First clue. \n\n Second clue.',
    imageUrl: 'https://example.test/handout.png',
    hasBody: true,
    hasImage: true
  });

  game.presentedHandoutId = 'missing';
  assert.equal(buildPresentedHandoutOverlay(game), null);
});

test('player view model exposes only public live scene state', () => {
  resetAllStores();
  const character = firstCharacter();
  const game = createGameState();
  const handout = createGameHandout();
  game.handouts = [handout];
  handout.visibleToPlayers = true;
  handout.title = 'Карта руин';
  game.presentedHandoutId = handout.id;
  game.fear = 3;

  const scene = createTableScene({
    name: 'Публичная сцена',
    backgroundUrl: 'https://example.test/scene.webp',
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'visible-token', x: 120, y: 220 }),
      createTokenState({ kind: 'character', id: character.id }, { id: 'hidden-token', hidden: true }),
      createTokenState({ kind: 'character', id: character.id }, { id: 'gm-token', ownership: { ownerId: null, editableBy: ['gm'], visibility: 'gm' } })
    ]
  });

  const model = buildPlayerViewModel({
    game,
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [{ id: 'log-1', type: 'manual', createdAt: '2026-05-21T00:00:00.000Z', title: 'Сводка', text: 'Игроки входят в зал.' }]
  });

  assert.equal(model.scene.imageUrl, 'https://example.test/scene.webp');
  assert.equal(model.fear.value, 3);
  assert.deepEqual(model.tokens.map((token) => token.id), ['visible-token']);
  assert.equal(model.handout?.title, 'Карта руин');
  assert.equal(model.latestRoll?.title, 'Сводка');
  assert.equal(model.character, null);

  const assigned = characterService.createCharacter({
    name: 'Назначенный герой',
    className: 'Sorcerer',
    thresholds: { major: 8, severe: 16 },
    experiences: [{ id: 'exp-pyro', name: 'Pyromaniac', modifier: 2 }],
    weapons: [{ id: 'weapon-bow', name: 'Shortbow', trait: 'finesse', range: 'Far', damageFormula: '1d8+1', damageType: 'physical' }],
    domainCards: [{
      id: 'card-flight',
      name: 'Flight',
      domain: 'Grace',
      level: 1,
      cost: '1 Hope',
      text: 'Take flight for a scene.',
      inLoadout: true,
      tokens: { value: 2, max: 6 }
    }, {
      id: 'card-archive',
      name: 'Archived Spell',
      domain: 'Codex',
      level: 2,
      cost: '1 Stress',
      text: 'Kept outside the loadout.',
      inLoadout: false,
      tokens: { value: 0, max: 0 }
    }],
    sheetCards: [
      { id: 'feature-ribbet', kind: 'ancestryFeature', name: 'Ribbet Leap', subtitle: 'Ancestry', text: 'Leap with ease.' },
      { id: 'sheet-domain-flight', kind: 'domainCard', name: 'Flight', subtitle: 'Grace', text: 'Take flight for a scene.' },
      { id: 'sheet-item-lantern', kind: 'item', name: 'Lantern', text: 'A reliable light.' },
      { id: 'sheet-note-background', kind: 'note', name: 'Background', text: 'Private sheet note.' }
    ],
    inventory: [createInventoryItem({ name: 'Lantern' }), createInventoryItem({ name: 'Rope' })],
    conditions: [{ id: 'condition-hidden', name: 'Hidden', notes: 'Hard to spot.' }]
  });
  sceneTableService.assignLocalPlayerCharacter(assigned.id);
  assert.deepEqual(sceneTableStore.getSnapshot().participants['local-player']?.actorIds, [assigned.id]);
  const seat = sceneTableService.createPlayerSeat({ name: 'Лея', characterId: assigned.id });
  assert.equal(sceneTableStore.getSnapshot().participants[seat.id]?.name, 'Лея');
  assert.deepEqual(sceneTableStore.getSnapshot().participants[seat.id]?.actorIds, [assigned.id]);
  sceneTableService.updatePlayerSeat(seat.id, { name: 'Лея Шторм', characterId: null });
  assert.equal(sceneTableStore.getSnapshot().participants[seat.id]?.name, 'Лея Шторм');
  assert.deepEqual(sceneTableStore.getSnapshot().participants[seat.id]?.actorIds, []);
  sceneTableService.removePlayerSeat(seat.id);
  assert.equal(sceneTableStore.getSnapshot().participants[seat.id], undefined);
  const assignedModel = buildPlayerViewModel({
    game,
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [],
    playerCharacterId: assigned.id
  });
  assert.equal(assignedModel.character?.id, assigned.id);
  assert.equal(assignedModel.character?.className, 'Sorcerer');
  assert.equal(assignedModel.character?.subtitle.includes('Чародей'), true);
  assert.equal(assignedModel.character?.thresholds.major, 8);
  assert.deepEqual(assignedModel.character?.weapons.map((weapon) => weapon.name), ['Shortbow']);
  assert.deepEqual(assignedModel.character?.experiences.map((experience) => experience.name), ['Pyromaniac']);
  assert.deepEqual(assignedModel.character?.loadoutCards.map((card) => card.name), ['Flight', 'Archived Spell']);
  assert.deepEqual(assignedModel.character?.loadoutCards.map((card) => card.domain), ['Grace', 'Codex']);
  assert.deepEqual(assignedModel.character?.loadoutCards.map((card) => card.domainLabel), ['Грация', 'Кодекс']);
  assert.deepEqual(assignedModel.character?.features.map((feature) => feature.name), ['Ribbet Leap']);
  assert.deepEqual(assignedModel.character?.inventory.map((item) => item.name), ['Lantern', 'Rope']);
  assert.deepEqual(assignedModel.character?.conditions.map((condition) => condition.name), ['Hidden']);
});

test('mini dice launcher mode follows role and selected actor', () => {
  assert.equal(resolveMiniDiceLauncherMode({ role: 'player', selectedActorKind: null }), 'duality');
  assert.equal(resolveMiniDiceLauncherMode({ role: 'gm', selectedActorKind: 'character' }), 'duality');
  assert.equal(resolveMiniDiceLauncherMode({ role: 'gm', selectedActorKind: 'adversary' }), 'd20');
  assert.equal(resolveMiniDiceLauncherMode({ role: 'gm', selectedActorKind: null }), 'd20');
});

test('mini dice tray bonus mode follows actual tray dice', () => {
  assert.equal(resolveMiniDiceTrayBonusMode({ hasHope: true, hasFear: true, dieSides: [] }), 'duality');
  assert.equal(resolveMiniDiceTrayBonusMode({ hasHope: false, hasFear: false, dieSides: [20] }), 'd20');
  assert.equal(resolveMiniDiceTrayBonusMode({ hasHope: true, hasFear: true, dieSides: [20] }), 'mixed');
  assert.equal(resolveMiniDiceTrayBonusMode({ hasHope: false, hasFear: false, dieSides: [20, 20] }), 'mixed');
});

test('default table art varies by scene context and character ancestry', () => {
  resetAllStores();
  const tavernScene = createTableScene({ name: 'Сцена в таверне', backgroundUrl: '' });
  const tacticalScene = createTableScene({ name: 'Безымянная схватка', mode: 'tactical', backgroundUrl: '' });
  assert.equal(defaultSceneImageUrl(tavernScene), './image/environment/cliffside-tavern.png');
  assert.equal(defaultSceneImageUrl(tacticalScene), './image/environment/pitched-battle.png');

  const elf = characterService.createCharacter({ name: 'Лея', ancestry: 'Эльф', portraitUrl: '' });
  const unknown = characterService.createCharacter({ name: 'Без портрета', ancestry: '', portraitUrl: '' });
  assert.equal(defaultCharacterPortraitUrl(elf), './image/ancestry/card/elf.jpg');
  assert.notEqual(defaultCharacterPortraitUrl(unknown), './image/ancestry/card/ribbet.jpg');

  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: createTableScene({
      name: 'Лесная засада',
      backgroundUrl: '',
      tokens: [createTokenState({ kind: 'character', id: elf.id })]
    }),
    assets: {},
    assetUrls: {},
    rollLog: [],
    playerCharacterId: elf.id
  });
  assert.equal(model.scene.imageUrl, './image/environment/abandoned-grove.png');
  assert.equal(model.character?.portraitUrl, './image/ancestry/card/elf.jpg');
  assert.equal(model.tokens[0]?.imageUrl, './image/ancestry/card/elf.jpg');
});

test('player view model does not fall back to GM-selected or unassigned characters', () => {
  resetAllStores();
  const selected = firstCharacter();
  const unassigned = characterService.createCharacter({ name: 'Неназначенный герой' });
  characterService.selectCharacter(selected.id);

  const game = createGameState();
  const privateHandout = createGameHandout();
  game.handouts = [privateHandout];
  privateHandout.visibleToPlayers = false;
  privateHandout.title = 'Секрет GM';
  privateHandout.body = 'Не показывать игрокам.';
  game.presentedHandoutId = privateHandout.id;

  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: selected.id }, { id: 'selected-public-token' }),
      createTokenState({ kind: 'character', id: unassigned.id }, { id: 'unassigned-hidden-token', hidden: true })
    ]
  });

  const model = buildPlayerViewModel({
    game,
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: []
  });

  assert.equal(model.character, null);
  assert.equal(model.handout, null);
  assert.deepEqual(model.tokens.map((token) => token.id), ['selected-public-token']);

  const assignedModel = buildPlayerViewModel({
    game,
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [],
    playerCharacterId: unassigned.id
  });

  assert.equal(assignedModel.character?.id, unassigned.id);
});

test('player session roster exposes only the assigned character', () => {
  resetAllStores();
  const own = firstCharacter();
  const other = characterService.createCharacter({ name: 'Чужой герой' });
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: own.id }, { id: 'own-token' }),
      createTokenState({ kind: 'character', id: other.id }, { id: 'other-token' })
    ]
  });
  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [],
    playerCharacterId: own.id,
    role: 'player'
  });

  assert.deepEqual(model.tokens.map((token) => token.id), ['own-token', 'other-token']);
  const playerRoster = buildSessionRosterActors({
    tokens: model.tokens,
    characters: charactersStore.getSnapshot(),
    adversaries: encounterService.encounterStore.getSnapshot().adversaries,
    role: 'player',
    playerCharacterId: own.id,
    activationQueue: [],
    presence: {}
  });
  assert.deepEqual(playerRoster.map((actor) => actor.actorId), [own.id]);

  const gmRoster = buildSessionRosterActors({
    tokens: model.tokens,
    characters: charactersStore.getSnapshot(),
    adversaries: encounterService.encounterStore.getSnapshot().adversaries,
    role: 'gm',
    playerCharacterId: own.id,
    activationQueue: [],
    presence: {}
  });
  assert.ok(gmRoster.some((actor) => actor.actorId === other.id));
});

test('player view model exposes adversary details only to GM role', () => {
  resetAllStores();
  const adversary = encounterService.createAdversary({
    name: 'Ржавый рыцарь',
    tier: 2,
    difficulty: 14,
    imageUrl: 'https://example.test/knight.png',
    summary: 'Хранит [старые ворота](/rule/far).',
    features: [{
      id: 'rust-call',
      name: 'Ржавый зов',
      kind: 'fear',
      cost: 'Страх',
      text: '[Потратьте Страх](/rule/spending-fear), чтобы **активировать** стражей.'
    }]
  });
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'adversary', id: adversary.id }, { id: 'adversary-token' })
    ]
  });
  const baseInput = {
    game: createGameState(),
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: []
  };

  const playerModel = buildPlayerViewModel({ ...baseInput, role: 'player' });
  const gmModel = buildPlayerViewModel({ ...baseInput, role: 'gm' });

  assert.deepEqual(playerModel.tokens.map((token) => token.name), ['Ржавый рыцарь']);
  assert.equal(playerModel.adversaries[adversary.id], undefined);
  assert.equal(gmModel.adversaries[adversary.id]?.name, 'Ржавый рыцарь');
  assert.equal(gmModel.adversaries[adversary.id]?.portraitUrl, 'https://example.test/knight.png');
  assert.equal(gmModel.adversaries[adversary.id]?.notes, 'Хранит **старые ворота**.');
  assert.equal(gmModel.adversaries[adversary.id]?.features[0]?.text, '**Потратьте Страх**, чтобы **активировать** стражей.');
});

test('player view model exposes environment tokens but keeps environment details GM-only', () => {
  resetAllStores();
  const environment = encounterService.createEnvironment({
    name: 'Штормовой мост',
    tier: 2,
    difficulty: 15,
    typeName: 'Опасное окружение',
    summary: 'Мост раскачивается над бездной.',
    featureText: '**Потратьте Страх**, чтобы сорвать крепление.',
    imageUrl: 'https://example.test/bridge.png'
  });
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'environment', id: environment.id }, { id: 'environment-token' })
    ]
  });
  const baseInput = {
    game: createGameState(),
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: []
  };

  const playerModel = buildPlayerViewModel({ ...baseInput, role: 'player' });

  assert.deepEqual(playerModel.tokens.map((token) => `${token.kind}:${token.name}`), ['environment:Штормовой мост']);
  assert.equal(encounterService.encounterStore.getSnapshot().environments[environment.id]?.featureText, '**Потратьте Страх**, чтобы сорвать крепление.');
});

test('player view model leaves adversary portrait empty when library art is missing', () => {
  resetAllStores();
  const adversary = encounterService.createAdversary({
    name: 'Гигантская Крыса',
    notes: 'Грызун размером с кошку, мастер выживания'
  });
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'adversary', id: adversary.id }, { id: 'rat-token' })
    ]
  });

  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [],
    role: 'gm'
  });

  assert.equal(model.tokens[0]?.imageUrl, '');
  assert.equal(model.adversaries[adversary.id]?.portraitUrl, '');
});
