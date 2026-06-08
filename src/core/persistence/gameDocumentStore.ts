import {
  createGameDocument,
  emptyCustomContent,
  gameDocumentCustomContent,
  gameDocumentToPersistedState,
  isGameDocument,
  type GameCustomContent,
  type GameDocument
} from '../../domain/game/gameDocument';
import type { CharactersState, PersistedState, SceneTableState } from '../../domain/rules/types';
import { createId } from '../utils/id';
import { CURRENT_PERSISTED_STATE_VERSION } from '../../domain/migrations/persistedState';
import { GAME_DOCUMENT_STORAGE } from './storageKeys';
import { createKeyValueStore, type KeyValueDocumentStore } from './keyValueStore';
import {
  deletePreviousProjectDocuments,
  prepareProjectDocument,
  prepareStoredGameState,
  readPreviousProjectDocument
} from './migrations/gameDocumentStore';

const PROJECT_DOCUMENT_VERSION = 2;

export interface StoredGameSummary {
  id: string;
  name: string;
  updatedAt: string | null;
  active: boolean;
}

export interface GameDocumentStore {
  load(): Promise<GameDocument | PersistedState | null>;
  save(document: GameDocument): Promise<void>;
  delete(): Promise<void>;
  list(): Promise<StoredGameSummary[]>;
  create(document: GameDocument): Promise<string>;
  remove(id: string, replacement?: GameDocument): Promise<GameDocument | PersistedState | null>;
  setActive(id: string): Promise<GameDocument | PersistedState | null>;
  subscribe(listener: (document: GameDocument | PersistedState | null) => void): () => void;
}

export interface ProjectDocument {
  kind: 'daggerheart-play:project';
  version: typeof PROJECT_DOCUMENT_VERSION;
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  shared: {
    characters: CharactersState;
    participants: SceneTableState['participants'];
    customContent: GameCustomContent;
  };
  activeGameId: string | null;
  order: string[];
  games: Record<string, ProjectGameRecord>;
}

export interface ProjectGameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: ProjectGameState;
}

export interface ProjectGameState {
  game: PersistedState['game'];
  encounter: PersistedState['encounter'];
  rollLog: PersistedState['rollLog'];
  feed: PersistedState['feed'];
  ui: PersistedState['ui'];
  sceneTable: Omit<SceneTableState, 'participants'>;
}

export function createGameDocumentStore(indexedDb: IDBFactory | undefined = globalThis.indexedDB): GameDocumentStore | null {
  const store = createKeyValueStore(GAME_DOCUMENT_STORAGE.dbName, GAME_DOCUMENT_STORAGE.storeName, indexedDb);
  if (!store) return null;
  return new BrowserGameDocumentStore(store, indexedDb);
}

class BrowserGameDocumentStore implements GameDocumentStore {
  private migrationPromise: Promise<ProjectDocument | null> | null = null;

  constructor(
    private readonly store: KeyValueDocumentStore,
    private readonly indexedDb: IDBFactory | undefined
  ) {}

  async load(): Promise<GameDocument | null> {
    const project = await this.loadProject();
    return activeDocument(project);
  }

  async save(document: GameDocument): Promise<void> {
    const project = await this.loadProject();
    const next = upsertActiveGame(project, document);
    await this.saveProject(next);
  }

  async delete(): Promise<void> {
    const project = await this.loadProject();
    if (!project.activeGameId) {
      await this.store.delete(GAME_DOCUMENT_STORAGE.key);
      return;
    }
    await this.saveProject(removeGame(project, project.activeGameId));
  }

  async list(): Promise<StoredGameSummary[]> {
    const project = await this.loadProject();
    return project.order
      .map((id) => project.games[id])
      .filter((record): record is ProjectGameRecord => Boolean(record))
      .map((record) => ({
        id: record.id,
        name: record.state.game.name,
        updatedAt: record.state.game.updatedAt || record.updatedAt || null,
        active: record.id === project.activeGameId
      }));
  }

  async create(document: GameDocument): Promise<string> {
    const project = await this.loadProject();
    const id = createId('game');
    const next = upsertGame(project, document, id, true);
    await this.saveProject(next);
    return id;
  }

  async remove(id: string, replacement?: GameDocument): Promise<GameDocument | null> {
    const project = await this.loadProject();
    if (!project.games[id]) {
      return activeDocument(project);
    }
    const removed = removeGame(project, id);
    const next = replacement && removed.order.length === 0
      ? upsertGame(removed, replacement, createId('game'), true)
      : removed;
    await this.saveProject(next);
    return activeDocument(next);
  }

  async setActive(id: string): Promise<GameDocument | null> {
    const project = await this.loadProject();
    if (!project.games[id]) {
      return null;
    }
    const next = { ...project, activeGameId: id };
    await this.saveProject(next);
    return activeDocument(next);
  }

  subscribe(listener: (document: GameDocument | null) => void): () => void {
    return this.store.subscribe<unknown>(GAME_DOCUMENT_STORAGE.key, (value) => {
      try {
        listener(value ? activeDocument(projectFromStored(value)) : null);
      } catch {
        listener(null);
      }
    });
  }

  private async loadProject(): Promise<ProjectDocument> {
    const stored = await this.store.get<unknown>(GAME_DOCUMENT_STORAGE.key);
    if (stored) {
      try {
        const project = projectFromStored(stored);
        if (!isProjectDocument(stored)) {
          await this.saveProject(project);
        }
        return project;
      } catch {
        return emptyProject();
      }
    }

    const migrated = await this.oneTimeMigratePreviousProject();
    if (migrated) {
      return migrated;
    }
    return emptyProject();
  }

  private oneTimeMigratePreviousProject(): Promise<ProjectDocument | null> {
    this.migrationPromise ??= this.readPreviousGameDocument().then(async (document) => {
      if (!document) return null;
      const project = projectFromStored(document);
      await this.saveProject(project);
      await this.deletePreviousGameDocuments();
      return project;
    });
    return this.migrationPromise;
  }

  private async saveProject(project: ProjectDocument): Promise<void> {
    if (!isProjectDocument(project)) {
      throw new Error('Refusing to persist invalid game project document.');
    }
    await this.store.put(GAME_DOCUMENT_STORAGE.key, project);
  }

  private async readPreviousGameDocument(): Promise<unknown | null> {
    return readPreviousProjectDocument(this.indexedDb);
  }

  private async deletePreviousGameDocuments(): Promise<void> {
    await deletePreviousProjectDocuments(this.indexedDb);
  }
}

function emptyProject(): ProjectDocument {
  const now = new Date().toISOString();
  return {
    kind: 'daggerheart-play:project',
    version: PROJECT_DOCUMENT_VERSION,
    project: {
      id: createId('project'),
      name: '',
      createdAt: now,
      updatedAt: now
    },
    shared: {
      characters: { entities: {}, order: [], selectedId: null, updatedAt: now },
      participants: {},
      customContent: emptyCustomContent()
    },
    activeGameId: null,
    order: [],
    games: {}
  };
}

function projectFromStored(value: unknown): ProjectDocument {
  return prepareProjectDocument(value, {
    isProjectDocument,
    projectFromGameDocument,
    toGameDocument
  });
}

function projectFromGameDocument(document: GameDocument): ProjectDocument {
  const state = gameDocumentToPersistedState(document);
  const now = document.manifest.updatedAt || state.game.updatedAt || new Date().toISOString();
  const gameId = createId('game');
  return {
    ...emptyProject(),
    project: {
      id: createId('project'),
      name: '',
      createdAt: now,
      updatedAt: now
    },
    shared: sharedFromState(state, gameDocumentCustomContent(document)),
    activeGameId: gameId,
    order: [gameId],
    games: {
      [gameId]: gameRecordFromState(gameId, state)
    }
  };
}

function upsertActiveGame(project: ProjectDocument, document: GameDocument): ProjectDocument {
  const activeId = project.activeGameId && project.games[project.activeGameId] ? project.activeGameId : createId('game');
  return upsertGame(project, document, activeId, true);
}

function upsertGame(project: ProjectDocument, document: GameDocument, id: string, makeActive: boolean): ProjectDocument {
  const state = gameDocumentToPersistedState(document);
  const previous = project.games[id];
  const record = gameRecordFromState(id, state, previous);
  return {
    ...project,
    project: { ...project.project, updatedAt: record.updatedAt },
    shared: sharedFromState(state, gameDocumentCustomContent(document)),
    activeGameId: makeActive ? id : project.activeGameId,
    order: project.order.includes(id) ? project.order : [id, ...project.order],
    games: {
      ...project.games,
      [id]: record
    }
  };
}

function removeGame(project: ProjectDocument, id: string): ProjectDocument {
  const games = { ...project.games };
  delete games[id];
  const order = project.order.filter((gameId) => gameId !== id);
  return {
    ...project,
    project: { ...project.project, updatedAt: new Date().toISOString() },
    activeGameId: project.activeGameId === id ? order[0] ?? null : project.activeGameId,
    order,
    games
  };
}

function activeDocument(project: ProjectDocument): GameDocument | null {
  const record = project.activeGameId ? project.games[project.activeGameId] : null;
  if (!record) {
    return null;
  }
  return createGameDocument(composePersistedState(project, record), project.shared.customContent);
}

function composePersistedState(project: ProjectDocument, record: ProjectGameRecord): PersistedState {
  return {
    schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
    game: record.state.game,
    characters: project.shared.characters,
    encounter: record.state.encounter,
    rollLog: record.state.rollLog,
    feed: record.state.feed,
    ui: record.state.ui,
    sceneTable: {
      ...record.state.sceneTable,
      participants: project.shared.participants
    }
  };
}

function sharedFromState(state: PersistedState, customContent: GameCustomContent): ProjectDocument['shared'] {
  return {
    characters: state.characters,
    participants: state.sceneTable.participants,
    customContent
  };
}

function gameRecordFromState(id: string, state: PersistedState, previous?: Pick<ProjectGameRecord, 'createdAt'>): ProjectGameRecord {
  const updatedAt = state.game.updatedAt || state.sceneTable.updatedAt || new Date().toISOString();
  return {
    id,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    state: {
      game: state.game,
      encounter: state.encounter,
      rollLog: state.rollLog,
      feed: state.feed,
      ui: state.ui,
      sceneTable: stripParticipants(state.sceneTable)
    }
  };
}

function stripParticipants(sceneTable: SceneTableState): Omit<SceneTableState, 'participants'> {
  const { participants: _participants, ...gameSceneTable } = sceneTable;
  return gameSceneTable;
}

function toGameDocument(value: unknown): GameDocument {
  if (isGameDocument(value)) {
    return value;
  }
  return createGameDocument(prepareStoredGameState(value));
}

export function isProjectDocument(value: unknown): value is ProjectDocument {
  if (!isRecord(value)) return false;
  if (value.kind !== 'daggerheart-play:project' || value.version !== PROJECT_DOCUMENT_VERSION) return false;
  if (!isRecord(value.project) || !isRecord(value.shared) || !isRecord(value.games) || !Array.isArray(value.order)) return false;
  if (!isRecord(value.shared.characters) || !isRecord(value.shared.participants) || !isCustomContent(value.shared.customContent)) return false;
  if (value.activeGameId !== null && typeof value.activeGameId !== 'string') return false;
  const order = value.order;
  const games = value.games;
  if (!order.every((id) => typeof id === 'string' && Boolean(games[id]))) return false;
  const gameIds = Object.keys(games);
  if (gameIds.some((id) => !order.includes(id))) return false;
  if (gameIds.length > 0 && (typeof value.activeGameId !== 'string' || !games[value.activeGameId])) return false;
  for (const [id, game] of Object.entries(games)) {
    if (!isProjectGameRecord(id, game)) return false;
  }
  return true;
}

function isProjectGameRecord(id: string, value: unknown): value is ProjectGameRecord {
  return Boolean(
    isRecord(value) &&
    value.id === id &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    isProjectGameState(value.state)
  );
}

function isProjectGameState(value: unknown): value is ProjectGameState {
  return Boolean(
    isRecord(value) &&
    isRecord(value.game) &&
    isRecord(value.encounter) &&
    Array.isArray(value.rollLog) &&
    Array.isArray(value.feed) &&
    isRecord(value.ui) &&
    isRecord(value.sceneTable) &&
    isRecord(value.sceneTable.scenes) &&
    isRecord(value.sceneTable.assets) &&
    Array.isArray(value.sceneTable.sceneOrder)
  );
}

function isCustomContent(value: unknown): value is GameCustomContent {
  return Boolean(
    isRecord(value) &&
    Array.isArray(value.ancestries) &&
    Array.isArray(value.communities) &&
    Array.isArray(value.subclasses) &&
    Array.isArray(value.domainCards) &&
    Array.isArray(value.cardDomains) &&
    Array.isArray(value.adversaries)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
