import { test } from "vitest";
import assert from "node:assert/strict";
import { createSceneTableState } from "../../src/domain/rules/factories";
import { createTokenState } from "../../src/domain/tabletop/factories";
import { resetAllStores, sceneTableStore, syncedGameStores } from "../../src/stores/gameStores";
import { snapshotPersistedState } from "../../src/stores/persistedState";
import { gameService, characterService, contentService, importExportService, sceneTableService } from "../../src/services/serviceRegistry";
import { PersistenceService } from "../../src/services/PersistenceService";
import { applyBrowserCustomContent, readBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";
import { emptyCustomContent, type GameDocument } from "../../src/domain/game/gameDocument";
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

class DelayedMemoryGameDocumentStore extends MemoryGameDocumentStore {
  saveDelays: number[] = [];
  saveCount = 0;

  async save(document: GameDocument): Promise<void> {
    this.saveCount += 1;
    const delay = this.saveDelays.shift() ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await super.save(document);
  }
}

class FailingSaveMemoryGameDocumentStore extends MemoryGameDocumentStore {
  async save(_document: GameDocument): Promise<void> {
    throw new Error('save failed');
  }
}

test('persistence mirrors the exported game document into IndexedDB with custom tool content', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const memory = new Map<string, string>();
  const documentStore = new MemoryGameDocumentStore();
  applyBrowserCustomContent({
    ...emptyCustomContent(),
    ancestries: [{ id: 'custom-ancestry-1', name: 'Custom Ancestry' }],
    communities: [],
    subclasses: [],
    domainCards: [{ id: 'custom-card-1', name: 'Custom Card' }],
    cardDomains: [{ id: 'custom-domain-1' }],
    adversaries: [{ id: 42, name: 'Custom Adversary' }],
    environments: [{ id: 'custom-environment-1', name: 'Custom Environment' }],
    classes: [{ id: 'custom-class-1', name: 'Custom Class' }],
    equipment: [{ id: 'custom-equipment-1', name: 'Custom Equipment' }],
    beastforms: [{ id: 'custom-beastform-1', name: 'Custom Beastform' }]
  });
  const fakeWindow = createFakeWindow(memory);
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

  try {
    const service = new PersistenceService(documentStore);
    service.persistNow();
    await waitFor(() => assert.equal(documentStore.state?.manifest.kind, 'daggerheart-play:game'));

    assert.deepEqual(documentStore.state, JSON.parse(importExportService.exportGameJson(false)));
    assert.equal(documentStore.state?.files['data/game.json'].name, snapshotPersistedState().game.name);
    assert.deepEqual(documentStore.state?.files['content/custom-ancestries.json'], [{ id: 'custom-ancestry-1', name: 'Custom Ancestry' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-domain-cards.json'], [{ id: 'custom-card-1', name: 'Custom Card' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-card-domains.json'], [{ id: 'custom-domain-1' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-adversaries.json'], [{ id: 42, name: 'Custom Adversary' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-environments.json'], [{ id: 'custom-environment-1', name: 'Custom Environment' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-classes.json'], [{ id: 'custom-class-1', name: 'Custom Class' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-equipment.json'], [{ id: 'custom-equipment-1', name: 'Custom Equipment' }]);
    assert.deepEqual(documentStore.state?.files['content/custom-beastforms.json'], [{ id: 'custom-beastform-1', name: 'Custom Beastform' }]);
    assert.equal(memory.has('daggerheart-play:v3:game:local'), false);

    service.resetEverything();
    await Promise.resolve();
    assert.equal(documentStore.state, null);
  } finally {
    applyBrowserCustomContent(emptyCustomContent());
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

    const state = sceneTableStore.get();
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

    assert.equal(syncedGameStores.game.get().name, 'Синхронная игра');
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

test('persistence imports a game document atomically with shared characters', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  const importedHero = characterService.createCharacter({ name: 'Импортированный герой' });
  gameService.updateGame({ name: 'Импортированная игра' });
  gameService.setFear(8);
  sceneTableService.updateScene(sceneTableStore.get().activeSceneId, { backgroundUrl: 'https://example.test/imported-scene.webp' });
  const importedDocument = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  resetAllStores();
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();
    await service.importGameDocument(importedDocument);

    assert.equal(gameService.game$.get().name, 'Импортированная игра');
    assert.equal(gameService.game$.get().fear, 8);
    assert.equal(characterService.getCharacter(importedHero.id)?.name, 'Импортированный герой');
    assert.equal(sceneTableStore.get().scenes[sceneTableStore.get().activeSceneId].backgroundUrl, 'https://example.test/imported-scene.webp');
    assert.equal(documentStore.state?.files['data/characters.json'].entities[importedHero.id]?.name, 'Импортированный герой');
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence does not apply imported game when saving the document fails', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  gameService.updateGame({ name: 'Текущая игра' });
  const importedHero = characterService.createCharacter({ name: 'Не должен появиться' });
  gameService.updateGame({ name: 'Несохраненный импорт' });
  const importedDocument = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  resetAllStores();
  gameService.updateGame({ name: 'Текущая игра' });
  const documentStore = new FailingSaveMemoryGameDocumentStore();
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();

    await assert.rejects(() => service!.importGameDocument(importedDocument), /save failed/);
    assert.equal(gameService.game$.get().name, 'Текущая игра');
    assert.equal(characterService.getCharacter(importedHero.id), null);
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence keeps the newest snapshot when saves finish out of order', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new DelayedMemoryGameDocumentStore();
  documentStore.saveDelays = [100, 0];
  Object.defineProperty(globalThis, 'window', {
    value: createFakeWindow(),
    configurable: true
  });

  try {
    const service = new PersistenceService(documentStore);
    service.persistNow();
    const character = characterService.createCharacter({ name: 'Последний герой' });
    service.persistNow();

    await waitFor(() => {
      assert.equal(documentStore.state?.files['data/characters.json'].entities[character.id]?.name, 'Последний герой');
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(documentStore.state?.files['data/characters.json'].entities[character.id]?.name, 'Последний герой');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence debounces rapid automatic saves', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const documentStore = new DelayedMemoryGameDocumentStore();
  documentStore.state = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  Object.defineProperty(globalThis, 'window', { value: createFakeWindow(), configurable: true });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();
    await waitFor(() => assert.equal(documentStore.saveCount, 1));
    const initialSaveCount = documentStore.saveCount;

    gameService.setFear(1);
    gameService.setFear(2);
    gameService.setFear(3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(documentStore.saveCount, initialSaveCount);

    await waitFor(() => assert.equal(documentStore.saveCount, initialSaveCount + 1));
    assert.equal(documentStore.state?.files['data/game.json'].fear, 3);
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence does not restore an older token position from its own in-flight save', async () => {
  resetAllStores();
  const originalWindow = globalThis.window;
  const sceneId = sceneTableStore.get().activeSceneId;
  sceneTableStore.update((state) => ({
    ...state,
    scenes: {
      ...state.scenes,
      [sceneId]: {
        ...state.scenes[sceneId],
        tokens: [createTokenState({ kind: 'character', id: 'dragged' }, { id: 'character:dragged', x: 10, y: 20 })]
      }
    }
  }));
  const documentStore = new DelayedMemoryGameDocumentStore();
  documentStore.state = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  resetAllStores();
  Object.defineProperty(globalThis, 'window', { value: createFakeWindow(), configurable: true });
  let service: PersistenceService | null = null;

  try {
    service = new PersistenceService(documentStore);
    service.start();
    await service.whenReady();
    await waitFor(() => {
      assert.equal(documentStore.state?.files['data/scene-table.json'].scenes[sceneId].tokens[0]?.x, 10);
    });
    documentStore.saveDelays = [80, 80];

    sceneTableService.moveTokenInScene(sceneId, 'character:dragged', 120, 120, null, true);
    service.persistNow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    sceneTableService.moveTokenInScene(sceneId, 'character:dragged', 780, 780, null, true);
    await new Promise((resolve) => setTimeout(resolve, 90));

    assert.equal(sceneTableStore.get().scenes[sceneId].tokens[0]?.x, 780);
    await waitFor(() => {
      assert.equal(documentStore.state?.files['data/scene-table.json'].scenes[sceneId].tokens[0]?.x, 780);
    });
  } finally {
    service?.stop();
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence keeps characters and participants inside their game', async () => {
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
    sceneTableService.updateScene(sceneTableStore.get().activeSceneId, { backgroundUrl: 'https://example.test/long-game.webp' });
    service.persistNow();
    await waitFor(() => assert.equal(documentStore.state?.files['data/game.json'].name, 'Длинная игра'));
    const [first] = await service.listStoredGames();
    assert.ok(first);

    await service.createStoredGame();
    assert.equal(characterService.characters$.get().entities[hero.id], undefined);
    assert.deepEqual(sceneTableStore.get().participants, {});
    assert.equal(gameService.game$.get().fear, 0);
    gameService.updateGame({ name: 'Ваншот' });
    gameService.setFear(1);
    service.persistNow();
    await waitFor(() => assert.equal(documentStore.state?.files['data/game.json'].name, 'Ваншот'));

    const games = await service.listStoredGames();
    assert.deepEqual(games.map((game) => game.name), ['Ваншот', 'Длинная игра']);
    assert.equal(games.find((game) => game.name === 'Ваншот')?.active, true);

    assert.equal(await service.switchStoredGame(first.id), true);
    assert.equal(gameService.game$.get().name, 'Длинная игра');
    assert.equal(gameService.game$.get().fear, 4);
    assert.equal(characterService.characters$.get().entities[hero.id]?.name, 'Общий герой');
    assert.equal(Object.values(sceneTableStore.get().participants).some((seat) => seat.actorIds.includes(hero.id)), true);
    assert.equal(sceneTableStore.get().scenes[sceneTableStore.get().activeSceneId].backgroundUrl, 'https://example.test/long-game.webp');

    const oneShot = (await service.listStoredGames()).find((game) => game.name === 'Ваншот');
    assert.ok(oneShot);
    assert.equal(await service.removeStoredGame(oneShot.id), true);
    assert.equal(gameService.game$.get().name, 'Длинная игра');
    assert.deepEqual((await service.listStoredGames()).map((game) => game.name), ['Длинная игра']);

    assert.equal(await service.removeStoredGame(first.id), true);
    assert.equal(gameService.game$.get().name, '');
    assert.equal(gameService.game$.get().fear, 0);
    assert.equal(characterService.characters$.get().entities[hero.id], undefined);
    assert.deepEqual(sceneTableStore.get().participants, {});
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('persistence hydration switches the custom content mirror to the stored world', async () => {
  resetAllStores();
  applyBrowserCustomContent({
    ...emptyCustomContent(),
    ancestries: [{ id: 'tool-ancestry-kept', name: 'Tool ancestry kept' }],
    communities: [],
    subclasses: [],
    domainCards: [{ id: 'tool-card-kept', name: 'Tool card kept' }],
    cardDomains: [{ id: 'tool-domain-kept' }],
    adversaries: [{ id: -42, name: 'Tool adversary kept' }],
    environments: [{ id: 'tool-environment-kept', name: 'Tool environment kept' }]
  });
  const originalWindow = globalThis.window;
  const documentStore = new MemoryGameDocumentStore();
  const document = JSON.parse(importExportService.exportGameJson(false)) as GameDocument;
  document.files['content/custom-ancestries.json'] = [];
  document.files['content/custom-domain-cards.json'] = [];
  document.files['content/custom-card-domains.json'] = [];
  document.files['content/custom-adversaries.json'] = [];
  document.files['content/custom-environments.json'] = [];
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
    assert.deepEqual(readBrowserCustomContent(), emptyCustomContent());
  } finally {
    service?.stop();
    applyBrowserCustomContent(emptyCustomContent());
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});
