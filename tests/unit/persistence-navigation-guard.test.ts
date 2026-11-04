import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PersistenceService } from '../../src/services/PersistenceService';
import { createGameDocument, emptyCustomContent, type GameDocument } from '../../src/domain/game/gameDocument';
import { applyBrowserCustomContent } from '../../src/core/persistence/browserProjectContent';
import { charactersStore, gameStore, resetAllStores, sceneTableStore, uiStore } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { MemoryGameDocumentStore, waitFor } from './helpers';

class ControlledStore extends MemoryGameDocumentStore {
  gate: Promise<void> | null = null;
  completionGate: Promise<void> | null = null;
  failure = false;
  writes = 0;
  async save(document: GameDocument) {
    this.writes += 1;
    await this.gate;
    if (this.failure) throw new Error('Fixture write refusal');
    await super.save(document);
    await this.completionGate;
  }
}

async function fixture(run: (service: PersistenceService, store: ControlledStore, leave: () => Event) => Promise<void>) {
  const original = globalThis.window;
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const storage = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: storage(), sessionStorage: storage(), location: { pathname: '/', hash: '' }, setTimeout, clearTimeout,
    addEventListener: (name: string, fn: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(fn); listeners.set(name, set); },
    removeEventListener: (name: string, fn: (event: Event) => void) => listeners.get(name)?.delete(fn)
  }});
  resetAllStores(); applyBrowserCustomContent(emptyCustomContent());
  const store = new ControlledStore(); store.state = createGameDocument(snapshotPersistedState());
  const service = new PersistenceService(store);
  const leave = () => {
    const event = new Event('beforeunload', { cancelable: true });
    // Node's generic Event lacks the writable string property of a browser's
    // BeforeUnloadEvent. Keep cancellation real, model that property explicitly.
    Object.defineProperty(event, 'returnValue', { value: '', writable: true });
    listeners.get('beforeunload')?.forEach(fn => fn(event)); return event;
  };
  try {
    service.start(); await service.whenReady(); await service.exportWorldDocument();
    await run(service, store, leave);
  } finally {
    store.gate = null; store.completionGate = null; store.failure = false;
    service.stop();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: original });
  }
}

test('debounced and in-flight edits guard unload; a confirmed save and no-op do not', async () => {
  await fixture(async (service, store, leave) => {
    assert.equal(leave().defaultPrevented, false);
    gameStore.reset(gameStore.get());
    assert.equal(leave().defaultPrevented, false, 'identical content is not an unsaved edit');
    uiStore.update(state => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
    charactersStore.update(state => ({ ...state, selectedId: 'view-only', updatedAt: 'view-only' }));
    sceneTableStore.update(state => ({ ...state, selectedTokenId: 'view-only', updatedAt: 'view-only' }));
    assert.equal(leave().defaultPrevented, false, 'view-only selection does not cause a game-data warning');
    await service.exportWorldDocument();
    let release!: () => void; store.gate = new Promise<void>(resolve => { release = resolve; });
    gameStore.update(state => ({ ...state, fear: 1 }));
    assert.equal(leave().defaultPrevented, true, 'before debounce expires');
    await waitFor(() => assert.ok(store.writes > 1));
    gameStore.update(state => ({ ...state, fear: 0 }));
    assert.equal(leave().defaultPrevented, true, 'an intermediate in-flight write can still replace the old baseline');
    gameStore.update(state => ({ ...state, fear: 2 }));
    assert.equal(leave().defaultPrevented, true, 'a newer snapshot remains dirty while the older save is pending');
    store.gate = null; release(); await service.exportWorldDocument();
    assert.equal(store.state?.files['data/game.json'].fear, 2);
    assert.equal(service.hasUnsavedChanges(), false);
    assert.equal(leave().defaultPrevented, false);
    service.resetEverything();
    await waitFor(() => assert.equal(store.state, null));
    uiStore.update(state => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
    assert.equal(leave().defaultPrevented, false, 'intentional reset establishes an empty clean baseline');
  });
});

test('internal world creation waits for the entire queued save before changing context', async () => {
  await fixture(async (service, store) => {
    let release!: () => void; store.gate = new Promise<void>(resolve => { release = resolve; });
    gameStore.update(state => ({ ...state, fear: 7 }));
    let changed = false;
    const next = service.createStoredGame().then(() => { changed = true; });
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(changed, false); assert.equal(gameStore.get().fear, 7);
    store.gate = null; release(); await next;
    const first = (await store.list()).find(game => !game.active)!;
    assert.equal((await store.setActive(first.id))?.files['data/game.json'].fear, 7);
  });
});

test('an own-write notification does not clear the warning before the save promise completes', async () => {
  await fixture(async (service, store, leave) => {
    let complete!: () => void;
    store.completionGate = new Promise<void>(resolve => { complete = resolve; });
    gameStore.update(state => ({ ...state, fear: 8 })); service.persistNow();
    await waitFor(() => assert.equal(store.state?.files['data/game.json'].fear, 8));
    assert.equal(leave().defaultPrevented, true, 'request/notification is not the successful completion boundary');
    store.completionGate = null; complete(); await service.exportWorldDocument();
    assert.equal(leave().defaultPrevented, false);
  });
});

test('write failure blocks an internal transition and continues guarding until a successful retry', async () => {
  await fixture(async (service, store, leave) => {
    store.failure = true;
    gameStore.update(state => ({ ...state, fear: 4 }));
    await assert.rejects(service.createStoredGame(), /Не удалось записать изменения/);
    assert.equal(gameStore.get().fear, 4); assert.equal((await store.list()).length, 1);
    assert.equal(leave().defaultPrevented, true);
    store.failure = false; await service.exportWorldDocument();
    assert.equal(store.state?.files['data/game.json'].fear, 4);
    assert.equal(leave().defaultPrevented, false);
  });
});

test('a newer external write neither erases a dirty local edit nor gets overwritten by it', async () => {
  await fixture(async (service, store, leave) => {
    gameStore.update(state => ({ ...state, fear: 2 }));
    // Model a changed view whose liveQuery notification has not arrived yet.
    const viewOnly = structuredClone(store.state!); viewOnly.files['data/ui.json'].activeScreen = 'settings';
    store.state = viewOnly;
    await service.exportWorldDocument();
    assert.equal(store.state?.files['data/game.json'].fear, 2);
    assert.equal(leave().defaultPrevented, false);
    gameStore.update(state => ({ ...state, fear: 3 }));
    const external = structuredClone(store.state!); external.files['data/game.json'].fear = 9;
    await store.save(external);
    assert.equal(gameStore.get().fear, 3);
    await assert.rejects(service.createStoredGame(), /Мир изменён в другой вкладке/);
    assert.equal(store.state?.files['data/game.json'].fear, 9);
    assert.equal(gameStore.get().fear, 3);
    assert.equal(leave().defaultPrevented, true);
    gameStore.update(state => ({ ...state, fear: 2 }));
    await assert.rejects(service.createStoredGame(), /Мир изменён в другой вкладке/);
    assert.equal(store.state?.files['data/game.json'].fear, 9);
    assert.equal(gameStore.get().fear, 2, 'old local baseline is still an unsaved conflicting draft');
  });
});
