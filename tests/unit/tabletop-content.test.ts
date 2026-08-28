import { test } from "vitest";
import assert from "node:assert/strict";
import { createGameHandout } from "../../src/domain/rules/factories";
import { buildGmPrepChecklist } from "../../src/domain/tabletop/prepFlow";
import { createTableScene } from "../../src/domain/tabletop/factories";
import { createAdversaryFromLibrary, mapRawAdversary } from "../../src/domain/content/mappers";

test('adversary import removes rule links while preserving emphasis markers', () => {
  const libraryItem = mapRawAdversary({
    id: 101,
    name: 'Гигантская крыса',
    short_description: 'Грызун с [острыми зубами](/rule/melee).',
    motives: '**Голодать** и рыться.',
    main_body: 'Цель должна [*отметить Стресс* ](/rule/marking-stress).',
    features: [{
      id: 202,
      name: 'Групповая атака',
      main_body: '[Потратьте Страх](/rule/spending-fear), чтобы **активировать** всех крыс.'
    }, {
      id: 203,
      name: 'Аура ужаса',
      main_body: 'Страх от этой твари заставляет цели дрожать.'
    }]
  });
  const adversary = createAdversaryFromLibrary(libraryItem);

  assert.equal(libraryItem.summary, 'Грызун с **острыми зубами**.');
  assert.equal(libraryItem.raw.main_body?.includes('](/rule/'), false);
  assert.equal(adversary.summary, 'Грызун с **острыми зубами**.');
  assert.match(adversary.motives, /\*\*Голодать\*\*/);
  assert.match(adversary.mainBody, /\*отметить Стресс\*/);
  assert.equal(adversary.notes, '');
  assert.equal(adversary.features[0]?.text, '**Потратьте Страх**, чтобы **активировать** всех крыс.');
  assert.equal(adversary.features[0]?.cost, 'Страх 1');
  assert.equal(adversary.features[1]?.cost, '');
  assert.equal(adversary.features[1]?.kind, 'action');
  assert.equal(adversary.mainBody.includes('](/rule/'), false);
  assert.equal(adversary.features[0]?.text.includes('](/rule/'), false);
});

test('GM prep checklist summarizes scene readiness outside UI', () => {
  const scene = createTableScene({ id: 'scene-ready', backgroundUrl: 'https://example.test/scene.webp' });
  const handout = createGameHandout();
  handout.visibleToPlayers = true;
  const checklist = buildGmPrepChecklist({
    activeScene: scene,
    liveSceneId: scene.id,
    charactersCount: 1,
    playerCharacterId: 'pc-1',
    adversaryCount: 2,
    handouts: [handout],
    presentedHandoutId: handout.id
  });

  assert.equal(checklist.readyCount, checklist.totalCount);
  assert.equal(checklist.steps.every((step) => step.ready), true);

  const missing = buildGmPrepChecklist({
    activeScene: createTableScene({ id: 'draft-scene', backgroundUrl: '' }),
    liveSceneId: 'other-scene',
    charactersCount: 1,
    playerCharacterId: null,
    adversaryCount: 0,
    handouts: [handout],
    presentedHandoutId: null
  });
  assert.deepEqual(missing.steps.filter((step) => !step.ready).map((step) => step.id), ['sceneArt', 'sceneLive', 'playerCharacter', 'handout', 'encounter']);
});
