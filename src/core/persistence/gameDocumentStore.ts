import {
  createGameDocument,
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
import { loadBrowserCustomContent } from './browserProjectContent';

const PROJECT_DOCUMENT_VERSION = 2;
const WORLD_LIBRARY_VERSION = 1;
const WORLD_LIBRARY_LOCK_NAME = 'daggerheart-play:world-library';

export interface StoredGameSummary {
  id: string;
  worldId: string;
  name: string;
  updatedAt: string | null;
  active: boolean;
}

export interface StoredWorldSummary {
  id: string;
  name: string;
  updatedAt: string | null;
  gameCount: number;
  active: boolean;
  games: StoredGameSummary[];
}

export interface GameDocumentStore {
  load(): Promise<GameDocument | PersistedState | null>;
  save(document: GameDocument): Promise<void>;
  delete(): Promise<void>;
  list(): Promise<StoredGameSummary[]>;
  create(document: GameDocument): Promise<string>;
  remove(id: string, replacement?: GameDocument): Promise<GameDocument | PersistedState | null>;
  setActive(id: string): Promise<GameDocument | PersistedState | null>;
  listWorlds(): Promise<StoredWorldSummary[]>;
  createWorld(document: GameDocument, name?: string): Promise<string>;
  renameWorld(id: string, name: string): Promise<boolean>;
  removeWorld(id: string, replacement?: GameDocument): Promise<GameDocument | PersistedState | null>;
  setActiveWorld(id: string): Promise<GameDocument | PersistedState | null>;
  exportWorld(id?: string): Promise<WorldArchiveDocument | null>;
  importWorld(document: WorldArchiveDocument): Promise<string>;
  subscribe(listener: (document: GameDocument | PersistedState | null) => void): () => void;
}

export interface WorldLibraryDocument {
  kind: 'daggerheart-play:world-library';
  version: typeof WORLD_LIBRARY_VERSION;
  activeWorldId: string | null;
  order: string[];
  worlds: Record<string, StoredWorld>;
}

export interface StoredWorld {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  shared: {
    customContent: GameCustomContent;
    assets: SceneTableState['assets'];
  };
  activeGameId: string | null;
  order: string[];
  games: Record<string, WorldGameRecord>;
}

export interface WorldGameRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  state: WorldGameState;
}

export interface WorldGameState {
  game: PersistedState['game'];
  characters: PersistedState['characters'];
  encounter: PersistedState['encounter'];
  rollLog: PersistedState['rollLog'];
  feed: PersistedState['feed'];
  ui: PersistedState['ui'];
  sceneTable: Omit<SceneTableState, 'assets'>;
}

export interface WorldArchiveDocument {
  kind: 'daggerheart-play:world-archive';
  version: 1;
  exportedAt: string;
  world: StoredWorld;
}

export function worldAssetUsageCounts(world: Pick<StoredWorld, 'games'>): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (assetId: string | undefined) => {
    if (assetId) counts[assetId] = (counts[assetId] ?? 0) + 1;
  };
  for (const game of Object.values(world.games)) {
    for (const scene of Object.values(game.state.sceneTable.scenes)) {
      add(scene.backgroundAssetId);
      add(scene.music.assetId);
      for (const layer of scene.layers) add(layer.assetId);
    }
  }
  return counts;
}

// Previous storage shape, kept only for the existing migration steps.
export interface ProjectDocument {
  kind: 'daggerheart-play:project';
  version: typeof PROJECT_DOCUMENT_VERSION;
  project: { id: string; name: string; createdAt: string; updatedAt: string };
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
  return store ? new BrowserGameDocumentStore(store, indexedDb) : null;
}

export class BrowserGameDocumentStore implements GameDocumentStore {
  private migrationPromise: Promise<WorldLibraryDocument | null> | null = null;

  constructor(private readonly store: KeyValueDocumentStore, private readonly indexedDb: IDBFactory | undefined) {}

  async load(): Promise<GameDocument | null> {
    return activeDocument(await this.loadLibrary());
  }

  async save(document: GameDocument): Promise<void> {
    await this.mutateLibrary((library) => ({ library: upsertActiveGame(library, document), result: undefined }));
  }

  async delete(): Promise<void> {
    await this.mutateLibrary((library) => {
      const world = activeWorld(library);
      return { library: world?.activeGameId ? updateWorld(library, removeGame(world, world.activeGameId)) : null, result: undefined };
    });
  }

  async list(): Promise<StoredGameSummary[]> {
    const library = await this.loadLibrary();
    const world = activeWorld(library);
    if (!world) return [];
    return world.order.flatMap((id) => {
      const record = world.games[id];
      return record ? [{
        id: record.id,
        worldId: world.id,
        name: record.state.game.name,
        updatedAt: record.state.game.updatedAt || record.updatedAt || null,
        active: record.id === world.activeGameId
      }] : [];
    });
  }

  async create(document: GameDocument): Promise<string> {
    return await this.mutateLibrary((library) => {
      const world = activeWorld(library);
      if (!world) {
        const created = worldFromGameDocument(document);
        return {
          library: { ...library, activeWorldId: created.id, order: [created.id], worlds: { [created.id]: created } },
          result: created.activeGameId as string
        };
      }
      const id = createId('game');
      return { library: updateWorld(library, upsertGame(world, document, id, true, true)), result: id };
    });
  }

  async remove(id: string, replacement?: GameDocument): Promise<GameDocument | null> {
    return await this.mutateLibrary((library) => {
      const world = activeWorld(library);
      if (!world?.games[id]) return { library: null, result: activeDocument(library) };
      const removed = removeGame(world, id);
      const nextWorld = replacement && removed.order.length === 0
        ? upsertGame(removed, replacement, createId('game'), true, false)
        : removed;
      const next = updateWorld(library, nextWorld);
      return { library: next, result: activeDocument(next) };
    });
  }

  async setActive(id: string): Promise<GameDocument | null> {
    return await this.mutateLibrary((library) => {
      const world = activeWorld(library);
      if (!world?.games[id]) return { library: null, result: null };
      const next = updateWorld(library, { ...world, activeGameId: id });
      return { library: next, result: activeDocument(next) };
    });
  }

  async listWorlds(): Promise<StoredWorldSummary[]> {
    const library = await this.loadLibrary();
    return library.order.flatMap((id) => {
      const world = library.worlds[id];
      if (!world) return [];
      const active = id === library.activeWorldId;
      const games = world.order.flatMap((gameId) => {
        const record = world.games[gameId];
        return record ? [{
          id: record.id,
          worldId: world.id,
          name: record.state.game.name,
          updatedAt: record.state.game.updatedAt || record.updatedAt || null,
          active: active && record.id === world.activeGameId
        }] : [];
      });
      return [{ id, name: world.name, updatedAt: world.updatedAt || null, gameCount: games.length, active, games }];
    });
  }

  async createWorld(document: GameDocument, name?: string): Promise<string> {
    return await this.mutateLibrary((library) => {
      const world = worldFromGameDocument(document, name);
      return { library: {
        ...library,
        activeWorldId: world.id,
        order: [world.id, ...library.order],
        worlds: { ...library.worlds, [world.id]: world }
      }, result: world.id };
    });
  }

  async renameWorld(id: string, name: string): Promise<boolean> {
    return await this.mutateLibrary((library) => {
      const world = library.worlds[id];
      const nextName = name.trim();
      return !world || !nextName
        ? { library: null, result: false }
        : { library: updateWorld(library, { ...world, name: nextName, updatedAt: new Date().toISOString() }), result: true };
    });
  }

  async removeWorld(id: string, replacement?: GameDocument): Promise<GameDocument | null> {
    return await this.mutateLibrary((library) => {
      if (!library.worlds[id]) return { library: null, result: activeDocument(library) };
      const worlds = { ...library.worlds };
      delete worlds[id];
      const order = library.order.filter((worldId) => worldId !== id);
      let next: WorldLibraryDocument = {
        ...library,
        activeWorldId: library.activeWorldId === id ? order[0] ?? null : library.activeWorldId,
        order,
        worlds
      };
      if (replacement && order.length === 0) {
        const world = worldFromGameDocument(replacement);
        next = { ...next, activeWorldId: world.id, order: [world.id], worlds: { [world.id]: world } };
      }
      return { library: next, result: activeDocument(next) };
    });
  }

  async setActiveWorld(id: string): Promise<GameDocument | null> {
    return await this.mutateLibrary((library) => {
      if (!library.worlds[id]) return { library: null, result: null };
      const next = { ...library, activeWorldId: id };
      return { library: next, result: activeDocument(next) };
    });
  }

  async exportWorld(id?: string): Promise<WorldArchiveDocument | null> {
    const library = await this.loadLibrary();
    const world = id ? library.worlds[id] : activeWorld(library);
    return world ? { kind: 'daggerheart-play:world-archive', version: 1, exportedAt: new Date().toISOString(), world } : null;
  }

  async importWorld(document: WorldArchiveDocument): Promise<string> {
    if (!isWorldArchiveDocument(document)) throw new Error('Invalid world archive document.');
    return await this.mutateLibrary((library) => {
      const id = createId('world');
      const now = new Date().toISOString();
      const world = { ...document.world, id, createdAt: now, updatedAt: now };
      return {
        library: { ...library, activeWorldId: id, order: [id, ...library.order], worlds: { ...library.worlds, [id]: world } },
        result: id
      };
    });
  }

  subscribe(listener: (document: GameDocument | null) => void): () => void {
    return this.store.subscribe<unknown>(GAME_DOCUMENT_STORAGE.key, (value) => {
      try {
        listener(value ? activeDocument(libraryFromStored(value)) : null);
      } catch {
        listener(null);
      }
    });
  }

  private async loadLibrary(): Promise<WorldLibraryDocument> {
    const stored = await this.store.get<unknown>(GAME_DOCUMENT_STORAGE.key);
    if (stored) {
      try {
        let library = libraryFromStored(stored);
        if (!isWorldLibraryDocument(stored)) {
          library = await mergeLegacyBrowserContent(library);
          await this.saveLibrary(library);
        }
        return library;
      } catch {
        return emptyLibrary();
      }
    }
    return (await this.oneTimeMigratePreviousProject()) ?? emptyLibrary();
  }

  private oneTimeMigratePreviousProject(): Promise<WorldLibraryDocument | null> {
    this.migrationPromise ??= readPreviousProjectDocument(this.indexedDb).then(async (document) => {
      if (!document) return null;
      const library = await mergeLegacyBrowserContent(libraryFromStored(document));
      await this.saveLibrary(library);
      await deletePreviousProjectDocuments(this.indexedDb);
      return library;
    });
    return this.migrationPromise;
  }

  private async saveLibrary(library: WorldLibraryDocument): Promise<void> {
    if (!isWorldLibraryDocument(library)) throw new Error('Refusing to persist invalid world library document.');
    await this.store.put(GAME_DOCUMENT_STORAGE.key, library);
  }

  private async mutateLibrary<T>(mutate: (library: WorldLibraryDocument) => { library: WorldLibraryDocument | null; result: T }): Promise<T> {
    return await withWorldLibraryLock(async () => {
      const mutation = mutate(await this.loadLibrary());
      if (mutation.library) await this.saveLibrary(mutation.library);
      return mutation.result;
    });
  }
}

function emptyLibrary(): WorldLibraryDocument {
  return { kind: 'daggerheart-play:world-library', version: WORLD_LIBRARY_VERSION, activeWorldId: null, order: [], worlds: {} };
}

function libraryFromStored(value: unknown): WorldLibraryDocument {
  if (isWorldLibraryDocument(value)) return value;
  return libraryFromProject(prepareProjectDocument(value, { isProjectDocument, projectFromGameDocument, toGameDocument }));
}

export function prepareWorldLibraryDocument(value: unknown): WorldLibraryDocument {
  return libraryFromStored(value);
}

function libraryFromProject(project: ProjectDocument): WorldLibraryDocument {
  const worldId = project.project.id || createId('world');
  const activeRecord = project.activeGameId ? project.games[project.activeGameId] : null;
  const assets = Object.assign(
    {},
    ...project.order.map((id) => project.games[id]?.state.sceneTable.assets ?? {}),
    activeRecord?.state.sceneTable.assets ?? {}
  );
  const games = Object.fromEntries(project.order.flatMap((id) => {
    const record = project.games[id];
    return record ? [[id, worldGameRecordFromLegacy(record, project.shared)]] : [];
  }));
  const order = project.order.filter((id) => Boolean(games[id]));
  const world: StoredWorld = {
    id: worldId,
    name: project.project.name.trim() || activeRecord?.state.game.name.trim() || 'Мой мир',
    createdAt: project.project.createdAt,
    updatedAt: project.project.updatedAt,
    shared: { customContent: project.shared.customContent, assets },
    activeGameId: project.activeGameId && games[project.activeGameId] ? project.activeGameId : order[0] ?? null,
    order,
    games
  };
  return { kind: 'daggerheart-play:world-library', version: 1, activeWorldId: world.id, order: [world.id], worlds: { [world.id]: world } };
}

function worldGameRecordFromLegacy(record: ProjectGameRecord, shared: ProjectDocument['shared']): WorldGameRecord {
  const { assets: _assets, ...sceneTable } = record.state.sceneTable;
  return {
    ...record,
    state: {
      game: record.state.game,
      characters: shared.characters,
      encounter: record.state.encounter,
      rollLog: record.state.rollLog,
      feed: record.state.feed,
      ui: record.state.ui,
      sceneTable: { ...sceneTable, participants: shared.participants }
    }
  };
}

function projectFromGameDocument(document: GameDocument): ProjectDocument {
  const state = gameDocumentToPersistedState(document);
  const now = document.manifest.updatedAt || state.game.updatedAt || new Date().toISOString();
  const gameId = createId('game');
  return {
    kind: 'daggerheart-play:project',
    version: 2,
    project: { id: createId('project'), name: '', createdAt: now, updatedAt: now },
    shared: { characters: state.characters, participants: state.sceneTable.participants, customContent: gameDocumentCustomContent(document) },
    activeGameId: gameId,
    order: [gameId],
    games: { [gameId]: projectGameRecordFromState(gameId, state) }
  };
}

function worldFromGameDocument(document: GameDocument, name?: string): StoredWorld {
  const state = gameDocumentToPersistedState(document);
  const now = document.manifest.updatedAt || state.game.updatedAt || new Date().toISOString();
  const id = createId('world');
  const gameId = createId('game');
  return {
    id,
    name: name?.trim() || state.game.name.trim() || 'Новый мир',
    createdAt: now,
    updatedAt: now,
    shared: sharedFromState(state, gameDocumentCustomContent(document)),
    activeGameId: gameId,
    order: [gameId],
    games: { [gameId]: worldGameRecordFromState(gameId, state) }
  };
}

function upsertActiveGame(library: WorldLibraryDocument, document: GameDocument): WorldLibraryDocument {
  const world = activeWorld(library);
  if (!world) {
    const created = worldFromGameDocument(document);
    return { ...library, activeWorldId: created.id, order: [created.id], worlds: { [created.id]: created } };
  }
  const gameId = world.activeGameId && world.games[world.activeGameId] ? world.activeGameId : createId('game');
  return updateWorld(library, upsertGame(world, document, gameId, true, false));
}

function upsertGame(world: StoredWorld, document: GameDocument, id: string, makeActive: boolean, mergeShared: boolean): StoredWorld {
  const state = gameDocumentToPersistedState(document);
  const record = worldGameRecordFromState(id, state, world.games[id]);
  const incomingShared = sharedFromState(state, gameDocumentCustomContent(document));
  return {
    ...world,
    updatedAt: record.updatedAt,
    shared: mergeShared ? mergeWorldShared(world.shared, incomingShared) : incomingShared,
    activeGameId: makeActive ? id : world.activeGameId,
    order: world.order.includes(id) ? world.order : [id, ...world.order],
    games: { ...world.games, [id]: record }
  };
}

function updateWorld(library: WorldLibraryDocument, world: StoredWorld): WorldLibraryDocument {
  return { ...library, worlds: { ...library.worlds, [world.id]: world } };
}

function removeGame(world: StoredWorld, id: string): StoredWorld {
  const games = { ...world.games };
  delete games[id];
  const order = world.order.filter((gameId) => gameId !== id);
  return {
    ...world,
    updatedAt: new Date().toISOString(),
    activeGameId: world.activeGameId === id ? order[0] ?? null : world.activeGameId,
    order,
    games
  };
}

function activeWorld(library: WorldLibraryDocument): StoredWorld | null {
  return library.activeWorldId ? library.worlds[library.activeWorldId] ?? null : null;
}

function activeDocument(library: WorldLibraryDocument): GameDocument | null {
  const world = activeWorld(library);
  const record = world?.activeGameId ? world.games[world.activeGameId] : null;
  return world && record ? createGameDocument(composePersistedState(world, record), world.shared.customContent) : null;
}

function composePersistedState(world: StoredWorld, record: WorldGameRecord): PersistedState {
  return {
    schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
    game: record.state.game,
    characters: record.state.characters,
    encounter: record.state.encounter,
    rollLog: record.state.rollLog,
    feed: record.state.feed,
    ui: record.state.ui,
    sceneTable: { ...record.state.sceneTable, assets: world.shared.assets }
  };
}

function sharedFromState(state: PersistedState, customContent: GameCustomContent): StoredWorld['shared'] {
  return { customContent, assets: state.sceneTable.assets };
}

function mergeWorldShared(current: StoredWorld['shared'], incoming: StoredWorld['shared']): StoredWorld['shared'] {
  return { assets: { ...incoming.assets, ...current.assets }, customContent: mergeCustomContent(current.customContent, incoming.customContent) };
}

async function mergeLegacyBrowserContent(library: WorldLibraryDocument): Promise<WorldLibraryDocument> {
  const world = activeWorld(library);
  if (!world) return library;
  const browserContent = await loadBrowserCustomContent();
  return updateWorld(library, {
    ...world,
    shared: {
      ...world.shared,
      customContent: mergeCustomContent(browserContent, world.shared.customContent)
    }
  });
}

function mergeCustomContent(current: GameCustomContent, incoming: GameCustomContent): GameCustomContent {
  return {
    ancestries: mergeItems(current.ancestries, incoming.ancestries),
    communities: mergeItems(current.communities, incoming.communities),
    subclasses: mergeItems(current.subclasses, incoming.subclasses),
    domainCards: mergeItems(current.domainCards, incoming.domainCards),
    cardDomains: mergeItems(current.cardDomains, incoming.cardDomains),
    adversaries: mergeItems(current.adversaries, incoming.adversaries),
    environments: mergeItems(current.environments, incoming.environments),
    classes: mergeItems(current.classes, incoming.classes),
    equipment: mergeItems(current.equipment, incoming.equipment),
    beastforms: mergeItems(current.beastforms, incoming.beastforms)
  };
}

function mergeItems<T>(current: T[], incoming: T[]): T[] {
  const keys = new Set(current.map(itemKey));
  return [...current, ...incoming.filter((item) => {
    const key = itemKey(item);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

function itemKey(value: unknown): string {
  if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) return `id:${value.id}`;
  return `value:${JSON.stringify(value)}`;
}

function worldGameRecordFromState(id: string, state: PersistedState, previous?: Pick<WorldGameRecord, 'createdAt'>): WorldGameRecord {
  const updatedAt = state.game.updatedAt || state.sceneTable.updatedAt || new Date().toISOString();
  return {
    id,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    state: {
      game: state.game,
      characters: state.characters,
      encounter: state.encounter,
      rollLog: state.rollLog,
      feed: state.feed,
      ui: state.ui,
      sceneTable: stripAssets(state.sceneTable)
    }
  };
}

function projectGameRecordFromState(id: string, state: PersistedState): ProjectGameRecord {
  const updatedAt = state.game.updatedAt || state.sceneTable.updatedAt || new Date().toISOString();
  const { participants: _participants, ...sceneTable } = state.sceneTable;
  return { id, createdAt: updatedAt, updatedAt, state: { game: state.game, encounter: state.encounter, rollLog: state.rollLog, feed: state.feed, ui: state.ui, sceneTable } };
}

function stripAssets(sceneTable: SceneTableState): Omit<SceneTableState, 'assets'> {
  const { assets: _assets, ...gameSceneTable } = sceneTable;
  return gameSceneTable;
}

function toGameDocument(value: unknown): GameDocument {
  return isGameDocument(value) ? value : createGameDocument(prepareStoredGameState(value));
}

export function isWorldArchiveDocument(value: unknown): value is WorldArchiveDocument {
  return Boolean(
    isRecord(value)
      && value.kind === 'daggerheart-play:world-archive'
      && value.version === 1
      && typeof value.exportedAt === 'string'
      && isStoredWorld(value.world)
      && value.world.order.length > 0
      && value.world.activeGameId
  );
}

export function isWorldLibraryDocument(value: unknown): value is WorldLibraryDocument {
  if (!isRecord(value) || value.kind !== 'daggerheart-play:world-library' || value.version !== WORLD_LIBRARY_VERSION) return false;
  if (!isRecord(value.worlds) || !Array.isArray(value.order)) return false;
  if (value.activeWorldId !== null && typeof value.activeWorldId !== 'string') return false;
  if (!validIndex(value.order, value.worlds, value.activeWorldId)) return false;
  return Object.entries(value.worlds).every(([id, world]) => isStoredWorld(world) && world.id === id);
}

function isStoredWorld(value: unknown): value is StoredWorld {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return false;
  if (!isRecord(value.shared) || !isCustomContent(value.shared.customContent) || !isRecord(value.shared.assets)) return false;
  if (!isRecord(value.games) || !Array.isArray(value.order)) return false;
  if (value.activeGameId !== null && typeof value.activeGameId !== 'string') return false;
  if (!validIndex(value.order, value.games, value.activeGameId)) return false;
  return Object.entries(value.games).every(([id, record]) => isWorldGameRecord(id, record));
}

function validIndex(order: unknown[], records: Record<string, unknown>, activeId: unknown): boolean {
  if (!order.every((id) => typeof id === 'string' && Boolean(records[id]))) return false;
  if (new Set(order).size !== order.length) return false;
  const ids = Object.keys(records);
  if (ids.some((id) => !order.includes(id))) return false;
  return ids.length === 0 ? activeId === null : typeof activeId === 'string' && Boolean(records[activeId]);
}

let worldLibraryMutationQueue = Promise.resolve();

async function withWorldLibraryLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request(WORLD_LIBRARY_LOCK_NAME, work);
  }
  const previous = worldLibraryMutationQueue;
  let release: () => void = () => undefined;
  worldLibraryMutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

function isWorldGameRecord(id: string, value: unknown): value is WorldGameRecord {
  return Boolean(isRecord(value) && value.id === id && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string' && isWorldGameState(value.state));
}

function isWorldGameState(value: unknown): value is WorldGameState {
  return Boolean(
    isRecord(value) && isRecord(value.game) && isRecord(value.characters) && isRecord(value.encounter) &&
    Array.isArray(value.rollLog) && Array.isArray(value.feed) && isRecord(value.ui) && isRecord(value.sceneTable) &&
    isRecord(value.sceneTable.participants) && isRecord(value.sceneTable.scenes) && Array.isArray(value.sceneTable.sceneOrder)
  );
}

export function isProjectDocument(value: unknown): value is ProjectDocument {
  if (!isRecord(value) || value.kind !== 'daggerheart-play:project' || value.version !== PROJECT_DOCUMENT_VERSION) return false;
  if (!isRecord(value.project) || !isRecord(value.shared) || !isRecord(value.games) || !Array.isArray(value.order)) return false;
  if (!isRecord(value.shared.characters) || !isRecord(value.shared.participants) || !isCustomContent(value.shared.customContent)) return false;
  if (value.activeGameId !== null && typeof value.activeGameId !== 'string') return false;
  if (!validIndex(value.order, value.games, value.activeGameId)) return false;
  return Object.entries(value.games).every(([id, game]) => isProjectGameRecord(id, game));
}

function isProjectGameRecord(id: string, value: unknown): value is ProjectGameRecord {
  return Boolean(isRecord(value) && value.id === id && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string' && isProjectGameState(value.state));
}

function isProjectGameState(value: unknown): value is ProjectGameState {
  return Boolean(
    isRecord(value) && isRecord(value.game) && isRecord(value.encounter) && Array.isArray(value.rollLog) &&
    Array.isArray(value.feed) && isRecord(value.ui) && isRecord(value.sceneTable) && isRecord(value.sceneTable.scenes) &&
    isRecord(value.sceneTable.assets) && Array.isArray(value.sceneTable.sceneOrder)
  );
}

function isCustomContent(value: unknown): value is GameCustomContent {
  return Boolean(
    isRecord(value) && Array.isArray(value.ancestries) && Array.isArray(value.communities) && Array.isArray(value.subclasses) &&
    Array.isArray(value.domainCards) && Array.isArray(value.cardDomains) && Array.isArray(value.adversaries) &&
    Array.isArray(value.environments) && Array.isArray(value.classes) && Array.isArray(value.equipment) && Array.isArray(value.beastforms)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
