import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";
import { buildTableFeedFromEntries } from "../../src/domain/tabletop/feed";
import type { DeathMoveFeedEntry, FeedEntry } from "../../src/domain/rules/types";
import { resetAllStores, feedStore } from "../../src/stores/gameStores";
import { characterService, feedService } from "../../src/services/serviceRegistry";
import { ActorStatus } from "../../src/domain/rules/statuses";
import { firstCharacter } from "./helpers";

test('defeated transition creates a feed death move and clearing HP cancels open cards', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 1);
  characterService.markSlots(character.id, 'hp', 1);

  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);
  assert.deepEqual(deathMoveCardsForActor(character.id).map((entry) => entry.deathMove.status), ['pending']);

  characterService.markSlots(character.id, 'hp', -1);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);
  assert.deepEqual(deathMoveCardsForActor(character.id).map((entry) => entry.deathMove.status), ['cancelled']);
});

test('death move feed request is created for any service HP transition to last slot', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 2);
  characterService.markSlots(character.id, 'hp', 2);

  assert.equal(feedStore.get().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === character.id).length, 1);

  characterService.markSlots(character.id, 'hp', 1);
  assert.equal(feedStore.get().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === character.id).length, 1);

  resetAllStores();
  const maxReduced = firstCharacter();
  characterService.markSlots(maxReduced.id, 'hp', 2);
  characterService.updateResourceMax(maxReduced.id, 'hp', 2);

  assert.equal(feedStore.get().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === maxReduced.id).length, 1);
});

test('defeated status transition creates a fresh death move card even when an old one is open', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 2);
  feedService.requestDeathMove({
    actor: { actorId: character.id, actorName: character.name, actorType: 'character' },
    publication: 'public'
  });

  characterService.markSlots(character.id, 'hp', 2);

  let deathMoveCards = deathMoveCardsForActor(character.id);
  assert.equal(deathMoveCards.length, 2);
  characterService.markSlots(character.id, 'hp', -1);

  deathMoveCards = deathMoveCardsForActor(character.id);
  assert.deepEqual(deathMoveCards.map((entry) => entry.deathMove.status), ['cancelled', 'cancelled']);

  characterService.markSlots(character.id, 'hp', 1);

  deathMoveCards = deathMoveCardsForActor(character.id);
  assert.equal(deathMoveCards.filter((entry) => entry.deathMove.status === 'cancelled').length, 2);
  assert.equal(deathMoveCards.filter((entry) => entry.deathMove.status === 'pending').length, 1);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);
});

test('manual defeated status transition creates and cancels death move cards', () => {
  resetAllStores();
  const character = firstCharacter();

  characterService.addCondition(character.id, ActorStatus.Defeated);
  assert.deepEqual(deathMoveCardsForActor(character.id).map((entry) => entry.deathMove.status), ['pending']);

  const defeated = characterService.getCharacter(character.id)?.conditions.find((condition) => condition.name === ActorStatus.Defeated);
  characterService.removeCondition(character.id, defeated!.id);
  assert.deepEqual(deathMoveCardsForActor(character.id).map((entry) => entry.deathMove.status), ['cancelled']);

  characterService.addCondition(character.id, ActorStatus.Defeated);
  const cards = deathMoveCardsForActor(character.id);
  assert.equal(cards.filter((entry) => entry.deathMove.status === 'cancelled').length, 1);
  assert.equal(cards.filter((entry) => entry.deathMove.status === 'pending').length, 1);
});

test('avoid death scars reduce effective Hope and clearing HP removes defeated', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 6);
  const roll = characterService.chooseAvoidDeath(character.id, 1);
  const scarred = characterService.getCharacter(character.id);

  assert.equal(roll?.scarGained, true);
  assert.equal(scarred?.scars.length, 1);
  assert.equal(buildEffectiveCharacterStats(scarred!).hope.max, 5);
  assert.equal(scarred?.hope.value, 5);

  for (let index = 0; index < 5; index += 1) {
    characterService.addScar(character.id, `Scar ${index + 2}`);
  }
  characterService.adjustHope(character.id, 1);
  const fullyScarred = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(fullyScarred).hope.max, 0);
  assert.equal(fullyScarred.hope.value, 0);
  characterService.healScar(character.id, fullyScarred.scars[0]!.id);
  const healedScar = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(healedScar).hope.max, 1);

  characterService.markSlots(character.id, 'hp', 1);
  characterService.addCondition(character.id, ActorStatus.Defeated);
  characterService.clearHp(character.id, 1);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);
});

test('risk it all records only the roll and does not mutate character resources', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.markSlots(character.id, 'hp', 2);
  characterService.markStress(character.id, 2);
  characterService.addCondition(character.id, ActorStatus.Defeated);
  characterService.addCondition(character.id, ActorStatus.Vulnerable);

  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 7, fearDie: 7, outcome: 'critical' });
  const critical = characterService.getCharacter(character.id);
  assert.equal(critical?.hp.marked, 2);
  assert.equal(critical?.stress.marked, 2);
  assert.equal(critical?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);

  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 1, fearDie: 0, outcome: 'hope' });
  assert.equal(characterService.getCharacter(character.id)?.stress.marked, 2);

  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 2, fearDie: 8, outcome: 'fear' });
  const dead = characterService.getCharacter(character.id);
  assert.equal(dead?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);

  characterService.clearHp(character.id, 1);
  const restored = characterService.getCharacter(character.id);
  assert.equal(restored?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);
  assert.equal(restored ? restored.hp.marked < restored.hp.max : false, true);
});

test('death move feed cards are actor scoped and avoid duplicate open cards', () => {
  resetAllStores();
  const character = firstCharacter();
  const otherCharacter = characterService.createCharacter({ name: 'Другой персонаж' });
  const first = feedService.requestDeathMove({ actor: { actorId: character.id, actorName: character.name, actorType: 'character' }, publication: 'public' });
  const second = feedService.requestDeathMove({ actor: { actorId: character.id, actorName: character.name, actorType: 'character' }, publication: 'public' });
  const item = buildTableFeedFromEntries({ feed: feedStore.get(), role: 'player', actorId: character.id })[0];

  assert.equal(first.id, second.id);
  assert.equal(item?.kind, 'deathMove');
  assert.equal(item?.deathMove?.actor.actorId, character.id);
  assert.equal(feedService.updateDeathMove(first.id, { choice: 'avoidDeath' }, { actorId: otherCharacter.id }), null);
  const afterWrongActor = feedStore.get().find((entry) => entry.id === first.id);
  assert.equal(afterWrongActor?.type === 'deathMove' ? afterWrongActor.deathMove.choice : undefined, undefined);

  const risk = feedService.updateDeathMove(first.id, {
    status: 'resolved',
    choice: 'riskItAll',
    roll: { kind: 'riskItAll', hopeDie: 3, fearDie: 1, outcome: 'hope' }
  }, { actorId: character.id });
  assert.equal(risk?.deathMove.status, 'resolved');
  assert.equal(risk?.deathMove.roll?.kind, 'riskItAll');
});

function deathMoveCardsForActor(actorId: string): DeathMoveFeedEntry[] {
  return feedStore.get()
    .filter(isDeathMoveFeedEntry)
    .filter((entry) => entry.deathMove.actor.actorId === actorId);
}

function isDeathMoveFeedEntry(entry: FeedEntry): entry is DeathMoveFeedEntry {
  return entry.type === 'deathMove';
}
