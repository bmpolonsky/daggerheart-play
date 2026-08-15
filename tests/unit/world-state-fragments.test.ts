import { describe, expect, it } from 'vitest';
import { emptyCustomContent } from '../../src/domain/game/gameDocument';
import { createTableScene, createTokenState } from '../../src/domain/tabletop/factories';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import {
  changedWorldStateFragments,
  decodeWorldState,
  encodeWorldState,
  sceneFragmentKey,
  sceneTokensFragmentKey,
  WORLD_STATE_KEYS
} from '../../src/domain/p2p/worldStateFragments';

describe('world state fragments', () => {
  it('round-trips state, scene tokens and arbitrary custom content', () => {
    const state = structuredClone(snapshotPersistedState());
    const scene = createTableScene({
      id: 'scene-one',
      tokens: [createTokenState({ kind: 'character', id: 'hero-one' })]
    });
    state.sceneTable.scenes = { [scene.id]: scene };
    state.sceneTable.sceneOrder = [scene.id];
    state.sceneTable.activeSceneId = scene.id;
    state.sceneTable.liveSceneId = scene.id;
    const customContent = {
      ...emptyCustomContent(),
      ancestries: [{ id: 'custom-ancestry', futureField: { anything: true } }],
      adversaries: [{ id: 'custom-adversary' }]
    };

    const fragments = encodeWorldState(state, customContent);

    expect((fragments[sceneFragmentKey(scene.id)] as Record<string, unknown>).tokens).toBeUndefined();
    expect(fragments[sceneTokensFragmentKey(scene.id)]).toEqual(scene.tokens);
    expect(decodeWorldState(fragments)).toEqual({ state, customContent });
  });

  it('updates only the token fragment when only token positions changed', () => {
    const before = structuredClone(snapshotPersistedState());
    const scene = createTableScene({
      id: 'scene-one',
      tokens: [createTokenState({ kind: 'adversary', id: 'enemy-one' }, { x: 100, y: 200 })]
    });
    before.sceneTable.scenes = { [scene.id]: scene };
    before.sceneTable.sceneOrder = [scene.id];
    const after = structuredClone(before);
    after.sceneTable.scenes[scene.id].tokens[0].x = 640;

    const diff = changedWorldStateFragments(encodeWorldState(before), encodeWorldState(after));

    expect(Object.keys(diff.upserts)).toEqual([sceneTokensFragmentKey(scene.id)]);
    expect(diff.deletes).toEqual([]);
  });

  it('deletes both scene fragments when a scene is removed', () => {
    const before = structuredClone(snapshotPersistedState());
    const scene = createTableScene({ id: 'scene-one' });
    before.sceneTable.scenes = { [scene.id]: scene };
    before.sceneTable.sceneOrder = [scene.id];
    const after = structuredClone(before);
    after.sceneTable.scenes = {};
    after.sceneTable.sceneOrder = [];

    const diff = changedWorldStateFragments(encodeWorldState(before), encodeWorldState(after));

    expect(diff.upserts[WORLD_STATE_KEYS.sceneTable]).toBeDefined();
    expect(diff.deletes).toEqual([sceneFragmentKey(scene.id), sceneTokensFragmentKey(scene.id)]);
  });
});
