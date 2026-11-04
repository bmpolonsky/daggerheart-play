import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PersistenceService } from '../../src/services/PersistenceService';
import { BrowserGameDocumentStore } from '../../src/core/persistence/gameDocumentStore';
import type { KeyValueDocumentStore } from '../../src/core/persistence/keyValueStore';
import { RecoveryJournal, RECOVERY_PREFIX } from '../../src/core/persistence/recoveryJournal';
import { createGameDocument, emptyCustomContent } from '../../src/domain/game/gameDocument';
import { createGameHandout, createCountdown, createCharacter } from '../../src/domain/rules/factories';
import { gameStore, encounterStore, resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { applyBrowserCustomContent } from '../../src/core/persistence/browserProjectContent';
function localStorageFixture(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: n => [...values.keys()][n] ?? null, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear() };
}
async function fixture(run: (store: BrowserGameDocumentStore, journal: RecoveryJournal, local: Storage) => Promise<void>) {
  const previous = globalThis.window, local = localStorageFixture();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: local, sessionStorage: local,
    location: { pathname: '/', hash: '' }, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } });
  resetAllStores(); applyBrowserCustomContent(emptyCustomContent());
  let value: unknown = null;
  const kv: KeyValueDocumentStore = { get: async <T>() => structuredClone(value) as T | null,
    put: async (_key, next) => { value = structuredClone(next); }, delete: async () => { value = null; }, subscribe: () => () => {} };
  try { await run(new BrowserGameDocumentStore(kv, undefined), new RecoveryJournal(local), local); }
  finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: previous }); }
}
test('handout and countdown changes enter the journal in the same store-change stack and clear only after commit', async () => {
  await fixture(async (store, journal, local) => {
    await store.createWorld(createGameDocument(snapshotPersistedState()));
    const service = new PersistenceService(store, undefined, journal);
    service.start(); await service.whenReady(); await service.exportWorldDocument();
    try {
      const handout = createGameHandout({ visibleToPlayers: true });
      gameStore.update(game => ({ ...game, handouts: [handout] }));
      gameStore.update(game => ({ ...game, handouts: [{ ...handout, visibleToPlayers: false }] }));
      const countdown = createCountdown({ name: 'QA', visibility: 'public' });
      encounterStore.update(state => ({ ...state, countdowns: [countdown] }));
      const raw = JSON.parse(local.getItem(RECOVERY_PREFIX + journal.id)!);
      assert.equal(raw.state.game.handouts[0].visibleToPlayers, false);
      assert.equal(raw.state.encounter.countdowns[0].visibility, 'public');
      assert.equal((await store.load())!.files['data/game.json'].handouts.length, 0, 'main document still predates debounce');
      await service.exportWorldDocument();
      assert.equal(local.getItem(RECOVERY_PREFIX + journal.id), null);
      assert.equal(service.hasUnsavedChanges(), false);
    } finally { service.stop(); }
  });
});
test('recovery forks a separate world and preserves both the original and a newer active world', async () => {
  await fixture(async (store, journal, local) => {
    const state = snapshotPersistedState();
    const source = createGameDocument({ ...state, game: { ...state.game, name: 'A', fear: 1 } });
    const a = await store.createWorld(source);
    const edited = structuredClone(source); edited.files['data/game.json'].fear = 7;
    const crashed = new RecoveryJournal(local); crashed.write(edited, 4);
    const b = await store.createWorld(createGameDocument({ ...state, game: { ...state.game, name: 'B', fear: 9 } }));
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    try {
      assert.equal(await service.restoreRecoveryDraft(crashed.id), true);
      assert.equal(gameStore.get().fear, 7); assert.match(gameStore.get().name, /восстановленная копия/);
      assert.notEqual(gameStore.get().id, source.files['data/game.json'].id);
      const worlds = await store.listWorlds(); assert.equal(worlds.length, 3);
      for (const [id, expected] of [[a, 1], [b, 9]] as const) {
        const world = (await store.exportWorld(id))!.world;
        assert.equal(world.games[world.activeGameId!]!.state.game.fear, expected);
      }
      assert.equal(local.getItem(RECOVERY_PREFIX + crashed.id), null);
    } finally { service.stop(); }
  });
});
test('failed fork retains the recovery bytes and the current durable world', async () => {
  await fixture(async (store, journal, local) => {
    const source = createGameDocument(snapshotPersistedState()); await store.createWorld(source);
    const crashed = new RecoveryJournal(local); const draft = structuredClone(source); draft.files['data/game.json'].fear = 2; crashed.write(draft, 1);
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    const create = store.createWorld.bind(store); store.createWorld = async () => { throw new Error('Fixture refusal'); };
    try {
      await assert.rejects(service.restoreRecoveryDraft(crashed.id), /Fixture refusal/);
      assert.ok(local.getItem(RECOVERY_PREFIX + crashed.id));
      assert.equal((await store.listWorlds()).length, 1);
    } finally { store.createWorld = create; service.stop(); }
  });
});
test('returning to the saved value replaces an obsolete intermediate recovery copy', async () => {
  await fixture(async (store, journal, local) => {
    await store.createWorld(createGameDocument(snapshotPersistedState()));
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    try {
      const original = gameStore.get().fear;
      gameStore.update(game => ({ ...game, fear: original + 1 })); assert.ok(local.getItem(RECOVERY_PREFIX + journal.id));
      gameStore.update(game => ({ ...game, fear: original })); assert.equal(JSON.parse(local.getItem(RECOVERY_PREFIX + journal.id)!).state.game.fear, original);
      await service.exportWorldDocument();
    } finally { service.stop(); }
  });
});


test('a recovery record already committed before a crash is not offered again', async () => {
  await fixture(async (store, journal, local) => {
    const source = createGameDocument(snapshotPersistedState()); await store.createWorld(source);
    const crashed = new RecoveryJournal(local);
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    crashed.write((await store.load())!, 1);
    try { await service.refreshRecoveryDrafts(); assert.equal(local.getItem(RECOVERY_PREFIX + crashed.id), null); await service.exportWorldDocument(); }
    finally { service.stop(); }
  });
});

test('a journal quota failure does not prevent the authoritative IndexedDB save', async () => {
  await fixture(async (store, journal, local) => {
    await store.createWorld(createGameDocument(snapshotPersistedState()));
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    const set = local.setItem;
    try {
      local.setItem = () => { throw new Error('QuotaExceededError'); };
      gameStore.update(game => ({ ...game, fear: 8 }));
      assert.equal(service.hasUnsavedChanges(), true);
      await service.exportWorldDocument();
      assert.equal((await store.load())!.files['data/game.json'].fear, 8);
      assert.equal(service.hasUnsavedChanges(), false);
    } finally { local.setItem = set; service.stop(); }
  });
});


test('switching and creating contexts never journals half-hydrated old/new world mixtures', async () => {
  await fixture(async (store, journal) => {
    const state = snapshotPersistedState();
    const chars = (id: string) => ({ ...state.characters, entities: { [id]: createCharacter({ id, name: id }) }, order: [id], selectedId: id });
    const a = await store.createWorld(createGameDocument({ ...state, game: { ...state.game, name: 'A', fear: 1 }, characters: chars('char-A') }));
    const b = await store.createWorld(createGameDocument({ ...state, game: { ...state.game, name: 'B', fear: 9 }, characters: chars('char-B') }));
    const writes: Array<ReturnType<typeof snapshotPersistedState>> = [], write = journal.writeSnapshot.bind(journal);
    journal.writeSnapshot = (state, content, revision, changed) => { writes.push(state); write(state, content, revision, changed); };
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    try {
      writes.length = 0;
      await service.switchStoredWorld(a); await service.switchStoredWorld(b); await service.createStoredWorld('C');
      for (const state of writes) {
        if (state.game.name === 'A') { assert.equal(state.game.fear, 1); assert.deepEqual(state.characters.order, ['char-A']); }
        else if (state.game.name === 'B') { assert.equal(state.game.fear, 9); assert.deepEqual(state.characters.order, ['char-B']); }
        else { assert.equal(state.game.fear, 0); assert.deepEqual(state.characters.order, []); }
      }
      await service.exportWorldDocument();
    } finally { service.stop(); }
  });
});

test('a pending startup save without user edits creates no recovery offer', async () => {
  await fixture(async (store, journal, local) => {
    await store.createWorld(createGameDocument(snapshotPersistedState()));
    const save = store.save.bind(store); let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    store.save = async (...args) => { await blocked; await save(...args); };
    const service = new PersistenceService(store, undefined, journal);
    try {
      service.start(); await service.whenReady();
      assert.equal(local.getItem(RECOVERY_PREFIX + journal.id), null, 'revision 0 is a hydration write, not a recoverable edit');
      release(); await service.exportWorldDocument();
    } finally { release(); service.stop(); }
  });
});

test('concurrent/repeated restore and interrupted journal cleanup create just one independent world', async () => {
  await fixture(async (store, journal, local) => {
    const source = createGameDocument(snapshotPersistedState()); await store.createWorld(source);
    const edited = structuredClone(source); edited.files['data/game.json'].fear = 7;
    const crashed = new RecoveryJournal(local); crashed.write(edited, 4);
    // Model closing immediately after the durable fork commits, before journal deletion.
    journal.removeUnchanged = () => {};
    const service = new PersistenceService(store, undefined, journal); service.start(); await service.whenReady(); await service.exportWorldDocument();
    try {
      const first = service.restoreRecoveryDraft(crashed.id), second = service.restoreRecoveryDraft(crashed.id);
      assert.equal(first, second); assert.deepEqual(await Promise.all([first, second]), [true, true]);
      assert.equal((await store.listWorlds()).length, 2);
      assert.ok(local.getItem(RECOVERY_PREFIX + crashed.id));
      assert.equal(await service.restoreRecoveryDraft(crashed.id), true, 'durable game identity recognizes the already committed fork');
      assert.equal((await store.listWorlds()).length, 2);
      assert.equal(gameStore.get().fear, 7);
    } finally { service.stop(); }
  });
});
