import { test } from 'vitest';
import assert from 'node:assert/strict';
import { BrowserGameDocumentStore, GameDocumentConflictError } from '../../src/core/persistence/gameDocumentStore';
import { PersistenceService } from '../../src/services/PersistenceService';
import { gameStore, resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { createGameDocument } from '../../src/domain/game/gameDocument';
import type { KeyValueDocumentStore } from '../../src/core/persistence/keyValueStore';

function sharedStore(): KeyValueDocumentStore {
  let stored: unknown = null;
  const listeners = new Set<(value: unknown) => void>();
  return {
    get: async <T>() => structuredClone(stored) as T | null,
    put: async (_key, value) => { stored = structuredClone(value); listeners.forEach(fn => fn(structuredClone(stored))); },
    delete: async () => { stored = null; },
    subscribe: (_key, listener) => {
      const fn = listener as (value: unknown) => void;
      listeners.add(fn); return () => { listeners.delete(fn); };
    }
  };
}

for (const interleave of ['switch-world', 'newer-save'] as const) {
  test(`guarded save rechecks ${interleave} under the library write lock after the preflight read`, async () => {
    const previous = globalThis.window;
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage, sessionStorage: storage,
      location: { pathname: '/', hash: '' }, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
    resetAllStores();
    const kv = sharedStore(); const a = new BrowserGameDocumentStore(kv, undefined); const b = new BrowserGameDocumentStore(kv, undefined);
    const state = snapshotPersistedState();
    const worldA = await a.createWorld(createGameDocument({ ...state, game: { ...state.game, id: 'a', name: 'A', fear: 1 } }));
    const worldB = await b.createWorld(createGameDocument({ ...state, game: { ...state.game, id: 'b', name: 'B', fear: 9 } }));
    await a.setActiveWorld(worldA);
    const service = new PersistenceService(a);
    try {
      service.start(); await service.whenReady(); await service.exportWorldDocument();
      gameStore.update(game => ({ ...game, fear: 2 }));
      const load = a.load.bind(a); let once = true;
      a.load = async () => {
        const before = await load();
        if (once) {
          once = false;
          if (interleave === 'switch-world') await b.setActiveWorld(worldB);
          else { const newer = structuredClone(before!); newer.files['data/game.json'].fear = 9; await b.save(newer); }
        }
        return before;
      };
      service.persistNow();
      await assert.rejects(service.exportWorldDocument(), /Мир изменён в другой вкладке/);
      const world = (await b.exportWorld(interleave === 'switch-world' ? worldB : worldA))!.world;
      const current = world.games[world.activeGameId!]!.state.game;
      assert.equal(current.name, interleave === 'switch-world' ? 'B' : 'A'); assert.equal(current.fear, 9);
      assert.equal(gameStore.get().name, 'A'); assert.equal(gameStore.get().fear, 2);
      assert.equal(service.hasUnsavedChanges(), true);
      await assert.rejects(service.switchStoredWorld(worldA), /Мир изменён в другой вкладке/);
      assert.equal(gameStore.get().fear, 2);
    } finally { service.stop(); Object.defineProperty(globalThis, 'window', { configurable: true, value: previous }); }
  });
}

test('conditional save checks world identity even when the two documents have identical content', async () => {
  resetAllStores(); const kv = sharedStore();
  const a = new BrowserGameDocumentStore(kv, undefined); const b = new BrowserGameDocumentStore(kv, undefined);
  const original = createGameDocument(snapshotPersistedState());
  const worldA = await a.createWorld(original); const worldB = await b.createWorld(original);
  await a.setActiveWorld(worldA); const expected = await a.load();
  await b.setActiveWorld(worldB);
  const edited = structuredClone(expected!); edited.files['data/game.json'].fear = 7;
  await assert.rejects(a.save(edited, expected), GameDocumentConflictError);
  assert.equal((await b.load())?.files['data/game.json'].fear, original.files['data/game.json'].fear);
});
