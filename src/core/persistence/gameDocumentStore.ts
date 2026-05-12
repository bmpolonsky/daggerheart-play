import Dexie from 'dexie';
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
import { GAME_DOCUMENT_STORAGE } from './storageKeys';
import { createKeyValueStore, type KeyValueDocumentStore } from './keyValueStore';

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

interface ProjectDocument {
  kind: 'daggerheart-play:project';
  version: 1;
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

interface ProjectGameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: ProjectGameState;
}

interface ProjectGameState {
  game: PersistedState['game'];
  encounter: PersistedState['encounter'];
  rollLog: PersistedState['rollLog'];
  feed: PersistedState['feed'];
  ui: PersistedState['ui'];
  sceneTable: Omit<SceneTableState, 'participants'>;
}

type LegacyPersistedState = Omit<PersistedState, 'game'> & { campaign: PersistedState['game'] };
type StoredProjectValue = ProjectDocument | LegacyGameDocumentLibrary | GameDocument | PersistedState | LegacyPersistedState;

interface LegacyGameDocumentLibrary {
  kind: 'daggerheart-play:game-library';
  version: 1;
  activeGameId: string | null;
  order: string[];
  games: Record<string, {
    id: string;
    document: GameDocument | PersistedState | LegacyPersistedState;
    createdAt: string;
    updatedAt: string;
  }>;
}

const LEGACY_GAME_DOCUMENT_STORAGES = [{
  dbName: 'daggerheart-play-game-project',
  storeName: 'documents',
  key: 'current-game-project'
}, {
  dbName: 'daggerheart-play',
  storeName: 'game-documents',
  key: 'local-game'
}] as const;

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
    await this.store.put(GAME_DOCUMENT_STORAGE.key, next);
  }

  async delete(): Promise<void> {
    const project = await this.loadProject();
    if (!project.activeGameId) {
      await this.store.delete(GAME_DOCUMENT_STORAGE.key);
      return;
    }
    await this.store.put(GAME_DOCUMENT_STORAGE.key, removeGame(project, project.activeGameId));
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
    await this.store.put(GAME_DOCUMENT_STORAGE.key, next);
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
    await this.store.put(GAME_DOCUMENT_STORAGE.key, next);
    return activeDocument(next);
  }

  async setActive(id: string): Promise<GameDocument | null> {
    const project = await this.loadProject();
    if (!project.games[id]) {
      return null;
    }
    const next = { ...project, activeGameId: id };
    await this.store.put(GAME_DOCUMENT_STORAGE.key, next);
    return activeDocument(next);
  }

  subscribe(listener: (document: GameDocument | null) => void): () => void {
    return this.store.subscribe<StoredProjectValue>(GAME_DOCUMENT_STORAGE.key, (value) => {
      listener(value ? activeDocument(projectFromStored(value)) : null);
    });
  }

  private async loadProject(): Promise<ProjectDocument> {
    const stored = await this.store.get<StoredProjectValue>(GAME_DOCUMENT_STORAGE.key);
    if (stored) {
      const project = projectFromStored(stored);
      if (!isProjectDocument(stored)) {
        await this.store.put(GAME_DOCUMENT_STORAGE.key, project);
      }
      return project;
    }

    const migrated = await this.oneTimeMigrateLegacyProject();
    if (migrated) {
      return migrated;
    }
    return emptyProject();
  }

  // One-time local migration for pre-project test saves. Remove after local projects are migrated.
  private oneTimeMigrateLegacyProject(): Promise<ProjectDocument | null> {
    this.migrationPromise ??= this.readLegacyGameDocument().then(async (document) => {
      if (!document) return null;
      const project = projectFromStored(document);
      await this.store.put(GAME_DOCUMENT_STORAGE.key, project);
      await this.deleteLegacyGameDocuments();
      return project;
    });
    return this.migrationPromise;
  }

  private async readLegacyGameDocument(): Promise<GameDocument | PersistedState | LegacyPersistedState | null> {
    if (!this.indexedDb) {
      return null;
    }
    for (const storage of LEGACY_GAME_DOCUMENT_STORAGES) {
      const value = await readLegacyDocument(storage);
      if (value) return value;
    }
    return null;
  }

  private async deleteLegacyGameDocuments(): Promise<void> {
    if (!this.indexedDb) {
      return;
    }
    for (const storage of LEGACY_GAME_DOCUMENT_STORAGES) {
      await deleteLegacyDocument(storage);
    }
  }
}

function emptyProject(): ProjectDocument {
  const now = new Date().toISOString();
  return {
    kind: 'daggerheart-play:project',
    version: 1,
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

function projectFromStored(value: StoredProjectValue): ProjectDocument {
  if (isProjectDocument(value)) {
    return normalizeProject(value);
  }
  if (isLegacyGameDocumentLibrary(value)) {
    return projectFromLegacyGameLibrary(value);
  }
  return projectFromGameDocument(toGameDocument(value));
}

function normalizeProject(project: ProjectDocument): ProjectDocument {
  const order = project.order.filter((id) => Boolean(project.games[id]));
  const fallbackIds = Object.keys(project.games).filter((id) => !order.includes(id));
  const normalizedOrder = [...order, ...fallbackIds];
  return {
    ...project,
    activeGameId: project.activeGameId && project.games[project.activeGameId] ? project.activeGameId : normalizedOrder[0] ?? null,
    order: normalizedOrder,
    shared: {
      characters: project.shared.characters,
      participants: project.shared.participants ?? {},
      customContent: project.shared.customContent ?? emptyCustomContent()
    }
  };
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

function projectFromLegacyGameLibrary(library: LegacyGameDocumentLibrary): ProjectDocument {
  const records = library.order
    .map((id) => library.games[id])
    .filter((record): record is LegacyGameDocumentLibrary['games'][string] => Boolean(record));
  const fallbackRecords = Object.values(library.games).filter((record) => !records.some((item) => item.id === record.id));
  const orderedRecords = [...records, ...fallbackRecords];
  const activeRecord = orderedRecords.find((record) => record.id === library.activeGameId) ?? orderedRecords[0] ?? null;
  const states = orderedRecords.map((record) => ({ record, document: toGameDocument(record.document) }));
  const activeDocumentValue = activeRecord ? toGameDocument(activeRecord.document) : states[0]?.document ?? null;
  const activeState = activeDocumentValue ? gameDocumentToPersistedState(activeDocumentValue) : null;
  const project = emptyProject();
  const shared = activeState
    ? mergeSharedState(states.map(({ document }) => gameDocumentToPersistedState(document)), activeState, gameDocumentCustomContent(activeDocumentValue))
    : project.shared;
  const games = Object.fromEntries(states.map(({ record, document }) => {
    const state = gameDocumentToPersistedState(document);
    return [record.id, gameRecordFromState(record.id, state, record)];
  }));
  const order = orderedRecords.map((record) => record.id).filter((id) => Boolean(games[id]));
  return {
    ...project,
    project: {
      ...project.project,
      createdAt: activeRecord?.createdAt ?? project.project.createdAt,
      updatedAt: activeRecord?.updatedAt ?? project.project.updatedAt
    },
    shared,
    activeGameId: activeRecord?.id ?? order[0] ?? null,
    order,
    games
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
    schemaVersion: 4,
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

function mergeSharedState(states: PersistedState[], activeState: PersistedState, customContent: GameCustomContent): ProjectDocument['shared'] {
  const order = unique([...activeState.characters.order, ...states.flatMap((state) => state.characters.order)]);
  const entities = Object.assign({}, ...states.map((state) => state.characters.entities), activeState.characters.entities);
  const participants = Object.assign({}, ...states.map((state) => state.sceneTable.participants), activeState.sceneTable.participants);
  return {
    characters: {
      entities,
      order: order.filter((id) => Boolean(entities[id])),
      selectedId: activeState.characters.selectedId,
      updatedAt: activeState.characters.updatedAt
    },
    participants,
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

function toGameDocument(value: GameDocument | PersistedState | LegacyPersistedState): GameDocument {
  return isGameDocument(value) ? value : createGameDocument(normalizeStoredState(value));
}

function normalizeStoredState(value: PersistedState | LegacyPersistedState): PersistedState {
  if ('game' in value) {
    return value;
  }
  return {
    schemaVersion: 4,
    game: value.campaign,
    characters: value.characters,
    encounter: value.encounter,
    rollLog: value.rollLog,
    feed: value.feed,
    ui: value.ui,
    sceneTable: value.sceneTable
  };
}

function isProjectDocument(value: unknown): value is ProjectDocument {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'daggerheart-play:project' &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { shared?: unknown }).shared === 'object' &&
    typeof (value as { games?: unknown }).games === 'object'
  );
}

function isLegacyGameDocumentLibrary(value: unknown): value is LegacyGameDocumentLibrary {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'daggerheart-play:game-library' &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { games?: unknown }).games === 'object' &&
    Array.isArray((value as { order?: unknown }).order)
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function readLegacyDocument(storage: typeof LEGACY_GAME_DOCUMENT_STORAGES[number]): Promise<GameDocument | PersistedState | LegacyPersistedState | null> {
  if (!(await Dexie.exists(storage.dbName))) {
    return null;
  }
  const legacyDb = new Dexie(storage.dbName);
  legacyDb.version(1).stores({ [storage.storeName]: '' });
  try {
    const value = await legacyDb.table(storage.storeName).get(storage.key) as GameDocument | PersistedState | LegacyPersistedState | undefined;
    return value ?? null;
  } catch {
    return null;
  } finally {
    legacyDb.close();
  }
}

async function deleteLegacyDocument(storage: typeof LEGACY_GAME_DOCUMENT_STORAGES[number]): Promise<void> {
  if (!(await Dexie.exists(storage.dbName))) {
    return;
  }
  const legacyDb = new Dexie(storage.dbName);
  legacyDb.version(1).stores({ [storage.storeName]: '' });
  try {
    await legacyDb.table(storage.storeName).delete(storage.key);
  } catch {
    // A failed cleanup should not block reading the migrated game.
  } finally {
    legacyDb.close();
  }
}
