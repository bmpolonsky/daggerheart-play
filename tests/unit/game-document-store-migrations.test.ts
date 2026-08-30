import assert from "node:assert/strict";
import { test } from "vitest";
import { createGameDocument, emptyCustomContent, gameDocumentToPersistedState } from "../../src/domain/game/gameDocument";
import { createEncounterState, createGameState, createSceneTableState, createUiState } from "../../src/domain/rules/factories";
import { BrowserGameDocumentStore, isProjectDocument, isWorldArchiveDocument, isWorldLibraryDocument, prepareWorldLibraryDocument, worldAssetUsageCounts, type ProjectDocument, type ProjectGameState } from "../../src/core/persistence/gameDocumentStore";
import { prepareProjectDocument } from "../../src/core/persistence/migrations/gameDocumentStore";
import { migratePersistedState } from "../../src/domain/migrations/persistedState";
import { applyBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";

const now = '2026-06-08T00:00:00.000Z';

test('game document store migrates v1 project shared content to v2', () => {
  const v1Project = {
    kind: 'daggerheart-play:project',
    version: 1,
    project: { id: 'project-1', name: 'Project', createdAt: now, updatedAt: now },
    shared: {
      characters: { entities: {}, order: [], selectedId: null, updatedAt: now }
    },
    activeGameId: null,
    order: [],
    games: {}
  } as const;

  const migrated = prepareProjectDocument(v1Project, migrationHandlers());

  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.shared.participants, {});
  assert.deepEqual(migrated.shared.customContent, emptyCustomContent());
  assert.equal(isProjectDocument(migrated), true);
});

test('game document store repairs recoverable v2 project indexes', () => {
  const brokenProject = {
    kind: 'daggerheart-play:project',
    version: 2,
    project: { id: 'project-1', name: 'Project', createdAt: now, updatedAt: now },
    shared: {
      characters: { entities: {}, order: [], selectedId: null, updatedAt: now },
      participants: {},
      customContent: emptyCustomContent()
    },
    activeGameId: 'missing-game',
    order: ['missing-game', 'game-1', 'game-1'],
    games: {
      'game-1': {
        id: 'wrong-record-id',
        createdAt: now,
        updatedAt: now,
        state: minimalProjectGameState()
      },
      'game-2': {
        id: 'game-2',
        createdAt: now,
        updatedAt: now,
        state: minimalProjectGameState()
      }
    }
  };

  assert.equal(isProjectDocument(brokenProject), false);
  const migrated = prepareProjectDocument(brokenProject, migrationHandlers());

  assert.equal(isProjectDocument(migrated), true);
  assert.equal(migrated.activeGameId, 'game-1');
  assert.deepEqual(migrated.order, ['game-1', 'game-2']);
  assert.equal(migrated.games['game-1'].id, 'game-1');
});

test('game document store preserves old custom content and adds new collections', () => {
  const project = validProjectDocument();
  const legacyContent = project.shared.customContent as unknown as Record<string, unknown>;
  legacyContent.ancestries = [{ id: 'old-ancestry' }];
  delete legacyContent.classes;
  delete legacyContent.equipment;
  delete legacyContent.beastforms;

  const migrated = prepareProjectDocument(project, migrationHandlers());

  assert.deepEqual(migrated.shared.customContent.ancestries, [{ id: 'old-ancestry' }]);
  assert.deepEqual(migrated.shared.customContent.classes, []);
  assert.deepEqual(migrated.shared.customContent.equipment, []);
  assert.deepEqual(migrated.shared.customContent.beastforms, []);
});

test('game document store accepts valid v2 project documents', () => {
  const project = validProjectDocument();

  assert.equal(isProjectDocument(project), true);
});

test('project migration creates one world with per-game characters and shared assets', () => {
  const project = validProjectDocument();
  project.project.name = 'Эстория';
  project.shared.characters = {
    entities: { hero: { id: 'hero', name: 'Герой' } as never },
    order: ['hero'],
    selectedId: 'hero',
    updatedAt: now
  };
  project.shared.participants = { seat: { id: 'seat', name: 'Игрок' } as never };
  project.games['game-1'].state.sceneTable.assets = {
    map: { id: 'map', name: 'map.webp', mimeType: 'image/webp', storage: 'indexeddb', createdAt: now }
  };
  project.games['game-2'] = {
    id: 'game-2',
    createdAt: now,
    updatedAt: now,
    state: minimalProjectGameState()
  };
  project.games['game-2'].state.sceneTable.assets = {
    music: { id: 'music', name: 'theme.mp3', mimeType: 'audio/mpeg', storage: 'indexeddb', createdAt: now }
  };
  project.order.push('game-2');

  const library = prepareWorldLibraryDocument(project);
  const world = library.worlds[library.activeWorldId as string];

  assert.equal(isWorldLibraryDocument(library), true);
  assert.equal(world.name, 'Эстория');
  assert.deepEqual(Object.keys(world.shared.assets).sort(), ['map', 'music']);
  assert.equal(world.games['game-1'].state.characters.entities.hero?.name, 'Герой');
  assert.equal(world.games['game-2'].state.characters.entities.hero?.name, 'Герой');
  assert.equal(world.games['game-1'].state.sceneTable.participants.seat?.name, 'Игрок');
  assert.equal('assets' in world.games['game-1'].state.sceneTable, false);
});

test('project migration keeps newer custom content from the dedicated browser store', async () => {
  applyBrowserCustomContent({
    ...emptyCustomContent(),
    ancestries: [{ id: 'browser-ancestry', name: 'Новая родословная' }]
  });
  let stored: unknown = validProjectDocument();
  const store = new BrowserGameDocumentStore({
    get: async <T>() => stored as T | null,
    put: async (_key, value) => { stored = value; },
    delete: async () => { stored = null; },
    subscribe: () => () => undefined
  }, undefined);

  try {
    await store.load();
    const world = await store.exportWorld();
    assert.equal(world?.world.shared.customContent.ancestries[0]?.name, 'Новая родословная');
  } finally {
    applyBrowserCustomContent(emptyCustomContent());
  }
});

test('world asset usage counts include backgrounds, music and layers across games', () => {
  const library = prepareWorldLibraryDocument(validProjectDocument());
  const world = library.worlds[library.activeWorldId as string];
  const scene = Object.values(world.games['game-1'].state.sceneTable.scenes)[0];
  scene.backgroundAssetId = 'map';
  scene.music.assetId = 'music';
  scene.layers = [{ ...scene.layers[0], id: 'overlay', name: 'Overlay', kind: 'overlay', assetId: 'map' } as never];

  assert.deepEqual(worldAssetUsageCounts(world), { map: 2, music: 1 });
});

test('world archive validation rejects a world without an active game', () => {
  const library = prepareWorldLibraryDocument(validProjectDocument());
  const world = library.worlds[library.activeWorldId as string];
  assert.equal(isWorldArchiveDocument({
    kind: 'daggerheart-play:world-archive',
    version: 1,
    exportedAt: now,
    world: { ...world, activeGameId: null, order: [], games: {} }
  }), false);
});

test('world store creates and switches independent worlds and games', async () => {
  let stored: unknown = validProjectDocument();
  const store = new BrowserGameDocumentStore({
    get: async <T>() => stored as T | null,
    put: async (_key, value) => { stored = value; },
    delete: async () => { stored = null; },
    subscribe: () => () => undefined
  }, undefined);
  const emptyState = {
    schemaVersion: 6 as const,
    game: { ...createGameState(), name: 'Новая игра' },
    characters: { entities: {}, order: [], selectedId: null, updatedAt: now },
    encounter: createEncounterState(),
    rollLog: [],
    feed: [],
    ui: createUiState(),
    sceneTable: createSceneTableState()
  };
  const newWorldId = await store.createWorld(createGameDocument(emptyState), 'Другой мир');

  assert.deepEqual((await store.listWorlds()).map((world) => world.name), ['Другой мир', 'Project']);
  assert.deepEqual((await store.listWorlds())[0]?.games.map((game) => game.name), ['Новая игра']);
  assert.equal((await store.list()).length, 1);
  assert.equal(gameDocumentToPersistedState((await store.load())!).characters.order.length, 0);

  const oldWorld = await store.setActiveWorld('project-1');
  assert.ok(oldWorld);
  assert.equal(gameDocumentToPersistedState(oldWorld).characters.order.length, 0);
  const secondGameId = await store.create(createGameDocument({ ...emptyState, game: { ...createGameState(), name: 'Вторая игра' } }));
  assert.equal((await store.list()).length, 2);
  assert.equal((await store.list()).find((game) => game.id === secondGameId)?.active, true);
  assert.equal((await store.exportWorld('project-1'))?.world.order.length, 2);
  assert.equal((await store.setActiveWorld(newWorldId))?.manifest.name, 'Новая игра');
});

test('current persisted games default The Void materials to disabled when the setting is absent', () => {
  const state = minimalProjectGameState();
  const legacyGame = { ...state.game } as Partial<typeof state.game>;
  delete legacyGame.includeVoidContent;

  const migrated = migratePersistedState({
    schemaVersion: 5,
    ...state,
    game: legacyGame,
    characters: { entities: {}, order: [], selectedId: null, updatedAt: now }
  });

  assert.equal(migrated.game.includeVoidContent, false);
});

test('game document store rejects unusable project game records', () => {
  const missingGameState = validProjectDocument();
  missingGameState.games['game-1'] = {
    ...missingGameState.games['game-1'],
    state: {
      ...missingGameState.games['game-1'].state,
      game: undefined
    } as unknown as ProjectGameState
  };
  assert.equal(isProjectDocument(missingGameState), false);

  const nonArrayFeed = validProjectDocument();
  nonArrayFeed.games['game-1'] = {
    ...nonArrayFeed.games['game-1'],
    state: {
      ...nonArrayFeed.games['game-1'].state,
      feed: {}
    } as unknown as ProjectGameState
  };
  assert.equal(isProjectDocument(nonArrayFeed), false);

  const mismatchedRecordId = validProjectDocument();
  mismatchedRecordId.games['game-1'] = {
    ...mismatchedRecordId.games['game-1'],
    id: 'wrong-game'
  };
  assert.equal(isProjectDocument(mismatchedRecordId), false);
});

function validProjectDocument(): ProjectDocument {
  return {
    kind: 'daggerheart-play:project',
    version: 2,
    project: { id: 'project-1', name: 'Project', createdAt: now, updatedAt: now },
    shared: {
      characters: { entities: {}, order: [], selectedId: null, updatedAt: now },
      participants: {},
      customContent: emptyCustomContent()
    },
    activeGameId: 'game-1',
    order: ['game-1'],
    games: {
      'game-1': {
        id: 'game-1',
        createdAt: now,
        updatedAt: now,
        state: minimalProjectGameState()
      }
    }
  };
}

function minimalProjectGameState(): ProjectGameState {
  const { participants: _participants, ...sceneTable } = createSceneTableState();
  return {
    game: createGameState(),
    encounter: createEncounterState(),
    rollLog: [],
    feed: [],
    ui: createUiState(),
    sceneTable
  };
}

function migrationHandlers() {
  return {
    isProjectDocument,
    projectFromGameDocument: () => {
      throw new Error('Unexpected game document migration.');
    },
    toGameDocument: () => {
      throw new Error('Unexpected stored value conversion.');
    }
  };
}
