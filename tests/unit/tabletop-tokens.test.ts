import { test } from "vitest";
import assert from "node:assert/strict";
import { createGameState } from "../../src/domain/rules/factories";
import { buildPlayerViewModel } from "../../src/domain/tabletop/playerView";
import { autoArrangeTokens, measureRange, syncSceneTokens } from "../../src/domain/tabletop/logic";
import { createTableScene, createTokenState } from "../../src/domain/tabletop/factories";
import { clientPointToWorld, rangeLabelStyle, rangeLineStyle, tokenPositionStyle, worldToPercent } from "../../src/domain/tabletop/viewport";
import { resetAllStores, charactersStore, sceneTableStore } from "../../src/stores/gameStores";
import { characterService, encounterService, sceneTableService, tabletopService } from "../../src/services/serviceRegistry";
import { shouldIgnoreTokenDeleteShortcut } from "../../src/ui/vtt/playerView/helpers";
import type { Adversary, Character } from "../../src/domain/rules/types";
import { firstCharacter } from "./helpers";

test('tabletop range measurement uses world coordinates and Daggerheart range bands', () => {
  const range = measureRange(
    { id: 'a', actor: { kind: 'character', id: 'a' }, x: 0, y: 0, width: 72, height: 72, rotation: 0, hidden: false, locked: false, ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' } },
    { id: 'b', actor: { kind: 'adversary', id: 'b' }, x: 144, y: 0, width: 72, height: 72, rotation: 0, hidden: false, locked: false, ownership: { ownerId: null, editableBy: ['gm'], visibility: 'public' } },
    48
  );
  assert.equal(range?.cells, 3);
  assert.equal(range?.category, 'Близко');
});

test('createTokenState defaults tokens inside safe tactical placement columns', () => {
  const characterToken = createTokenState({ kind: 'character', id: 'safe-hero' });
  const adversaryToken = createTokenState({ kind: 'adversary', id: 'safe-raider' });

  assert.equal(characterToken.x, 360);
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

  assert.deepEqual(heroTokens.map((token) => token.x), [360, 360]);
  assert.deepEqual(adversaryTokens.map((token) => token.x), [600, 600]);
  assert.deepEqual(heroTokens.map((token) => token.y), [380, 472]);
  assert.deepEqual(adversaryTokens.map((token) => token.y), [380, 466]);
});

test('autoArrangeTokens moves characters and adversaries into safe tactical placement columns', () => {
  const arranged = autoArrangeTokens([
    createTokenState({ kind: 'character', id: 'safe-hero-a' }, { x: 20, y: 20, hidden: true }),
    createTokenState({ kind: 'adversary', id: 'safe-raider-a' }, { x: 1240, y: 20, hidden: true }),
    createTokenState({ kind: 'character', id: 'safe-hero-b' }, { x: 20, y: 680, hidden: true }),
    createTokenState({ kind: 'adversary', id: 'safe-raider-b' }, { x: 1240, y: 680, hidden: true })
  ]);

  assert.deepEqual(arranged.map((token) => token.x), [360, 600, 360, 600]);
  assert.deepEqual(arranged.map((token) => token.y), [380, 380, 472, 466]);
  assert.deepEqual(arranged.map((token) => token.hidden), [false, false, false, false]);
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

test('player token movement guard only moves the assigned public character token', () => {
  resetAllStores();
  const character = firstCharacter();
  const scene = createTableScene({
    tokens: [
      createTokenState({ kind: 'character', id: character.id }, { id: 'player-token', x: 120, y: 180 }),
      createTokenState({ kind: 'adversary', id: 'raider' }, { id: 'npc-token', x: 320, y: 180 })
    ]
  });
  sceneTableService.updateActiveScene(scene);

  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'npc-token', 640, 360, character.id), false);
  assert.equal(sceneTableService.moveTokenInScene(scene.id, 'player-token', 640, 360, character.id), true);

  const tokens = sceneTableService.getActiveScene().tokens;
  assert.equal(tokens.find((token) => token.id === 'npc-token')?.x, 320);
  assert.equal(tokens.find((token) => token.id === 'player-token')?.x, 640);
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
  const state = sceneTableStore.getSnapshot();

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
    characters: charactersStore.getSnapshot(),
    encounter: encounterService.encounterStore.getSnapshot(),
    liveScene: sceneTableService.getActiveScene(),
    assets: {},
    assetUrls: {},
    rollLog: []
  });

  assert.equal(updated?.ownership.visibility, 'gm');
  assert.deepEqual(model.tokens.map((token) => token.id), []);
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
