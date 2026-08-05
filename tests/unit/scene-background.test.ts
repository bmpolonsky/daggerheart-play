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

test('scene backgrounds default to the full uncropped image', () => {
  const scene = createTableScene();
  assert.deepEqual(scene.backgroundFraming, DEFAULT_SCENE_BACKGROUND_FRAMING);
  assert.equal(scene.backgroundFraming.fit, 'fit');
  assert.equal(scene.backgroundFraming.rotation, 0);
  assert.equal(sceneBackgroundTransform(scene.backgroundFraming), 'translate(0%, 0%) scale(1)');
});

test('scene framing repairs legacy fill mode to the uncropped presentation', () => {
  assert.equal(normalizeSceneBackgroundFraming({ fit: 'fill' }).fit, 'fit');
});

test('scene framing normalizes imported and out-of-range values', () => {
  assert.deepEqual(normalizeSceneBackgroundFraming(undefined), DEFAULT_SCENE_BACKGROUND_FRAMING);
  assert.deepEqual(normalizeSceneBackgroundFraming({
    fit: 'fit',
    zoom: 9,
    offsetX: -4,
    offsetY: Number.NaN,
    rotation: -90
  }), {
    fit: 'fit',
    zoom: 2.5,
    offsetX: -1,
    offsetY: 0,
    rotation: 270
  });
});

test('scene framing rotates images in quarter turns', () => {
  assert.equal(normalizeSceneBackgroundFraming({ rotation: 100 }).rotation, 90);
  assert.equal(sceneBackgroundTransform({ rotation: 90 }), 'translate(0%, 0%) scale(1) rotate(90deg)');
});

test('scene framing keeps pan independent from zoom', () => {
  assert.equal(sceneBackgroundTransform({ fit: 'fit', zoom: 1, offsetX: 0.5, offsetY: -0.25 }), 'translate(25%, -12.5%) scale(1)');
  assert.equal(sceneBackgroundTransform({ fit: 'fit', zoom: 0.5, offsetX: 1, offsetY: -1 }), 'translate(50%, -50%) scale(0.5)');
});

test('scene framing allows maps to be reduced below their base size', () => {
  assert.equal(normalizeSceneBackgroundFraming({ zoom: 0 }).zoom, 0.25);
  assert.equal(normalizeSceneBackgroundFraming({ zoom: 0.5 }).zoom, 0.5);
});

test('player view exposes the live scene framing without changing token coordinates', () => {
  const liveScene = createTableScene({
    backgroundFraming: { fit: 'fit', zoom: 1.5, offsetX: 0.5, offsetY: -0.25, rotation: 90 },
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
