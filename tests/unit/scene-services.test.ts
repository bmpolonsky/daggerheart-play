import { test } from "vitest";
import assert from "node:assert/strict";
import { resetAllStores, feedStore, sceneTableStore } from "../../src/stores/gameStores";
import { characterService, encounterService, feedService, sceneTableService, tabletopService } from "../../src/services/serviceRegistry";
import { firstCharacter } from "./helpers";

test('scene table service manages scene deck actions', () => {
  resetAllStores();
  const firstScene = sceneTableService.getActiveScene();
  const secondScene = sceneTableService.createScene({ name: 'Вторая сцена', subtitle: 'Колода сцен' });
  const duplicated = sceneTableService.duplicateScene(secondScene.id);

  assert.ok(duplicated);
  assert.equal(duplicated?.name, 'Вторая сцена копия');
  assert.equal(sceneTableService.sceneTable$.get().activeSceneId, duplicated?.id);

  assert.equal(sceneTableService.moveScene(duplicated!.id, 'up'), true);
  const reordered = sceneTableService.sceneTable$.get().sceneOrder;
  assert.equal(reordered[1], duplicated?.id);

  assert.equal(sceneTableService.deleteScene(firstScene.id), true);
  const state = sceneTableService.sceneTable$.get();
  assert.equal(state.scenes[firstScene.id], undefined);
  assert.equal(state.sceneOrder.includes(firstScene.id), false);
  assert.equal(sceneTableService.deleteScene(state.sceneOrder[0]), true);
  assert.equal(sceneTableService.deleteScene(sceneTableService.sceneTable$.get().sceneOrder[0]), false);
});

test('player seat assignments sync character player names', () => {
  resetAllStores();
  const roland = characterService.createCharacter({ name: 'Роланд' });
  const kadzu = characterService.createCharacter({ name: 'Кадсуанэ' });
  const seat = sceneTableService.createPlayerSeat({ name: 'Леся', characterId: roland.id });

  assert.equal(characterService.getCharacter(roland.id)?.playerName, 'Леся');
  assert.equal(characterService.getCharacter(kadzu.id)?.playerName, '');

  sceneTableService.updatePlayerSeat(seat.id, { name: 'Элина' });
  assert.equal(characterService.getCharacter(roland.id)?.playerName, 'Элина');

  sceneTableService.updatePlayerSeat(seat.id, { characterId: kadzu.id });
  assert.equal(characterService.getCharacter(roland.id)?.playerName, '');
  assert.equal(characterService.getCharacter(kadzu.id)?.playerName, 'Элина');

  sceneTableService.removePlayerSeat(seat.id);
  assert.equal(characterService.getCharacter(kadzu.id)?.playerName, '');
});

test('participant presence creates and updates unified player identities', () => {
  resetAllStores();
  const roland = characterService.createCharacter({ name: 'Роланд' });

  sceneTableService.upsertParticipantPresence({
    id: 'participant-1',
    name: 'Анна',
    role: 'player',
    actorIds: [roland.id],
    peerId: 'p2p_peer_anna',
    connected: true
  });

  assert.equal(sceneTableStore.get().participants['participant-1']?.name, 'Анна');
  assert.equal(sceneTableStore.get().participants['participant-1']?.peerId, 'p2p_peer_anna');
  assert.deepEqual(sceneTableStore.get().participants['participant-1']?.actorIds, [roland.id]);
  assert.equal(characterService.getCharacter(roland.id)?.playerName, 'Анна');

  sceneTableService.upsertParticipantPresence({
    id: 'participant-1',
    name: 'Анна Созвон',
    role: 'player',
    peerId: 'p2p_peer_anna',
    connected: true
  });

  assert.equal(sceneTableStore.get().participants['participant-1']?.name, 'Анна Созвон');
  assert.deepEqual(sceneTableStore.get().participants['participant-1']?.actorIds, [roland.id]);
  assert.equal(characterService.getCharacter(roland.id)?.playerName, 'Анна Созвон');

  sceneTableService.markParticipantDisconnectedByPeer('p2p_peer_anna');
  assert.equal(sceneTableStore.get().participants['participant-1']?.connected, false);
});

test('services import old combat builder and map scene JSON exports', () => {
  resetAllStores();
  const combatReport = encounterService.importCombatBuilderJson(JSON.stringify({
    combatEncounter: {
      entries: [{
        count: 1,
        adversary: {
          id: 10,
          tier: 2,
          roleId: 'bruiser',
          name: 'Громила',
          hp: 5,
          stress: 2,
          difficulty: 14
        }
      }]
    }
  }));

  assert.equal(combatReport.imported, 1);
  assert.equal(encounterService.encounter$.get().order.length, 1);
  assert.equal(encounterService.encounter$.get().battlePointBudget, 4);

  const character = firstCharacter();
  const sceneReport = sceneTableService.importLegacySceneJson(JSON.stringify({
    sceneCanvas: {
      name: 'Старая карта',
      mapMode: 'image',
      backgroundImageUrl: 'https://example.test/map.webp',
      gridSize: 64,
      tokens: [{ id: 'legacy-token', kind: 'character', sourceId: character.id, x: 25, y: 50, size: 'large' }]
    }
  }));
  const scene = sceneTableService.getActiveScene();

  assert.equal(sceneReport.imported, true);
  assert.equal(scene.name, 'Старая карта');
  assert.equal(scene.backgroundUrl, 'https://example.test/map.webp');
  assert.equal(scene.layers[0]?.gridSize, 64);
  assert.equal(scene.tokens[0]?.x, 240);
  assert.equal(scene.tokens[0]?.width, 92);
});

test('resolveRestMove rolls and applies selected short rest recovery once', () => {
  resetAllStores();
  const character = characterService.createCharacter({ name: 'Роланд', playerName: 'Игрок', level: 5 });
  characterService.markSlots(character.id, 'hp', 6);
  const initialHp = characterService.getCharacter(character.id)?.hp.marked ?? 0;
  const rest = feedService.requestRest('short', {
    participants: [{
      actorId: character.id,
      actorName: character.name,
      choices: [{ id: 'heal', label: 'Залечить Раны' }]
    }]
  });

  const result = tabletopService.resolveRestMove(rest.id, character.id, 'heal');
  const updatedCharacter = characterService.getCharacter(character.id);
  const updatedRest = feedStore.get().find((entry) => entry.id === rest.id && entry.type === 'rest');
  const choice = updatedRest?.type === 'rest' ? updatedRest.rest.participants[0]?.choices[0] : null;

  assert.equal(result.applied, true);
  assert.equal(choice?.status, 'resolved');
  assert.equal(choice?.result?.formula, '1d4+3');
  assert.ok((choice?.result?.total ?? 0) >= 4);
  assert.equal(updatedCharacter?.hp.marked, Math.max(0, initialHp - (choice?.result?.total ?? 0)));

  const second = tabletopService.resolveRestMove(rest.id, character.id, 'heal');
  assert.equal(second.applied, false);
  assert.equal(characterService.getCharacter(character.id)?.hp.marked, updatedCharacter?.hp.marked);
});
