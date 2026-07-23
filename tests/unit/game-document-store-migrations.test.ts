import assert from "node:assert/strict";
import { test } from "vitest";
import { emptyCustomContent } from "../../src/domain/game/gameDocument";
import { createEncounterState, createGameState, createSceneTableState, createUiState } from "../../src/domain/rules/factories";
import { isProjectDocument, type ProjectDocument, type ProjectGameState } from "../../src/core/persistence/gameDocumentStore";
import { prepareProjectDocument } from "../../src/core/persistence/migrations/gameDocumentStore";
import { migratePersistedState } from "../../src/domain/migrations/persistedState";

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

test('game document store accepts valid v2 project documents', () => {
  const project = validProjectDocument();

  assert.equal(isProjectDocument(project), true);
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
