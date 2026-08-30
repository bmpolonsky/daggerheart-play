import {
  createGameDocumentStore,
  type GameDocumentStore,
  type StoredGameSummary,
  type StoredWorldSummary,
  type WorldArchiveDocument,
  worldAssetUsageCounts
} from '../core/persistence/gameDocumentStore';
import { applyBrowserCustomContent, loadBrowserCustomContent, readBrowserCustomContent, subscribeCustomContentChanges } from '../core/persistence/browserProjectContent';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../domain/p2p/sessionLinks';
import { createGameDocument, emptyCustomContent, isGameDocument, gameDocumentCustomContent, gameDocumentToPersistedState } from '../domain/game/gameDocument';
import type { GameDocument } from '../domain/game/gameDocument';
import { createGameState, createEncounterState, createSceneTableState, createUiState } from '../domain/rules/factories';
import { resetAllStores, subscribeToSyncedGameStores } from '../stores/gameStores';
import { CURRENT_PERSISTED_STATE_VERSION, migratePersistedState } from '../domain/migrations/persistedState';
import { hydratePersistedState, isPersistedState, snapshotPersistedState } from '../stores/persistedState';
import type { PersistedState } from '../domain/rules/types';
import type { AssetService } from './AssetService';
import { Store } from '../core/store/Store';
import { readActiveSession } from './p2p/P2PSessionPersistence';
import { reportOperationalError } from '../core/observability/sentry';

const LOCAL_STORAGE_SNAPSHOT_KEYS = ['daggerheart-play:v3:game:local'];
const AUTO_PERSIST_DELAY_MS = 500;
const PERSISTENCE_LOCK_NAME = 'daggerheart-play:game-document';

export class PersistenceService {
  private storedGamesStore = new Store<StoredGameSummary[]>([]);
  readonly storedGames$ = this.storedGamesStore.toStream();
  private storedWorldsStore = new Store<StoredWorldSummary[]>([]);
  readonly storedWorlds$ = this.storedWorldsStore.toStream();

  private started = false;
  private unsubscribeCallbacks: Array<() => void> = [];
  private unsubscribeDocumentChanges: (() => void) | null = null;
  private documentStore: GameDocumentStore | null;
  private readyPromise: Promise<void> = Promise.resolve();
  private isApplyingStoredDocument = false;
  private lastDocumentSignature: string | null = null;
  private ownPersistSignatures = new Set<string>();
  private persistTimer: number | undefined;
  private queuedPersistSnapshot: ReturnType<typeof snapshotPersistedState> | null = null;
  private persistQueuePromise: Promise<void> | null = null;
  private flushPendingPersist = () => this.flushPersistNow();

  constructor(documentStore: GameDocumentStore | null = createGameDocumentStore(), private assetService?: AssetService) {
    this.documentStore = documentStore;
  }

  start(): void {
    if (this.started || typeof window === 'undefined') {
      return;
    }
    this.started = true;
    const remotePlayerJoin = isRemotePlayerJoin();
    if (!remotePlayerJoin) {
      this.clearLocalStorageSnapshots();
      this.readyPromise = this.hydrateFromIndexedDb().then(() => {
        this.subscribeDocumentChanges();
        this.unsubscribeCallbacks = [
          ...subscribeToSyncedGameStores(() => this.schedulePersist()),
          subscribeCustomContentChanges('all', () => this.schedulePersist())
        ];
        window.addEventListener('pagehide', this.flushPendingPersist);
        window.addEventListener('beforeunload', this.flushPendingPersist);
      });
    }
    if (remotePlayerJoin) {
      return;
    }
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribeCallbacks) {
      unsubscribe();
    }
    this.unsubscribeCallbacks = [];
    this.unsubscribeDocumentChanges?.();
    this.unsubscribeDocumentChanges = null;
    if (typeof window !== 'undefined') {
      this.flushScheduledPersist();
      window.removeEventListener('pagehide', this.flushPendingPersist);
      window.removeEventListener('beforeunload', this.flushPendingPersist);
    }
    this.started = false;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  persistNow(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (isRemotePlayerJoin()) {
      return;
    }
    const snapshot = snapshotPersistedState();
    void this.queuePersist(snapshot);
  }

  resetEverything(): void {
    resetAllStores();
    if (typeof window !== 'undefined') {
      this.clearLocalStorageSnapshots();
    }
    void this.deleteGameDocument();
  }

  async listStoredGames(): Promise<StoredGameSummary[]> {
    return this.documentStore?.list() ?? [];
  }

  async refreshStoredGames(): Promise<StoredGameSummary[]> {
    const games = await this.listStoredGames();
    this.storedGamesStore.set(games);
    return games;
  }

  async listStoredWorlds(): Promise<StoredWorldSummary[]> {
    return this.documentStore?.listWorlds() ?? [];
  }

  async refreshStoredWorlds(): Promise<StoredWorldSummary[]> {
    const worlds = await this.listStoredWorlds();
    this.storedWorldsStore.set(worlds);
    return worlds;
  }

  async createStoredGame(): Promise<string | null> {
    if (!this.documentStore) {
      return null;
    }
    await this.flushPersistNow();
    await loadBrowserCustomContent();
    const document = this.createEmptyGameDocument(false);
    const id = await this.documentStore.create(document);
    this.applyStoredDocument(document);
    this.lastDocumentSignature = stableJsonSignature(document);
    return id;
  }

  async createStoredWorld(name?: string): Promise<string | null> {
    if (!this.documentStore) return null;
    await this.flushPersistNow();
    const document = this.createEmptyGameDocument(true);
    const id = await this.documentStore.createWorld(document, name);
    this.applyStoredDocument(document);
    applyBrowserCustomContent(gameDocumentCustomContent(document));
    this.lastDocumentSignature = stableJsonSignature(document);
    await this.refreshStoredWorlds();
    await this.refreshStoredGames();
    return id;
  }

  async switchStoredGame(id: string): Promise<boolean> {
    if (!this.documentStore) {
      return false;
    }
    await this.flushPersistNow();
    const document = await this.documentStore.setActive(id);
    if (!document) {
      return false;
    }
    const gameDocument = storedDocumentToGameDocument(document);
    if (!gameDocument) return false;
    this.applyStoredDocument(gameDocument);
    applyBrowserCustomContent(gameDocumentCustomContent(gameDocument));
    return true;
  }

  async switchStoredWorld(id: string): Promise<boolean> {
    if (!this.documentStore) return false;
    await this.flushPersistNow();
    const document = await this.documentStore.setActiveWorld(id);
    if (!document) return false;
    const gameDocument = storedDocumentToGameDocument(document);
    if (!gameDocument) return false;
    this.applyStoredDocument(gameDocument);
    applyBrowserCustomContent(gameDocumentCustomContent(gameDocument));
    await this.refreshStoredWorlds();
    await this.refreshStoredGames();
    return true;
  }

  async renameStoredWorld(id: string, name: string): Promise<boolean> {
    const renamed = await this.documentStore?.renameWorld(id, name) ?? false;
    if (renamed) await this.refreshStoredWorlds();
    return renamed;
  }

  async importGameDocument(document: GameDocument, options: { asNewGame?: boolean } = {}): Promise<void> {
    await this.flushPersistNow();
    if (!this.documentStore || typeof window === 'undefined' || isRemotePlayerJoin()) {
      applyBrowserCustomContent(gameDocumentCustomContent(document));
      this.applyStoredDocument(document);
      return;
    }

    this.isApplyingStoredDocument = true;
    try {
      if (options.asNewGame) await this.documentStore.create(document);
      else await this.documentStore.save(document);
      const storedDocument = storedDocumentToGameDocument(await this.documentStore.load());
      const appliedDocument = storedDocument ?? document;
      applyBrowserCustomContent(gameDocumentCustomContent(appliedDocument));
      this.applyStoredDocument(appliedDocument);
      void this.refreshStoredGames();
    } finally {
      this.isApplyingStoredDocument = false;
    }
  }

  async importGameAsWorldDocument(document: GameDocument): Promise<void> {
    await this.flushPersistNow();
    if (!this.documentStore || typeof window === 'undefined' || isRemotePlayerJoin()) {
      await this.importGameDocument(document);
      return;
    }
    this.isApplyingStoredDocument = true;
    try {
      await this.documentStore.createWorld(document, document.manifest.name);
      applyBrowserCustomContent(gameDocumentCustomContent(document));
      this.applyStoredDocument(document);
      await this.refreshStoredWorlds();
      await this.refreshStoredGames();
    } finally {
      this.isApplyingStoredDocument = false;
    }
  }

  async exportWorldDocument(id?: string): Promise<WorldArchiveDocument | null> {
    await this.flushPersistNow();
    return this.documentStore?.exportWorld(id) ?? null;
  }

  async getWorldAssetUsageCounts(): Promise<Record<string, number>> {
    const worlds = await this.listStoredWorlds();
    const active = worlds.find((world) => world.active);
    if (!active) return {};
    const document = await this.exportWorldDocument(active.id);
    if (!document) return {};
    const counts = worldAssetUsageCounts(document.world);
    for (const world of worlds) {
      if (world.id === active.id) continue;
      const other = await this.exportWorldDocument(world.id);
      if (!other) continue;
      for (const assetId of Object.keys(other.world.shared.assets)) {
        if (document.world.shared.assets[assetId]) counts[assetId] = Math.max(1, counts[assetId] ?? 0);
      }
    }
    return counts;
  }

  async deleteUnusedWorldAsset(assetId: string): Promise<boolean> {
    const usages = await this.getWorldAssetUsageCounts();
    if (usages[assetId]) return false;
    await this.assetService?.deleteAsset(assetId);
    await this.flushPersistNow();
    return true;
  }

  async importWorldDocument(document: WorldArchiveDocument): Promise<void> {
    await this.flushPersistNow();
    if (!this.documentStore || typeof window === 'undefined' || isRemotePlayerJoin()) {
      const activeGameId = document.world.activeGameId;
      const game = activeGameId ? document.world.games[activeGameId] : null;
      if (game) {
        const imported = createGameDocument({
          schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
          ...game.state,
          sceneTable: { ...game.state.sceneTable, assets: document.world.shared.assets }
        }, document.world.shared.customContent);
        applyBrowserCustomContent(document.world.shared.customContent);
        this.applyStoredDocument(imported);
      }
      return;
    }
    this.isApplyingStoredDocument = true;
    try {
      await this.documentStore.importWorld(document);
      const stored = storedDocumentToGameDocument(await this.documentStore.load());
      if (!stored) throw new Error('Imported world has no active game.');
      applyBrowserCustomContent(gameDocumentCustomContent(stored));
      this.applyStoredDocument(stored);
      await this.refreshStoredWorlds();
      await this.refreshStoredGames();
    } finally {
      this.isApplyingStoredDocument = false;
    }
  }

  async removeStoredGame(id: string): Promise<boolean> {
    if (!this.documentStore) {
      return false;
    }
    await this.flushPersistNow();
    const wasActive = (await this.documentStore.list()).some((game) => game.id === id && game.active);
    const replacement = wasActive ? this.createEmptyGameDocument(false) : undefined;
    const nextDocument = await this.documentStore.remove(id, replacement);
    if (wasActive) {
      if (nextDocument) {
        this.applyStoredDocument(nextDocument);
      } else {
        const document = replacement ?? this.createEmptyGameDocument(false);
        await this.documentStore.create(document);
        this.applyStoredDocument(document);
      }
      if (nextDocument) {
        const gameDocument = storedDocumentToGameDocument(nextDocument);
        if (gameDocument) applyBrowserCustomContent(gameDocumentCustomContent(gameDocument));
      }
    }
    return true;
  }

  async removeStoredWorld(id: string): Promise<boolean> {
    if (!this.documentStore) return false;
    await this.flushPersistNow();
    const worlds = await this.documentStore.listWorlds();
    const removedWorld = await this.documentStore.exportWorld(id);
    const retainedAssetIds = new Set<string>();
    for (const world of worlds) {
      if (world.id === id) continue;
      const document = await this.documentStore.exportWorld(world.id);
      Object.keys(document?.world.shared.assets ?? {}).forEach((assetId) => retainedAssetIds.add(assetId));
    }
    const wasActive = worlds.some((world) => world.id === id && world.active);
    const replacement = worlds.length === 1 ? this.createEmptyGameDocument(true) : undefined;
    const next = await this.documentStore.removeWorld(id, replacement);
    if (wasActive && next) {
      const document = storedDocumentToGameDocument(next);
      if (document) {
        this.applyStoredDocument(document);
        applyBrowserCustomContent(gameDocumentCustomContent(document));
      }
    }
    for (const assetId of Object.keys(removedWorld?.world.shared.assets ?? {})) {
      if (!retainedAssetIds.has(assetId)) await this.assetService?.deleteAsset(assetId);
    }
    await this.refreshStoredWorlds();
    await this.refreshStoredGames();
    return true;
  }

  async getStoredGameSummary(): Promise<{ exists: boolean; name: string; updatedAt: string | null }> {
    if (!this.documentStore) {
      return { exists: false, name: '', updatedAt: null };
    }
    try {
      const games = await this.documentStore.list();
      const active = games.find((game) => game.active) ?? null;
      if (!active) {
        return { exists: false, name: '', updatedAt: null };
      }
      return {
        exists: true,
        name: active.name,
        updatedAt: active.updatedAt
      };
    } catch {
      return { exists: false, name: '', updatedAt: null };
    }
  }

  private schedulePersist(): void {
    if (this.isApplyingStoredDocument) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (isRemotePlayerJoin()) {
      return;
    }
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = undefined;
      this.persistNow();
    }, AUTO_PERSIST_DELAY_MS);
  }

  private async flushPersistNow(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    this.flushScheduledPersist();
    await this.persistQueuePromise;
  }

  private flushScheduledPersist(): void {
    if (this.persistTimer === undefined) return;
    window.clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    this.persistNow();
  }

  private async hydrateFromIndexedDb(): Promise<boolean> {
    if (!this.documentStore) {
      return false;
    }
    try {
      const state = await this.documentStore.load();
      const document = state ? storedDocumentToGameDocument(state) : null;
      if (!document) {
        await loadBrowserCustomContent();
        this.lastDocumentSignature = stableJsonSignature(null);
        return false;
      }
      this.lastDocumentSignature = stableJsonSignature(document);
      this.applyStoredDocument(document);
      await this.assetService?.normalizeEmbeddedSceneAssets();
      await this.assetService?.optimizeStoredImages();
      applyBrowserCustomContent(gameDocumentCustomContent(document));
      this.persistNow();
      return true;
    } catch (error) {
      reportOperationalError(error, { area: 'persistence', operation: 'hydrate-indexed-db' });
      console.warn('Failed to hydrate Daggerheart state from IndexedDB.', error);
      return false;
    }
  }

  private async persistGameDocument(snapshot: ReturnType<typeof snapshotPersistedState>): Promise<void> {
    if (!this.documentStore) {
      return;
    }
    const baseSignature = this.lastDocumentSignature;
    try {
      await loadBrowserCustomContent();
      const document = createGameDocument(snapshot, readBrowserCustomContent());
      const signature = stableJsonSignature(document);
      await withPersistenceLock(async () => {
        const current = storedDocumentToGameDocument(await this.documentStore?.load());
        if (baseSignature !== null && stableJsonSignature(current) !== baseSignature) return;
        this.ownPersistSignatures.add(signature);
        try {
          await this.documentStore?.save(document);
          this.lastDocumentSignature = signature;
          void this.refreshStoredGames();
          void this.refreshStoredWorlds();
        } catch (error) {
          this.ownPersistSignatures.delete(signature);
          throw error;
        }
      });
    } catch (error) {
      reportOperationalError(error, {
        area: 'persistence',
        operation: 'persist-game-document',
        details: { schemaVersion: snapshot.schemaVersion }
      });
      console.warn('Failed to persist Daggerheart game to IndexedDB.', error);
    }
  }

  private queuePersist(snapshot: ReturnType<typeof snapshotPersistedState>): Promise<void> {
    this.queuedPersistSnapshot = snapshot;
    this.persistQueuePromise ??= this.drainPersistQueue().finally(() => {
      this.persistQueuePromise = null;
    });
    return this.persistQueuePromise;
  }

  private async drainPersistQueue(): Promise<void> {
    while (this.queuedPersistSnapshot) {
      const snapshot = this.queuedPersistSnapshot;
      this.queuedPersistSnapshot = null;
      await this.persistGameDocument(snapshot);
    }
  }

  private subscribeDocumentChanges(): void {
    if (!this.documentStore || this.unsubscribeDocumentChanges) {
      return;
    }

    this.unsubscribeDocumentChanges = this.documentStore.subscribe((stored) => {
      const document = stored ? storedDocumentToGameDocument(stored) : null;
      const signature = stableJsonSignature(document);
      if (this.ownPersistSignatures.delete(signature)) {
        return;
      }
      if (signature === this.lastDocumentSignature) {
        return;
      }
      this.queuedPersistSnapshot = null;
      this.lastDocumentSignature = signature;

      this.isApplyingStoredDocument = true;
      try {
        if (document) {
          this.applyStoredDocument(document);
          applyBrowserCustomContent(gameDocumentCustomContent(document));
        } else {
          resetAllStores();
          applyBrowserCustomContent(emptyCustomContent());
        }
      } finally {
        this.isApplyingStoredDocument = false;
      }
      void this.refreshStoredGames();
      void this.refreshStoredWorlds();
    });
  }

  private async deleteGameDocument(): Promise<void> {
    if (!this.documentStore) {
      return;
    }
    try {
      await this.documentStore.delete();
    } catch (error) {
      reportOperationalError(error, { area: 'persistence', operation: 'delete-game-document' });
      console.warn('Failed to delete Daggerheart game from IndexedDB.', error);
    }
  }

  private clearLocalStorageSnapshots(): void {
    if (typeof window === 'undefined') return;
    for (const key of LOCAL_STORAGE_SNAPSHOT_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // localStorage is optional; IndexedDB is the game source.
      }
    }
  }

  private createEmptyGameDocument(newWorld: boolean): GameDocument {
    const current = snapshotPersistedState();
    const game = {
      ...createGameState(),
      gmName: current.game.gmName
    };
    return createGameDocument({
      schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
      game,
      characters: { entities: {}, order: [], selectedId: null, updatedAt: new Date().toISOString() },
      encounter: createEncounterState(),
      rollLog: [],
      feed: [],
      ui: createUiState(),
      sceneTable: createSceneTableState({ participants: {}, assets: newWorld ? {} : current.sceneTable.assets })
    }, newWorld ? undefined : readBrowserCustomContent());
  }

  private applyStoredDocument(document: GameDocument | PersistedState): void {
    const gameDocument = storedDocumentToGameDocument(document);
    if (!gameDocument) {
      resetAllStores();
      this.lastDocumentSignature = stableJsonSignature(null);
      return;
    }
    hydratePersistedState(gameDocumentToPersistedState(gameDocument));
    this.lastDocumentSignature = stableJsonSignature(gameDocument);
  }
}

async function withPersistenceLock(work: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(PERSISTENCE_LOCK_NAME, work);
    return;
  }
  await work();
}

function stableJsonSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return String(value);
  }
}

function storedDocumentToGameDocument(value: unknown) {
  if (isGameDocument(value)) {
    return value;
  }
  if (isPersistedState(value)) {
    return createGameDocument(migratePersistedState(value));
  }
  return null;
}

function isRemotePlayerJoin(): boolean {
  if (typeof window === 'undefined') return false;
  const location = (window as Window & { location?: Location }).location;
  const pathname = location?.pathname ?? '';
  if (parsePlayerSessionLocation(pathname, inferBasePathFromWorkspacePath(pathname), location?.hash ?? '')) {
    return true;
  }
  const hashPath = location?.hash?.replace(/^#/, '') ?? '';
  const normalizedPath = (hashPath.startsWith('/') ? hashPath : pathname).replace(/\/+$/, '') || '/';
  const activeSession = readActiveSession();
  return normalizedPath.endsWith('/game') && activeSession?.role === 'player';
}
