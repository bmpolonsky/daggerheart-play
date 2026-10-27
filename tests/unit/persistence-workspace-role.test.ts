import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PersistenceService } from '../../src/services/PersistenceService';
import { persistWorkspaceRole } from '../../src/services/p2p/P2PSessionPersistence';
import { localAppStorageStore, sessionAppStorageStore } from '../../src/core/persistence/appBrowserStorage';
import { createCharacter } from '../../src/domain/rules/factories';
import { createGameDocument } from '../../src/domain/game/gameDocument';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { charactersStore, gameStore, resetAllStores } from '../../src/stores/gameStores';
import { MemoryGameDocumentStore, waitFor } from './helpers';

function fakeStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); } } as Storage;
}

for (const scenario of ['gm', 'player', 'stale-gm', 'unsigned-gm', 'join', 'pathname-gm'] as const) {
  test(`local persistence respects the workspace role at reload: ${scenario}`, async () => {
    const originalWindow = globalThis.window;
    const windowValue = { localStorage: fakeStorage(), sessionStorage: fakeStorage(),
      location: { pathname: scenario === 'pathname-gm' ? '/daggerheart-play/game' : '/',
        hash: scenario === 'join' ? '#/join/SYNTHETIC-ROOM' : scenario === 'pathname-gm' ? '' : '#/game' },
      setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} } as unknown as Window;
    Object.defineProperty(globalThis, 'window', { value: windowValue, configurable: true });
    resetAllStores();
    const store = new MemoryGameDocumentStore();
    const hero = createCharacter({ id: 'local-world-hero', name: 'Local world hero' });
    const snapshot = snapshotPersistedState();
    store.state = createGameDocument({ ...snapshot, game: { ...snapshot.game, name: 'Local world' },
      characters: { ...snapshot.characters, entities: { [hero.id]: hero }, order: [hero.id], selectedId: hero.id } });
    const savedDocument = store.state;
    localAppStorageStore.setState({ version: 1, p2p: { activeSession: {
      version: 1, role: 'player', roomId: 'SYNTHETIC-ROOM', participantName: 'Synthetic player',
      participantId: 'seat', updatedAt: '2026-10-27T06:00:00Z'
    } } });
    sessionAppStorageStore.setState({ version: 1 });
    persistWorkspaceRole(scenario === 'player' ? 'player' : 'gm');
    if (scenario === 'stale-gm') localAppStorageStore.update((state) => ({ p2p: {
      ...state.p2p, activeSession: { ...state.p2p!.activeSession!, roomId: 'DIFFERENT-ROOM' }
    } }));
    if (scenario === 'unsigned-gm') sessionAppStorageStore.setState({ version: 1, p2p: { workspaceRole: 'gm' } });
    const service = new PersistenceService(store);
    try {
      service.start();
      await service.whenReady();
      const isGm = scenario === 'gm' || scenario === 'pathname-gm';
      assert.equal(Boolean(charactersStore.get().entities[hero.id]), isGm);
      gameStore.update((state) => ({ ...state, name: 'Edited in workspace' }));
      service.persistNow();
      if (isGm) {
        await waitFor(() => assert.equal(store.state?.files['data/game.json'].name, 'Edited in workspace'));
        assert.equal(store.state?.files['data/characters.json'].selectedId, hero.id);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.deepEqual(store.state, savedDocument);
      }
    } finally {
      service.stop();
      localAppStorageStore.setState({ version: 1 });
      sessionAppStorageStore.setState({ version: 1 });
      resetAllStores();
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
    }
  });
}
