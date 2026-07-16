import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createTableScene } from '../../src/domain/tabletop/factories';
import { buildPlayerViewModel } from '../../src/domain/tabletop/playerView';
import { createEncounterState, createGameState } from '../../src/domain/rules/factories';
import {
  DEFAULT_SCENE_BACKGROUND_FRAMING,
  normalizeSceneBackgroundFraming,
  sceneBackgroundTransform
} from '../../src/domain/tabletop/sceneBackground';

test('scene backgrounds default to the existing centered fill presentation', () => {
  const scene = createTableScene();
  assert.deepEqual(scene.backgroundFraming, DEFAULT_SCENE_BACKGROUND_FRAMING);
  assert.equal(sceneBackgroundTransform(scene.backgroundFraming), 'translate(0%, 0%) scale(1)');
});

test('scene framing normalizes imported and out-of-range values', () => {
  assert.deepEqual(normalizeSceneBackgroundFraming(undefined), DEFAULT_SCENE_BACKGROUND_FRAMING);
  assert.deepEqual(normalizeSceneBackgroundFraming({
    fit: 'fit',
    zoom: 9,
    offsetX: -4,
    offsetY: Number.NaN
  }), {
    fit: 'fit',
    zoom: 2.5,
    offsetX: -1,
    offsetY: 0
  });
});

test('scene framing converts normalized pan into a bounded background transform', () => {
  assert.equal(sceneBackgroundTransform({ fit: 'fit', zoom: 1.5, offsetX: 0.5, offsetY: -0.25 }), 'translate(12.5%, -6.25%) scale(1.5)');
});

test('player view exposes the live scene framing without changing token coordinates', () => {
  const liveScene = createTableScene({
    backgroundFraming: { fit: 'fit', zoom: 1.5, offsetX: 0.5, offsetY: -0.25 },
    tokens: []
  });
  const model = buildPlayerViewModel({
    game: createGameState(),
    characters: { entities: {}, order: [], selectedId: null, updatedAt: '2026-07-16T00:00:00.000Z' },
    encounter: createEncounterState(),
    liveScene,
    assets: {},
    assetUrls: {},
    rollLog: []
  });

  assert.deepEqual(model.scene.backgroundFraming, liveScene.backgroundFraming);
  assert.deepEqual(model.tokens, []);
});
