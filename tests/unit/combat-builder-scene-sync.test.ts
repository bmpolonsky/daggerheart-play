import { test } from 'vitest';
import assert from 'node:assert/strict';
import { encounterStore, resetAllStores, sceneTableStore } from '../../src/stores/gameStores';
import {
  characterService,
  encounterService,
  preparedActorService,
  sceneTableService
} from '../../src/services/serviceRegistry';
import { ActorStatus } from '../../src/domain/rules/statuses';
import { encounterService as builderEncounterService } from '../../src/tools/combat-builder/services/encounterService';

test('combat builder reads and mutates only adversary instances on the active scene', () => {
  builderEncounterService.dispose();
  resetAllStores();

  const hero = characterService.createCharacter({ name: 'Герой сцены' });
  const adversaryTemplate = encounterService.createAdversary({
    name: 'Скелет',
    sourceId: 12,
    sourceSlug: 'skeleton',
    sourceName: 'Скелет',
    hp: { marked: 0, max: 5 },
    stress: { marked: 0, max: 3 }
  });
  const environmentTemplate = encounterService.createEnvironment({ name: 'Склеп' });
  const firstScene = sceneTableService.getActiveScene();
  preparedActorService.addCharacter(hero.id, firstScene.id);
  const environment = preparedActorService.instantiateEnvironment(environmentTemplate.id, firstScene.id);
  const first = preparedActorService.instantiateAdversary(adversaryTemplate.id, firstScene.id);
  const second = preparedActorService.instantiateAdversary(adversaryTemplate.id, firstScene.id);
  assert.ok(environment && first && second);
  encounterService.addCondition(first.id, ActorStatus.Hidden);

  const secondScene = sceneTableService.createScene({ name: 'Другая сцена' });
  const otherSceneInstance = preparedActorService.instantiateAdversary(adversaryTemplate.id, secondScene.id);
  assert.ok(otherSceneInstance);
  encounterService.updateAdversarySlots(otherSceneInstance.id, 'hp', { marked: 2 });
  sceneTableService.setActiveScene(firstScene.id);

  try {
    builderEncounterService.ensureHydrated();
    let builder = builderEncounterService.encounter$.get();
    assert.equal(builder.playerCount, 4);
    assert.equal(encounterStore.get().playerCount, 4);
    assert.equal(builder.entries.length, 1);
    assert.equal(builder.entries[0]?.count, 2);
    assert.deepEqual(builder.entries[0]?.instances.map((instance) => instance.id), [first.id, second.id]);

    builderEncounterService.adjustHp(12, first.id, 1);
    assert.equal(encounterStore.get().adversaries[first.id]?.hp.marked, 1);
    assert.equal(encounterStore.get().adversaries[first.id]?.conditions.some((condition) => condition.name === ActorStatus.Hidden), true);
    assert.equal(encounterStore.get().adversaries[otherSceneInstance.id]?.hp.marked, 2);
    assert.ok(encounterStore.get().adversaries[adversaryTemplate.id]);

    builderEncounterService.updateCount(12, -1);
    assert.ok(encounterStore.get().adversaries[first.id]);
    assert.equal(encounterStore.get().adversaries[second.id], undefined);
    assert.equal(encounterStore.get().adversaries[first.id]?.hp.marked, 1);

    builderEncounterService.updateCount(12, 1);
    builder = builderEncounterService.encounter$.get();
    const replacementId = builder.entries[0]?.instances[1]?.id;
    assert.ok(replacementId);
    assert.equal(encounterStore.get().adversaries[replacementId]?.name, 'Скелет 2');
    assert.equal(encounterStore.get().adversaries[replacementId]?.preparedTemplateId, adversaryTemplate.id);
    assert.equal(sceneTableStore.get().scenes[firstScene.id].tokens.find((token) => token.actor.id === replacementId)?.hidden, true);

    builderEncounterService.setPlayerCount(3);
    const secondHero = characterService.createCharacter({ name: 'Второй герой' });
    preparedActorService.addCharacter(secondHero.id, firstScene.id);
    assert.equal(builderEncounterService.encounter$.get().playerCount, 3);

    builderEncounterService.clear();
    const remainingFirstSceneTokens = sceneTableStore.get().scenes[firstScene.id].tokens;
    assert.equal(remainingFirstSceneTokens.some((token) => token.actor.kind === 'adversary'), false);
    assert.equal(remainingFirstSceneTokens.some((token) => token.actor.kind === 'character' && token.actor.id === hero.id), true);
    assert.equal(remainingFirstSceneTokens.some((token) => token.actor.kind === 'environment' && token.actor.id === environment.id), true);
    assert.ok(encounterStore.get().adversaries[adversaryTemplate.id]);
    assert.ok(encounterStore.get().adversaries[otherSceneInstance.id]);

    sceneTableService.setActiveScene(secondScene.id);
    builder = builderEncounterService.encounter$.get();
    assert.equal(builder.entries.length, 1);
    assert.equal(builder.entries[0]?.count, 1);
    assert.equal(builder.entries[0]?.instances[0]?.id, otherSceneInstance.id);
    assert.equal(builder.entries[0]?.instances[0]?.currentHp, 2);
    preparedActorService.addCharacter(secondHero.id, secondScene.id);
    assert.equal(builderEncounterService.encounter$.get().playerCount, 3);
  } finally {
    builderEncounterService.dispose();
  }
});
