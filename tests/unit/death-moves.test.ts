import { test } from "vitest";
import assert from "node:assert/strict";
import { buildEffectiveCharacterStats } from "../../src/domain/rules/effects";
import { buildTableFeedFromEntries } from "../../src/domain/tabletop/feed";
import type { DeathMoveFeedEntry, FeedEntry } from "../../src/domain/rules/types";
import { resetAllStores, feedStore } from "../../src/stores/gameStores";
import { characterService, feedService } from "../../src/services/serviceRegistry";
import { ActorStatus } from "../../src/domain/rules/statuses";
import { firstCharacter } from "./helpers";

test('death move flow becomes pending on last HP and can record the chosen move', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 1);
  characterService.markSlots(character.id, 'hp', 1);

  assert.equal(characterService.getCharacter(character.id)?.deathMove?.status, 'pending');
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);
  characterService.markSlots(character.id, 'hp', -1);
  assert.equal(characterService.getCharacter(character.id)?.deathMove, null);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);

  characterService.markSlots(character.id, 'hp', 1);
  assert.equal(characterService.chooseDeathMove(character.id, 'avoidDeath', 'Scar marked.'), true);
  assert.equal(characterService.getCharacter(character.id)?.deathMove?.status, 'avoidDeath');
});

test('death move feed request is created for any service HP transition to last slot', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.updateResourceMax(character.id, 'hp', 2);
  characterService.markSlots(character.id, 'hp', 2);

  assert.equal(characterService.getCharacter(character.id)?.deathMove?.status, 'pending');
  assert.equal(feedStore.getSnapshot().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === character.id).length, 1);

  characterService.markSlots(character.id, 'hp', 1);
  assert.equal(feedStore.getSnapshot().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === character.id).length, 1);

  resetAllStores();
  const maxReduced = firstCharacter();
  characterService.markSlots(maxReduced.id, 'hp', 2);
  characterService.updateResourceMax(maxReduced.id, 'hp', 2);

  assert.equal(characterService.getCharacter(maxReduced.id)?.deathMove?.status, 'pending');
  assert.equal(feedStore.getSnapshot().filter((entry) => entry.type === 'deathMove' && entry.deathMove.actor.actorId === maxReduced.id).length, 1);
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

test('avoid death scars reduce effective Hope and clearing HP removes Fallen', () => {
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
  const retired = characterService.getCharacter(character.id)!;
  assert.equal(buildEffectiveCharacterStats(retired).hope.max, 0);
  assert.equal(retired.hope.value, 0);
  assert.equal(retired.retirement?.reason, 'lastHopeScar');
  characterService.healScar(character.id, retired.scars[0]!.id);
  assert.equal(characterService.getCharacter(character.id)?.retirement, null);

  characterService.markSlots(character.id, 'hp', 1);
  characterService.addCondition(character.id, ActorStatus.Defeated);
  characterService.clearHp(character.id, 1);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);
});

test('risk it all critical clears tracks and fear result marks retirement', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.markSlots(character.id, 'hp', 2);
  characterService.markStress(character.id, 2);
  characterService.addCondition(character.id, ActorStatus.Defeated);
  characterService.addCondition(character.id, ActorStatus.Vulnerable);

  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 7, fearDie: 7, outcome: 'critical' });
  const critical = characterService.getCharacter(character.id);
  assert.equal(critical?.hp.marked, 0);
  assert.equal(critical?.stress.marked, 0);
  assert.equal(critical?.conditions.some((condition) => condition.name === ActorStatus.Defeated), false);

  characterService.markSlots(character.id, 'hp', critical?.hp.max ?? 6);
  characterService.markStress(character.id, 1);
  characterService.addCondition(character.id, ActorStatus.Defeated);
  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 1, fearDie: 0, outcome: 'hope' });
  characterService.resolveRiskItAllAllocation(character.id, 0, 1);
  assert.equal(characterService.getCharacter(character.id)?.conditions.some((condition) => condition.name === ActorStatus.Defeated), true);

  characterService.chooseRiskItAll(character.id, { kind: 'riskItAll', hopeDie: 2, fearDie: 8, outcome: 'fear' });
  const dead = characterService.getCharacter(character.id);
  assert.equal(dead?.deathMove?.status, 'dead');
  assert.equal(dead?.retirement?.reason, 'deathMove');
});

test('death move feed cards are actor scoped and avoid duplicate open cards', () => {
  resetAllStores();
  const character = firstCharacter();
  const otherCharacter = characterService.createCharacter({ name: 'Другой персонаж' });
  const first = feedService.requestDeathMove({ actor: { actorId: character.id, actorName: character.name, actorType: 'character' }, publication: 'public' });
  const second = feedService.requestDeathMove({ actor: { actorId: character.id, actorName: character.name, actorType: 'character' }, publication: 'public' });
  const item = buildTableFeedFromEntries({ feed: feedStore.getSnapshot(), role: 'player', actorId: character.id })[0];

  assert.equal(first.id, second.id);
  assert.equal(item?.kind, 'deathMove');
  assert.equal(item?.deathMove?.actor.actorId, character.id);
  assert.equal(feedService.updateDeathMove(first.id, { choice: 'avoidDeath' }, { actorId: otherCharacter.id }), null);
  const afterWrongActor = feedStore.getSnapshot().find((entry) => entry.id === first.id);
  assert.equal(afterWrongActor?.type === 'deathMove' ? afterWrongActor.deathMove.choice : undefined, undefined);

  const risk = feedService.updateDeathMove(first.id, {
    status: 'allocating',
    choice: 'riskItAll',
    roll: { kind: 'riskItAll', hopeDie: 3, fearDie: 1, outcome: 'hope' }
  }, { actorId: character.id });
  assert.equal(risk?.deathMove.status, 'allocating');
  assert.equal(feedService.updateDeathMove(first.id, { allocation: { hpCleared: 4, stressCleared: 0 } }, { actorId: character.id }), null);
  const afterInvalidAllocation = feedStore.getSnapshot().find((entry) => entry.id === first.id);
  assert.equal(afterInvalidAllocation?.type === 'deathMove' ? afterInvalidAllocation.deathMove.allocation : undefined, undefined);
  assert.deepEqual(feedService.updateDeathMove(first.id, { allocation: { hpCleared: 2, stressCleared: 1 } }, { actorId: character.id })?.deathMove.allocation, {
    hpCleared: 2,
    stressCleared: 1
  });
});

function deathMoveCardsForActor(actorId: string): DeathMoveFeedEntry[] {
  return feedStore.getSnapshot()
    .filter(isDeathMoveFeedEntry)
    .filter((entry) => entry.deathMove.actor.actorId === actorId);
}

function isDeathMoveFeedEntry(entry: FeedEntry): entry is DeathMoveFeedEntry {
  return entry.type === 'deathMove';
}
