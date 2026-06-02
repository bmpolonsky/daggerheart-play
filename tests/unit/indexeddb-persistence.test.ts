import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import { createTokenState } from "../../src/domain/tabletop/factories";
import { resetAllStores, sceneTableStore, syncedGameStores } from "../../src/stores/gameStores";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { gameService, characterService, contentService, importExportService, sceneTableService } from "../../src/services/serviceRegistry";
import { PersistenceService } from "../../src/services/PersistenceService";
import { applyBrowserCustomContent, readBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";
import type { GameDocument } from "../../src/domain/game/gameDocument";
import { MemoryGameDocumentStore, waitFor } from "./helpers";

function createFakeWindow(memory = new Map<string, string>()) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key)
    },
    clearTimeout,
    setTimeout,
    location: { pathname: '/' },
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      const next = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      next.add(listener);
      listeners.set(type, next);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
      return true;
    }
  } as unknown as Window;
}

test('persistence mirrors the exported game document into IndexedDB with custom tool content', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const memory = new Map<string, string>();
  const documentStore = new MemoryGameDocumentStore();
  applyBrowserCustomContent({
    ancestries: [{ id: 'custom-ancestry-1', name: 'Custom Ancestry' }],
    communities: [],
    subclasses: [],
    domainCards: [{ id: 'custom-card-1', name: 'Custom Card' }],
    cardDomains: [{ id: 'custom-domain-1' }],
    adversaries: [{ id: 42, name: 'Custom Adversary' }]
  });
  const fakeWindow = createFakeWindow(memory);
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

  try {
    const service = new PersistenceService(documentStore);
    service.persistNow();
    await Promise.resolve();

    assert.equal(documentStore.state?.manifest.kind, 'daggerheart-play:game');
    assert.deepEqual(documentStore.state, JSON.parse(importExportService.exportGameJson(false)));
    assert.equal(documentStore.state?.files['data/game.json'].name, snapshotPersistedState().game.name);
    assert.deepEqual(documentStore.state?.files['content/custom-ancestries.json'], [{ id: 'custom-ancestry-1', name: 'Custom Ancestry' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-domain-cards.json'], [{ id: 'custom-card-1', name: 'Custom Card' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-card-domains.json'], [{ id: 'custom-domain-1' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-adversaries.json'], [{ id: 42, name: 'Custom Adversary' }]);
    assert.equal(memory.has('daggerheart-play:v3:game:local'), false);

    service.resetEverything();
    await Promise.resolve();
    assert.equal(documentStore.state, null);
  } finally {
    applyBrowserCustomContent({ ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [] });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence hydrates current v4 IndexedDB game documents', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  const document = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  const sceneTable = createSceneTableState();
  const sceneId = sceneTable.activeSceneId;
  document.files['data/scene-table.json'] = {
    ...sceneTable,
    scenes: {
      ...sceneTable.scenes,
      [sceneId]: {
        ...sceneTable.scenes[sceneId],
        backgroundUrl: 'https://example.test/idb.webp',
        tokens: [createTokenState({ kind: 'character', id: 'idb' }, { id: 'character:idb', x: 10, y: 20 })]
      }
    },
    selectedTokenId: 'character:idb'
  };
  documentStore.state = document;
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();

    const state = sceneTableStore.getSnapshot();
    assert.equal(state.schemaVersion, 4);
    assert.equal(state.scenes[state.activeSceneId].tokens[0]?.id, 'character:idb');
    assert.equal(state.scenes[state.activeSceneId].backgroundUrl, 'https://example.test/idb.webp');
    assert.equal(documentStore.state?.files['data/scene-table.json'].schemaVersion, 4);
  } finally {
    service?.stop();
    contentService.setSelectedCollection('adversaries');
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence applies live IndexedDB game document updates', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  documentStore.state = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();
    await Promise.resolve();
    await Promise.resolve();

    const nextDocument = JSON.parse(JSON.stringify(documentStore.state)) as GameDocument;
    nextDocument.files['data/game.json'] = {
      ...nextDocument.files['data/game.json'],
      name: 'Синхронная игра'
    };
    await documentStore.save(nextDocument);
    await Promise.resolve();

    assert.equal(syncedGameStores.game.getSnapshot().name, 'Синхронная игра');
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence autosaves newly created characters across reloads', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();

    const character = characterService.createCharacter({ name: 'Автосохраненный герой' });
    window.dispatchEvent({ type: 'pagehide' } as Event);
    await waitFor(() => {
      assert.equal(documentStore.state?.files['data/characters.json'].entities[character.id]?.name, 'Автосохраненный герой');
    });

    service.stop();
    resetAllStores();
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();

    assert.equal(characterService.getCharacter(character.id)?.name, 'Автосохраненный герой');
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence keeps multiple local games and switches the active one', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });

  try {
    const service = new PersistenceService(documentStore);
    const hero = characterService.createCharacter({ name: 'Общий герой' });
    sceneTableService.createPlayerSeat({ name: 'Общий игрок', characterId: hero.id });
    gameService.updateGame({ name: 'Длинная игра' });
    gameService.setFear(4);
    sceneTableService.updateScene(sceneTableStore.getSnapshot().activeSceneId, { backgroundUrl: 'https://example.test/long-game.webp' });
    service.persistNow();
    await Promise.resolve();
    const [first] = await service.listStoredGames();
    assert.ok(first);

    await service.createStoredGame();
    assert.equal(characterService.charactersStore.getSnapshot().entities[hero.id]?.name, 'Общий герой');
    assert.equal(Object.values(sceneTableStore.getSnapshot().participants).some((seat) => seat.actorIds.includes(hero.id)), true);
    assert.equal(gameService.gameStore.getSnapshot().fear, 0);
    gameService.updateGame({ name: 'Ваншот' });
    gameService.setFear(1);
    service.persistNow();
    await Promise.resolve();

    const games = await service.listStoredGames();
    assert.deepEqual(games.map((game) => game.name), ['Ваншот', 'Длинная игра']);
    assert.equal(games.find((game) => game.name === 'Ваншот')?.active, true);

    assert.equal(await service.switchStoredGame(first.id), true);
    assert.equal(gameService.gameStore.getSnapshot().name, 'Длинная игра');
    assert.equal(gameService.gameStore.getSnapshot().fear, 4);
    assert.equal(characterService.charactersStore.getSnapshot().entities[hero.id]?.name, 'Общий герой');
    assert.equal(Object.values(sceneTableStore.getSnapshot().participants).some((seat) => seat.actorIds.includes(hero.id)), true);
    assert.equal(sceneTableStore.getSnapshot().scenes[sceneTableStore.getSnapshot().activeSceneId].backgroundUrl, 'https://example.test/long-game.webp');

    const oneShot = (await service.listStoredGames()).find((game) => game.name === 'Ваншот');
    assert.ok(oneShot);
    assert.equal(await service.removeStoredGame(oneShot.id), true);
    assert.equal(gameService.gameStore.getSnapshot().name, 'Длинная игра');
    assert.deepEqual((await service.listStoredGames()).map((game) => game.name), ['Длинная игра']);

    assert.equal(await service.removeStoredGame(first.id), true);
    assert.equal(gameService.gameStore.getSnapshot().name, '');
    assert.equal(gameService.gameStore.getSnapshot().fear, 0);
    assert.equal(characterService.charactersStore.getSnapshot().entities[hero.id]?.name, 'Общий герой');
    assert.equal(Object.values(sceneTableStore.getSnapshot().participants).some((seat) => seat.actorIds.includes(hero.id)), true);
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence hydration does not overwrite custom tool content from game document files', async () => {
  resetAllStores();
  applyBrowserCustomContent({
    ancestries: [{ id: 'tool-ancestry-kept', name: 'Tool ancestry kept' }],
    communities: [],
    subclasses: [],
    domainCards: [{ id: 'tool-card-kept', name: 'Tool card kept' }],
    cardDomains: [{ id: 'tool-domain-kept' }],
    adversaries: [{ id: -42, name: 'Tool adversary kept' }]
  });
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  const document = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  document.files['content/custom-ancestries.json'] = [];
  document.files['content/custom-domain-cards.json'] = [];
  document.files['content/custom-card-domains.json'] = [];
  document.files['content/custom-adversaries.json'] = [];
  documentStore.state = document;
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();
    assert.deepEqual(readBrowserCustomContent().ancestries, [{ id: 'tool-ancestry-kept', name: 'Tool ancestry kept' }]);
    assert.deepEqual(readBrowserCustomContent().domainCards, [{ id: 'tool-card-kept', name: 'Tool card kept' }]);
    assert.deepEqual(readBrowserCustomContent().cardDomains, [{ id: 'tool-domain-kept' }]);
    assert.deepEqual(readBrowserCustomContent().adversaries, [{ id: -42, name: 'Tool adversary kept' }]);
  } finally {
    service?.stop();
    applyBrowserCustomContent({ ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [] });
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});
