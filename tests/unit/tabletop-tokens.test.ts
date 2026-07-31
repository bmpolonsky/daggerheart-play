import { test } from "vitest";
import assert from "node:assert/strict";
import { createGameState } from "../../src/domain/rules/factories";
import { buildPlayerViewModel } from "../../src/domain/tabletop/playerView";
import { autoArrangeTokens, measureRange, syncSceneTokens } from "../../src/domain/tabletop/logic";
import { arrangedTokenPositionForActor, createTableScene, createTokenState, nextArrangedTokenPositionForActor, randomAvailableTokenPosition } from "../../src/domain/tabletop/factories";
import { clientPointToWorld, rangeLabelStyle, rangeLineStyle, tokenPositionStyle, worldToPercent } from "../../src/domain/tabletop/viewport";
import { resetAllStores, charactersStore, sceneTableStore } from "../../src/stores/gameStores";
import { characterService, encounterService, sceneTableService, tabletopService } from "../../src/services/serviceRegistry";
import { shouldIgnoreTokenDeleteShortcut } from "../../src/ui/vtt/playerView/helpers";
import { ActorStatus } from "../../src/domain/rules/statuses";
import type { Adversary, Character } from "../../src/domain/rules/types";
import { firstCharacter } from "./helpers";

test('tabletop range measurement uses world coordinates and Daggerheart range bands', () => {
  const range = measureRange(
    { id: 'a', actor: { kind: 'character', id: 'a' }, x: 0, y: 0, width: 72, height: 72, rotation: 0, hidden: false, locked: false, ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' } },
    { id: 'b', actor: { kind: 'adversary', id: 'b' }, x: 144, y: 0, width: 72, height: 72, rotation: 0, hidden: false, locked: false, ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' } },
    48
  );
  assert.equal(range?.cells, 3);
  assert.equal(range?.category, 'Близкая');
});

test('createTokenState defaults tokens inside safe tactical placement columns', () => {
  const characterToken = createTokenState({ kind: 'character', id: 'safe-hero' });
  const companionToken = createTokenState({ kind: 'companion', id: 'safe-hero' });
  const adversaryToken = createTokenState({ kind: 'adversary', id: 'safe-raider' });

  assert.equal(characterToken.x, 360);
  assert.equal(companionToken.x, 360);
  assert.equal(adversaryToken.x, 600);
  assert.equal(characterToken.y, 520);
  assert.equal(adversaryToken.y, 520);
});

test('syncSceneTokens creates missing actor tokens in safe tactical placement columns', () => {
  const scene = createTableScene();
  const characters = [{ id: 'safe-hero-a' }, { id: 'safe-hero-b' }] as Character[];
  const adversaries = [{ id: 'safe-raider-a' }, { id: 'safe-raider-b' }] as Adversary[];
  const synced = syncSceneTokens(
    scene,
    characters,
    adversaries
  );
  const heroTokens = synced.tokens.filter((token) => token.actor.kind === 'character');
  const adversaryTokens = synced.tokens.filter((token) => token.actor.kind === 'adversary');

  assert.deepEqual(heroTokens.map((token) => token.x), [420, 420]);
  assert.deepEqual(adversaryTokens.map((token) => token.x), [540, 540]);
  assert.deepEqual(heroTokens.map((token) => token.y), [200, 360]);
  assert.deepEqual(adversaryTokens.map((token) => token.y), [200, 360]);
});

test('autoArrangeTokens moves characters and adversaries into safe tactical placement columns', () => {
  const arranged = autoArrangeTokens([
    createTokenState({ kind: 'character', id: 'safe-hero-a' }, { x: 20, y: 20, hidden: true }),
    createTokenState({ kind: 'adversary', id: 'safe-raider-a' }, { x: 1240, y: 20, hidden: true }),
    createTokenState({ kind: 'character', id: 'safe-hero-b' }, { x: 20, y: 680, hidden: true }),
    createTokenState({ kind: 'adversary', id: 'safe-raider-b' }, { x: 1240, y: 680, hidden: true })
  ]);

  assert.deepEqual(arranged.map((token) => token.x), [420, 540, 420, 540]);
  assert.deepEqual(arranged.map((token) => token.y), [200, 200, 360, 360]);
  assert.deepEqual(arranged.map((token) => token.hidden), [false, false, false, false]);
});

test('arranged token positions wrap into visible columns instead of running below the board', () => {
  const actor = { kind: 'adversary', id: 'wrapped-raider' } as const;

  assert.deepEqual(arrangedTokenPositionForActor(actor, 0), { x: 540, y: 200 });
  assert.deepEqual(arrangedTokenPositionForActor(actor, 3), { x: 540, y: 680 });
  assert.deepEqual(arrangedTokenPositionForActor(actor, 4), { x: 720, y: 200 });
  assert.deepEqual(arrangedTokenPositionForActor(actor, 11), { x: 900, y: 680 });
});

test('next arranged token position fills a free slot instead of overlapping another token', () => {
  const actor = { kind: 'adversary', id: 'next-raider' } as const;
  const tokens = [
    createTokenState({ kind: 'adversary', id: 'existing-a' }, arrangedTokenPositionForActor(actor, 0)),
    createTokenState({ kind: 'adversary', id: 'existing-c' }, arrangedTokenPositionForActor(actor, 2))
  ];

  assert.deepEqual(nextArrangedTokenPositionForActor(actor, tokens), arrangedTokenPositionForActor(actor, 1));
});

test('random token position stays in the safe area and retries an occupied point', () => {
  const values = [0, 0, 0.5, 0.5];
  const occupied = createTokenState({ kind: 'adversary', id: 'occupied' }, { x: 320, y: 160 });

  assert.deepEqual(randomAvailableTokenPosition([occupied], () => values.shift() ?? 0.5), { x: 640, y: 360 });
});

test('locked tabletop tokens cannot be moved through the service', () => {
  resetAllStores();
  const character = firstCharacter();
  sceneTableService.updateActiveScene(createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'locked-token', x: 120, y: 180, locked: true })
    ]
  }));

  tabletopService.moveToken('locked-token', 640, 360);

  const token = sceneTableService.getActiveScene().tokens.find((item) => item.id === 'locked-token');
  assert.equal(token?.x, 120);
  assert.equal(token?.y, 180);
});

test('player token movement guard moves the assigned character and companion tokens only', () => {
  resetAllStores();
  const character = firstCharacter();
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'player-token', x: 120, y: 180 }),
      createTokenState({ kind: 'companion', id: character.id }, { id: 'companion-token', x: 200, y: 180 }),
      createTokenState({ kind: 'companion', id: 'another-character' }, { id: 'foreign-companion-token', x: 260, y: 180 }),
      createTokenState({ kind: 'adversary', id: 'raider' }, { id: 'npc-token', x: 320, y: 180 })
    ]
  });
  sceneTableService.updateActiveScene(scene);

  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'npc-token', 640, 360, character.id), false);
  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'foreign-companion-token', 640, 360, character.id), false);
  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'player-token', 640, 360, character.id), true);
  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'companion-token', 700, 360, character.id), true);

  const tokens = sceneTableService.getActiveScene().tokens;
  assert.equal(tokens.find((token) => token.id === 'npc-token')?.x, 320);
  assert.equal(tokens.find((token) => token.id === 'foreign-companion-token')?.x, 260);
  assert.equal(tokens.find((token) => token.id === 'player-token')?.x, 640);
  assert.equal(tokens.find((token) => token.id === 'companion-token')?.x, 700);
});

test('hiding a tabletop token clears selected state', () => {
  resetAllStores();
  const character = firstCharacter();
  sceneTableService.updateActiveScene(createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'focus-token' })
    ]
  }));
  sceneTableService.selectToken('focus-token');

  const updated = sceneTableService.setTokenHidden('focus-token', true);
  const state = sceneTableStore.get();

  assert.equal(updated?.hidden, true);
  assert.equal(state.selectedTokenId, null);
});

test('GM visibility token flag hides the token from PlayerView', () => {
  resetAllStores();
  const character = firstCharacter();
  sceneTableService.updateActiveScene(createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'private-token' })
    ]
  }));

  const updated = tabletopService.setTokenVisibility('private-token', 'gm');
  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.get(),
    encounter: encounterService.encounter$.get(),
    liveScene: sceneTableService.getActiveScene(),
    assets: {},
    assetUrls: {},
    rollLog: []
  });

  assert.equal(updated?.ownership.visibility, 'gm');
  assert.deepEqual(model.tokens.map((token) => token.id), []);
});

test('player view token model marks zero-HP characters and defeated adversaries', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 1);
  characterService.markSlots(character.id, 'hp', 1);
  const adversary = encounterService.createAdversary({
    name: 'Костяной страж',
    hp: { marked: 2, max: 2 },
    conditions: [{ id: 'condition-restrained', name: ActorStatus.Restrained }]
  });
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'zero-hp-character' }),
      createTokenState({ kind: 'adversary', id: adversary.id }, { id: 'defeated-adversary' })
    ]
  });

  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: charactersStore.get(),
    encounter: encounterService.encounter$.get(),
    liveScene: scene,
    assets: {},
    assetUrls: {},
    rollLog: [],
    role: 'gm'
  });

  assert.equal(model.tokens.find((token) => token.id === 'zero-hp-character')?.statuses?.includes(ActorStatus.Defeated), true);
  assert.equal(model.tokens.find((token) => token.id === 'defeated-adversary')?.statuses?.includes(ActorStatus.Defeated), true);
  assert.deepEqual(model.adversaries[adversary.id]?.conditions.map((condition) => condition.name), [ActorStatus.Defeated, ActorStatus.Restrained]);
});

test('removing a token from scene does not delete actor state', () => {
  resetAllStores();
  const character = firstCharacter();
  sceneTableService.updateActiveScene(createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'scene-only-token' })
    ]
  }));

  const removed = tabletopService.removeTokenFromScene('scene-only-token');

  assert.equal(removed, true);
  assert.equal(sceneTableService.getActiveScene().tokens.some((token) => token.id === 'scene-only-token'), false);
  assert.equal(characterService.getCharacter(character.id)?.id, character.id);
});

test('orphan tokens are pruned from every scene while live and hidden tokens remain', () => {
  resetAllStores();
  const character = firstCharacter();
  const adversary = encounterService.createAdversary({ name: 'Живой противник' });
  const firstScene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'live-character', hidden: true }),
      createTokenState({ kind: 'character', id: 'deleted-character' }, { id: 'orphan-character' })
    ]
  });
  const secondScene = createTableScene({
    tokens: [
      createTokenState({ kind: 'adversary', id: adversary.id }, { id: 'live-adversary' }),
      createTokenState({ kind: 'adversary', id: 'deleted-adversary' }, { id: 'orphan-adversary' })
    ]
  });
  sceneTableStore.update((state) => ({
    ...state,
    activeSceneId: firstScene.id,
    liveSceneId: firstScene.id,
    scenes: { [firstScene.id]: firstScene, [secondScene.id]: secondScene },
    sceneOrder: [firstScene.id, secondScene.id],
    selectedTokenId: 'orphan-character'
  }));

  const removed = sceneTableService.pruneOrphanTokens(charactersStore.get(), encounterService.encounter$.get());

  assert.equal(removed, 2);
  assert.deepEqual(sceneTableStore.get().scenes[firstScene.id].tokens.map((token) => token.id), ['live-character']);
  assert.deepEqual(sceneTableStore.get().scenes[secondScene.id].tokens.map((token) => token.id), ['live-adversary']);
  assert.equal(sceneTableStore.get().selectedTokenId, null);
});

test('deleting a character removes its character and companion tokens from every scene', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.ensureRangerCompanion(character.id, { name: 'Компаньон' });
  const firstScene = createTableScene({
    tokens: [createTokenState({ kind: 'character', id: character.id }, { id: 'character-token' })]
  });
  const secondScene = createTableScene({
    tokens: [createTokenState({ kind: 'companion', id: character.id }, { id: 'companion-token' })]
  });
  sceneTableStore.update((state) => ({
    ...state,
    activeSceneId: firstScene.id,
    liveSceneId: firstScene.id,
    scenes: { [firstScene.id]: firstScene, [secondScene.id]: secondScene },
    sceneOrder: [firstScene.id, secondScene.id]
  }));

  tabletopService.deleteCharacter(character.id);

  assert.equal(characterService.getCharacter(character.id), null);
  assert.deepEqual(sceneTableStore.get().scenes[firstScene.id].tokens, []);
  assert.deepEqual(sceneTableStore.get().scenes[secondScene.id].tokens, []);
});

test('placing actors on a scene is idempotent and supports adversaries', () => {
  resetAllStores();
  const adversary = encounterService.createAdversary({ name: 'Теневой нож' });
  const scene = sceneTableService.getActiveScene();

  const firstTokenId = tabletopService.placeActorOnScene({ kind: 'adversary', id: adversary.id }, scene.id);
  const secondTokenId = tabletopService.placeActorOnScene({ kind: 'adversary', id: adversary.id }, scene.id);
  const tokens = sceneTableService.getActiveScene().tokens.filter((token) => token.actor.kind === 'adversary' && token.actor.id === adversary.id);

  assert.equal(firstTokenId, `adversary:${adversary.id}`);
  assert.equal(secondTokenId, firstTokenId);
  assert.equal(tokens.length, 1);
  assert.equal(encounterService.getAdversary(adversary.id)?.id, adversary.id);
});

test('placing an actor after a removal reuses the free slot without stacking tokens', () => {
  resetAllStores();
  const first = encounterService.createAdversary({ name: 'Первый' });
  const second = encounterService.createAdversary({ name: 'Второй' });
  const third = encounterService.createAdversary({ name: 'Третий' });
  const replacement = encounterService.createAdversary({ name: 'Замена' });
  const scene = sceneTableService.getActiveScene();

  tabletopService.placeActorOnScene({ kind: 'adversary', id: first.id }, scene.id);
  const secondTokenId = tabletopService.placeActorOnScene({ kind: 'adversary', id: second.id }, scene.id);
  tabletopService.placeActorOnScene({ kind: 'adversary', id: third.id }, scene.id);
  assert.ok(secondTokenId);
  tabletopService.removeTokenFromScene(secondTokenId, scene.id);
  tabletopService.placeActorOnScene({ kind: 'adversary', id: replacement.id }, scene.id);

  const adversaryTokens = sceneTableService.getActiveScene().tokens.filter((token) => token.actor.kind === 'adversary');
  assert.deepEqual(adversaryTokens.map((token) => [token.x, token.y]), [
    [540, 200],
    [540, 520],
    [540, 360]
  ]);
  assert.equal(new Set(adversaryTokens.map((token) => `${token.x}:${token.y}`)).size, adversaryTokens.length);
});

test('placing a hidden actor randomly does not move existing tokens and can be revealed in the target scene', () => {
  resetAllStores();
  const first = encounterService.createAdversary({ name: 'Стоящий на месте' });
  const second = encounterService.createAdversary({ name: 'Новый скрытый' });
  const scene = sceneTableService.getActiveScene();
  const firstTokenId = tabletopService.placeActorOnScene({ kind: 'adversary', id: first.id }, scene.id);
  assert.ok(firstTokenId);
  tabletopService.moveToken(firstTokenId, 440, 280);

  const secondTokenId = tabletopService.placeActorOnScene(
    { kind: 'adversary', id: second.id },
    scene.id,
    { hidden: true, placement: 'random', random: () => 0.75 }
  );
  assert.ok(secondTokenId);

  const placedScene = sceneTableService.getActiveScene();
  const firstToken = placedScene.tokens.find((token) => token.id === firstTokenId);
  const secondToken = placedScene.tokens.find((token) => token.id === secondTokenId);
  assert.deepEqual(firstToken && [firstToken.x, firstToken.y], [440, 280]);
  assert.deepEqual(secondToken && [secondToken.x, secondToken.y, secondToken.hidden], [800, 460, true]);

  const revealed = sceneTableService.setTokenHiddenInScene(scene.id, secondTokenId, false);
  assert.equal(revealed?.hidden, false);
  const unmovedFirstToken = sceneTableService.getActiveScene().tokens.find((token) => token.id === firstTokenId);
  assert.deepEqual(unmovedFirstToken && [unmovedFirstToken.x, unmovedFirstToken.y], [440, 280]);
});

test('deleting and re-adding an actor creates it at a new random position', () => {
  resetAllStores();
  const adversary = encounterService.createAdversary({ name: 'Возвращающийся' });
  const scene = sceneTableService.getActiveScene();
  const firstTokenId = tabletopService.placeActorOnScene(
    { kind: 'adversary', id: adversary.id },
    scene.id,
    { hidden: true, placement: 'random', random: () => 0.1 }
  );
  assert.ok(firstTokenId);
  const firstPosition = sceneTableService.getActiveScene().tokens.find((token) => token.id === firstTokenId);
  assert.ok(firstPosition);

  assert.equal(tabletopService.removeTokenFromScene(firstTokenId, scene.id), true);
  const secondTokenId = tabletopService.placeActorOnScene(
    { kind: 'adversary', id: adversary.id },
    scene.id,
    { hidden: true, placement: 'random', random: () => 0.9 }
  );
  assert.equal(secondTokenId, firstTokenId);
  const secondPosition = sceneTableService.getActiveScene().tokens.find((token) => token.id === secondTokenId);
  assert.ok(secondPosition);

  assert.notDeepEqual([secondPosition.x, secondPosition.y], [firstPosition.x, firstPosition.y]);
  assert.equal(secondPosition.hidden, true);
});

test('hiding an actor hides its tokens without moving them', () => {
  resetAllStores();
  const adversary = encounterService.createAdversary({ name: 'Уходящий в тень' });
  const scene = sceneTableService.getActiveScene();
  const tokenId = tabletopService.placeActorOnScene({ kind: 'adversary', id: adversary.id }, scene.id);
  assert.ok(tokenId);
  tabletopService.moveToken(tokenId, 710, 390);

  assert.equal(sceneTableService.setActorTokensHidden({ kind: 'adversary', id: adversary.id }, true), 1);
  const hiddenToken = sceneTableService.getActiveScene().tokens.find((token) => token.id === tokenId);

  assert.deepEqual(hiddenToken && [hiddenToken.x, hiddenToken.y, hiddenToken.hidden], [710, 390, true]);
});

test('token delete shortcut ignores editable targets', () => {
  assert.equal(shouldIgnoreTokenDeleteShortcut(null), false);
  assert.equal(shouldIgnoreTokenDeleteShortcut({ tagName: 'INPUT' } as unknown as EventTarget), true);
  assert.equal(shouldIgnoreTokenDeleteShortcut({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
  assert.equal(shouldIgnoreTokenDeleteShortcut({ tagName: 'SELECT' } as unknown as EventTarget), true);
  assert.equal(shouldIgnoreTokenDeleteShortcut({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(shouldIgnoreTokenDeleteShortcut({ tagName: 'BUTTON' } as unknown as EventTarget), false);
});

test('duplicating a token clamps the duplicate inside world bounds', () => {
  resetAllStores();
  const character = firstCharacter();
  const token = createTokenState({ kind: 'character', id: character.id }, { id: 'edge-token', x: 955, y: 955 });
  sceneTableService.updateActiveScene(createTableScene({ tokens: [token] }));

  tabletopService.duplicateToken(token);

  const duplicated = sceneTableService.getActiveScene().tokens.find((item) => item.id !== 'edge-token');
  assert.equal(duplicated?.x, 960);
  assert.equal(duplicated?.y, 960);
});

test('tabletop viewport geometry converts world, client, token, and range coordinates', () => {
  assert.deepEqual(worldToPercent({ x: 480, y: 240 }), { x: 50, y: 25 });
  assert.deepEqual(worldToPercent({ x: 50, y: 25 }, { width: 200, height: 100 }), { x: 25, y: 25 });

  assert.deepEqual(
    clientPointToWorld(
      { clientX: 150, clientY: 70 },
      { left: 50, top: 20, width: 200, height: 100 }
    ),
    { x: 480, y: 480 }
  );

  assert.deepEqual(tokenPositionStyle({ x: 96, y: 96, width: 72 }), {
    '--dh-token-x': '100%',
    '--dh-token-y': '10%',
    '--dh-token-size': '72px',
    left: '10%',
    top: '10%',
    transform: 'translate(-50%, -50%)'
  });

  const line = { left: 96, top: 96, width: 240, angle: Math.PI / 2, labelLeft: 192, labelTop: 192 };
  assert.deepEqual(rangeLineStyle(line), {
    left: '10%',
    top: '10%',
    width: '25%',
    transform: `rotate(${Math.PI / 2}rad)`
  });
  assert.deepEqual(rangeLabelStyle(line), { left: '20%', top: '20%' });
});
