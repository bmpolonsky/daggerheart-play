import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createContentState, contentStore } from '../../src/stores/contentStore';
import { charactersStore, encounterStore, resetAllStores, sceneTableStore } from '../../src/stores/gameStores';
import { createTableScene } from '../../src/domain/tabletop/factories';
import { buildPlayerTokens } from '../../src/domain/tabletop/playerView';
import { mapRawAdversary, mapRawEnvironmentItem } from '../../src/domain/content/mappers';
import { ActorStatus } from '../../src/domain/rules/statuses';
import {
  characterService,
  contentService,
  encounterService,
  preparedActorService,
  sceneTableService
} from '../../src/services/serviceRegistry';
import { PlayerActivationQueueService } from '../../src/services/PlayerActivationQueueService';
import type { MediaCallState } from '../../src/services/MediaCallService';
import { buildConnectedPlayerRows, buildSessionRosterActors } from '../../src/ui/vtt/playerView/helpers';
import { hydratePersistedState, snapshotPersistedState } from '../../src/stores/persistedState';

test('prepared view keeps every hero but scene roster contains only active-scene tokens', () => {
  resetAllStores();
  const onScene = characterService.createCharacter({ name: 'На сцене' });
  const preparedOnly = characterService.createCharacter({ name: 'В запасе' });
  preparedActorService.addCharacter(onScene.id);

  const scene = sceneTableService.getActiveScene();
  const tokens = buildPlayerTokens(scene.tokens, charactersStore.get().entities, encounterStore.get(), 'gm');
  const roster = buildSessionRosterActors({
    tokens,
    characters: charactersStore.get(),
    adversaries: {},
    environments: {},
    role: 'gm',
    activationQueue: [],
    presence: {}
  });

  assert.deepEqual(roster.map((actor) => actor.actorId), [onScene.id]);
  assert.deepEqual(preparedActorService.buildView().heroes.map((row) => row.character.id), [onScene.id, preparedOnly.id]);
});

test('characters and companions have one token per scene while sharing their character model', () => {
  resetAllStores();
  const hero = characterService.createCharacter({ name: 'Лея' });
  characterService.ensureRangerCompanion(hero.id, { name: 'Искра' });
  const firstScene = sceneTableService.getActiveScene();
  const secondScene = sceneTableService.createScene({ name: 'Вторая' });

  assert.ok(preparedActorService.addCharacter(hero.id, firstScene.id));
  assert.ok(preparedActorService.addCharacter(hero.id, firstScene.id));
  assert.ok(preparedActorService.addCompanion(hero.id, firstScene.id));
  assert.ok(preparedActorService.addCompanion(hero.id, firstScene.id));
  assert.ok(preparedActorService.addCharacter(hero.id, secondScene.id));

  assert.equal(sceneTableStore.get().scenes[firstScene.id].tokens.filter((token) => token.actor.id === hero.id && token.actor.kind === 'character').length, 1);
  assert.equal(sceneTableStore.get().scenes[firstScene.id].tokens.filter((token) => token.actor.id === hero.id && token.actor.kind === 'companion').length, 1);
  assert.equal(sceneTableStore.get().scenes[secondScene.id].tokens.filter((token) => token.actor.id === hero.id && token.actor.kind === 'character').length, 1);
  assert.equal(charactersStore.get().entities[hero.id]?.name, 'Лея');
});

test('adversary templates create independent hidden instances with reset state and stable free numbering', () => {
  resetAllStores();
  const template = encounterService.createAdversary({
    name: 'Скелет',
    hp: { marked: 3, max: 5 },
    stress: { marked: 2, max: 3 },
    conditions: [{ id: 'hidden', name: ActorStatus.Hidden }]
  });

  const first = preparedActorService.instantiateAdversary(template.id);
  const second = preparedActorService.instantiateAdversary(template.id);
  const third = preparedActorService.instantiateAdversary(template.id);
  assert.ok(first && second && third);
  assert.deepEqual([first.name, second.name, third.name], ['Скелет', 'Скелет 2', 'Скелет 3']);
  assert.notEqual(first.id, template.id);
  assert.equal(first.preparedTemplateId, template.id);
  assert.deepEqual(first.hp, { marked: 0, max: 5 });
  assert.deepEqual(first.stress, { marked: 0, max: 3 });
  assert.deepEqual(first.conditions, []);
  assert.equal(encounterStore.get().adversaries[template.id]?.hp.marked, 3);
  assert.equal(sceneTableService.getActiveScene().tokens.filter((token) => token.actor.kind === 'adversary').every((token) => token.hidden), true);

  const secondToken = sceneTableService.getActiveScene().tokens.find((token) => token.actor.id === second.id);
  assert.ok(secondToken);
  assert.equal(preparedActorService.removeFromScene(secondToken), true);
  const replacement = preparedActorService.instantiateAdversary(template.id);
  assert.equal(replacement?.name, 'Скелет 2');
  assert.equal(preparedActorService.buildView().adversaries[0]?.activeSceneInstances, 3);
  assert.equal(preparedActorService.removeLastAdversaryInstance(template.id), true);
  assert.equal(encounterStore.get().adversaries[replacement?.id ?? ''], undefined);
  assert.ok(encounterStore.get().adversaries[first.id]);
  assert.ok(encounterStore.get().adversaries[third.id]);
  assert.equal(preparedActorService.buildView().adversaries[0]?.activeSceneInstances, 2);
});

test('environment templates allow one independent instance per template and scene', () => {
  resetAllStores();
  const template = encounterService.createEnvironment({ name: 'Горящий мост' });
  const firstScene = sceneTableService.getActiveScene();
  const secondScene = sceneTableService.createScene({ name: 'Вторая' });

  const first = preparedActorService.instantiateEnvironment(template.id, firstScene.id);
  assert.ok(first);
  assert.equal(first.preparedTemplateId, template.id);
  assert.equal(preparedActorService.instantiateEnvironment(template.id, firstScene.id), null);
  assert.equal(preparedActorService.updateEnvironmentTemplate(template.id, { name: 'Горящий мост ночью', difficulty: 17 }), true);
  const second = preparedActorService.instantiateEnvironment(template.id, secondScene.id);
  assert.ok(second);
  assert.deepEqual({ name: first.name, difficulty: first.difficulty }, { name: 'Горящий мост', difficulty: 0 });
  assert.deepEqual({ name: second.name, difficulty: second.difficulty }, { name: 'Горящий мост ночью', difficulty: 17 });
  assert.equal(sceneTableStore.get().scenes[firstScene.id].tokens.find((token) => token.actor.id === first.id)?.hidden, true);
});

test('editing a template affects only future adversary instances', () => {
  resetAllStores();
  const template = encounterService.createAdversary({ name: 'Дозорный', difficulty: 12, hp: { marked: 0, max: 4 } });
  const existing = preparedActorService.instantiateAdversary(template.id);
  assert.ok(existing);

  assert.equal(preparedActorService.updateAdversaryTemplate(template.id, {
    name: 'Старший дозорный',
    difficulty: 15,
    hp: { marked: 3, max: 7 }
  }), true);
  const future = preparedActorService.instantiateAdversary(template.id);
  assert.ok(future);

  assert.deepEqual({ name: existing.name, difficulty: existing.difficulty, hp: existing.hp }, {
    name: 'Дозорный',
    difficulty: 12,
    hp: { marked: 0, max: 4 }
  });
  assert.deepEqual({ name: future.name, difficulty: future.difficulty, hp: future.hp }, {
    name: 'Старший дозорный',
    difficulty: 15,
    hp: { marked: 0, max: 7 }
  });
});

test('runtime removal keeps legacy shared actors until their last scene reference', () => {
  resetAllStores();
  const legacy = encounterService.createAdversary({ name: 'Старый общий противник' });
  const firstScene = sceneTableService.getActiveScene();
  const secondScene = sceneTableService.createScene({ name: 'Вторая' });
  sceneTableService.addActorTokenToScene(firstScene.id, { kind: 'adversary', id: legacy.id });
  sceneTableService.addActorTokenToScene(secondScene.id, { kind: 'adversary', id: legacy.id });

  const firstToken = sceneTableStore.get().scenes[firstScene.id].tokens.find((token) => token.actor.id === legacy.id);
  const secondToken = sceneTableStore.get().scenes[secondScene.id].tokens.find((token) => token.actor.id === legacy.id);
  assert.ok(firstToken && secondToken);
  assert.equal(preparedActorService.removeFromScene(firstToken, firstScene.id), true);
  assert.ok(encounterStore.get().adversaries[legacy.id]);
  assert.equal(preparedActorService.removeFromScene(secondToken, secondScene.id), true);
  assert.equal(encounterStore.get().adversaries[legacy.id], undefined);
});

test('duplicating a scene keeps shared heroes but clones runtime adversaries and environments', () => {
  resetAllStores();
  const hero = characterService.createCharacter({ name: 'Общий герой' });
  const adversaryTemplate = encounterService.createAdversary({ name: 'Страж' });
  const environmentTemplate = encounterService.createEnvironment({ name: 'Башня' });
  const sourceScene = sceneTableService.getActiveScene();
  preparedActorService.addCharacter(hero.id, sourceScene.id);
  const adversary = preparedActorService.instantiateAdversary(adversaryTemplate.id, sourceScene.id);
  const environment = preparedActorService.instantiateEnvironment(environmentTemplate.id, sourceScene.id);
  assert.ok(adversary && environment);

  const duplicate = preparedActorService.duplicateScene(sourceScene.id);
  assert.ok(duplicate);
  const duplicateHero = duplicate.tokens.find((token) => token.actor.kind === 'character');
  const duplicateAdversary = duplicate.tokens.find((token) => token.actor.kind === 'adversary');
  const duplicateEnvironment = duplicate.tokens.find((token) => token.actor.kind === 'environment');

  assert.equal(duplicateHero?.actor.id, hero.id);
  assert.notEqual(duplicateAdversary?.actor.id, adversary.id);
  assert.notEqual(duplicateEnvironment?.actor.id, environment.id);
  assert.equal(encounterStore.get().adversaries[duplicateAdversary?.actor.id ?? '']?.preparedTemplateId, adversaryTemplate.id);
  assert.equal(encounterStore.get().environments[duplicateEnvironment?.actor.id ?? '']?.preparedTemplateId, environmentTemplate.id);
});

test('deleting a prepared template leaves its existing runtime instances intact', () => {
  resetAllStores();
  const template = encounterService.createAdversary({ name: 'Разбойник' });
  const instance = preparedActorService.instantiateAdversary(template.id);
  assert.ok(instance);

  assert.equal(preparedActorService.deleteTemplate({ kind: 'adversary', id: template.id }), true);
  assert.equal(encounterStore.get().adversaries[template.id], undefined);
  assert.equal(encounterStore.get().adversaries[instance.id]?.preparedTemplateId, template.id);
  assert.ok(sceneTableService.getActiveScene().tokens.some((token) => token.actor.id === instance.id));
});

test('prepared sources and runtime template links round-trip through the existing game document', () => {
  resetAllStores();
  const template = encounterService.createAdversary({ name: 'Страж сохранения' });
  const instance = preparedActorService.instantiateAdversary(template.id);
  assert.ok(instance);
  const snapshot = snapshotPersistedState();

  resetAllStores();
  hydratePersistedState(snapshot);

  assert.ok(encounterStore.get().adversaries[template.id]);
  assert.equal(encounterStore.get().adversaries[instance.id]?.preparedTemplateId, template.id);
  assert.ok(sceneTableService.getActiveScene().tokens.some((token) => token.actor.id === instance.id));
});

test('library preparation deduplicates stable content sources but explicit template duplication remains available', () => {
  resetAllStores();
  const libraryAdversary = mapRawAdversary({ id: 77, slug: 'ember-guard', name: 'Угольный страж' });
  const libraryEnvironment = mapRawEnvironmentItem({ id: 88, slug: 'ash-yard', name: 'Пепельный двор' });
  contentStore.set({ ...createContentState(), adversaries: [libraryAdversary], environments: [libraryEnvironment] });

  assert.equal(contentService.addAdversaryToEncounter(libraryAdversary.id), true);
  assert.equal(contentService.addAdversaryToEncounter(libraryAdversary.id), false);
  assert.equal(contentService.addEnvironmentToEncounter(libraryEnvironment.id), true);
  assert.equal(contentService.addEnvironmentToEncounter(libraryEnvironment.id), false);
  const template = preparedActorService.buildView().adversaries[0]?.adversary;
  assert.ok(template);
  const duplicate = preparedActorService.duplicateAdversaryTemplate(template.id);
  assert.ok(duplicate);
  assert.equal(duplicate.sourceId, template.sourceId);
  assert.equal(preparedActorService.buildView().adversaries.length, 2);
});

test('connected people merge call state and hands independently from scene actors', () => {
  resetAllStores();
  const hero = characterService.createCharacter({ name: 'Тала' });
  const queueService = new PlayerActivationQueueService();
  const raised = queueService.raise({ requesterId: 'peer-tala', requesterName: 'Аня', actorId: hero.id, actorName: hero.name });
  assert.equal(raised.type, 'raise');
  if (raised.type !== 'raise') throw new Error('Activation request was not raised');
  const request = raised.request;
  const call = {
    remoteParticipants: {
      'seat-tala': {
        type: 'callPresence',
        participantId: 'seat-tala',
        displayName: 'Аня',
        role: 'player',
        connected: true,
        micMuted: true,
        cameraOff: false,
        updatedAt: '2026-08-09T00:00:00.000Z',
        stream: null
      }
    }
  } as unknown as MediaCallState;
  const rows = buildConnectedPlayerRows(charactersStore.get(), {
    [hero.id]: {
      peerId: 'peer-tala',
      requesterId: 'seat-tala',
      actorId: hero.id,
      actorName: hero.name,
      playerName: 'Аня',
      connected: true,
      voiceMuted: false,
      voiceLive: true,
      updatedAt: '2026-08-09T00:00:00.000Z'
    },
    offline: {
      peerId: 'peer-offline',
      requesterId: 'seat-offline',
      actorId: 'offline',
      actorName: 'Не в игре',
      playerName: 'Борис',
      connected: false,
      voiceMuted: false,
      voiceLive: false,
      updatedAt: '2026-08-09T00:00:00.000Z'
    }
  }, call, queueService.queue$.get());

  assert.deepEqual(rows.map((row) => ({
    playerName: row.playerName,
    characterName: row.characterName,
    inCall: row.inCall,
    micMuted: row.micMuted,
    cameraOff: row.cameraOff,
    hand: row.activationRequest?.id
  })), [{ playerName: 'Аня', characterName: 'Тала', inCall: true, micMuted: true, cameraOff: false, hand: request.id }]);

  queueService.removeRequester('peer-tala');
  assert.deepEqual(queueService.queue$.get(), []);
});
