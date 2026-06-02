import { test } from "vitest";
import assert from "node:assert/strict";
import { createGameState } from "../../src/domain/rules/factories";
import { resetAllStores } from "../../src/stores/gameStores";
import { gameService, characterService, diceService } from "../../src/services/serviceRegistry";
import { firstCharacter } from "./helpers";

test('stress marks Vulnerable on full track and overflows into HP', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'stress', 2);
  characterService.markStress(character.id, 5);

  const updated = characterService.getCharacter(character.id);
  assert.equal(updated?.stress.marked, 2);
  assert.equal(updated?.hp.marked, 1);
  assert.equal(updated?.conditions.some((condition) => condition.name === 'Уязвим'), true);

  characterService.clearStress(character.id, 1);
  const cleared = characterService.getCharacter(character.id);
  assert.equal(cleared?.stress.marked, 1);
  assert.equal(cleared?.conditions.some((condition) => condition.name === 'Уязвим'), false);
});

test('critical action roll clears stress through the same Vulnerable cleanup path', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'stress', 2);
  characterService.markStress(character.id, 2);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === 'Уязвим'), true);

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const roll = diceService.rollAction({ actorId: character.id, trait: 'agility', difficulty: 0, applyConsequences: true });
    assert.equal(roll.isCritical, true);
  } finally {
    Math.random = originalRandom;
  }

  const updated = characterService.getCharacter(character.id);
  assert.equal(updated?.stress.marked, 1);
  assert.equal(updated?.conditions.some((condition) => condition.name === 'Уязвим'), false);
});

test('new campaigns default to manual roll consequences', () => {
  assert.equal(createGameState().autoApplyRollConsequences, true);
});

test('action rolls do not apply Hope/Fear consequences unless explicitly enabled', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 1);
  characterService.markStress(character.id, 1);
  gameService.setFear(0);

  const roll = diceService.rollAction({ actorId: character.id, trait: 'agility', difficulty: 0 });

  assert.equal(roll.consequenceApplied, false);
  assert.equal(characterService.getCharacter(character.id)?.hope.value, 1);
  assert.equal(characterService.getCharacter(character.id)?.stress.marked, 1);
  assert.equal(gameService.gameStore.getSnapshot().fear, 0);
});

test('SRD resource caps clamp Hope, HP, Stress, Fear, and starting Fear by party size', () => {
  resetAllStores();
  const character = characterService.createCharacter({
    hp: { marked: 99, max: 99 },
    stress: { marked: 99, max: 99 },
    hope: { value: 99, max: 99 },
    armor: { name: 'Too much', baseMajor: 1, baseSevere: 2, score: 99, markedSlots: 99 }
  });

  assert.equal(character.hp.max, 12);
  assert.equal(character.stress.max, 12);
  assert.equal(character.hope.max, 6);
  assert.equal(character.armor.score, 12);

  characterService.updateResourceMax(character.id, 'hope', 99);
  assert.equal(characterService.getCharacter(character.id)?.hope.max, 6);
  characterService.updateProficiency(character.id, 99);
  assert.equal(characterService.getCharacter(character.id)?.proficiency, 6);
  characterService.updateProficiency(character.id, 0);
  assert.equal(characterService.getCharacter(character.id)?.proficiency, 1);

  gameService.setMaxFear(99);
  gameService.setFear(99);
  assert.equal(gameService.gameStore.getSnapshot().maxFear, 12);
  assert.equal(gameService.gameStore.getSnapshot().fear, 12);
  gameService.setStartingFearForPlayerCount(3);
  assert.equal(gameService.gameStore.getSnapshot().fear, 3);
});
