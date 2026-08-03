import { createGameDocumentStore, type GameDocumentStore } from '../core/persistence/gameDocumentStore';
import { applyBrowserCustomContent, loadBrowserCustomContent, readBrowserCustomContent, subscribeCustomContentChanges } from '../core/persistence/browserProjectContent';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../domain/p2p/sessionLinks';
import { createGameDocument, isGameDocument, gameDocumentCustomContent, gameDocumentToPersistedState } from '../domain/game/gameDocument';
import type { GameDocument } from '../domain/game/gameDocument';
import { createGameState, createEncounterState, createSceneTableState, createUiState } from '../domain/rules/factories';
import { resetAllStores, subscribeToSyncedGameStores } from '../stores/gameStores';
import { CURRENT_PERSISTED_STATE_VERSION, migratePersistedState } from '../domain/migrations/persistedState';
import { hydratePersistedState, isPersistedState, snapshotPersistedState } from '../stores/persistedState';
import type { PersistedState } from '../domain/rules/types';
import type { StoredGameSummary } from '../core/persistence/gameDocumentStore';
import type { AssetService } from './AssetService';
import { Store } from '../core/store/Store';
import { readActiveSession } from './p2p/P2PSessionPersistence';

const LOCAL_STORAGE_SNAPSHOT_KEYS = ['daggerheart-play:v3:game:local'];

export class PersistenceService {
  private storedGamesStore = new Store<StoredGameSummary[]>([]);
  readonly storedGames$ = this.storedGamesStore.toStream();

  private started = false;
  private unsubscribeCallbacks: Array<() => void> = [];
  private unsubscribeDocumentChanges: (() => void) | null = null;
  private documentStore: GameDocumentStore | null;
  private readyPromise: Promise<void> = Promise.resolve();
  private isApplyingStoredDocument = false;
  private lastDocumentSignature: string | null = null;
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

  async createStoredGame(): Promise<string | null> {
    if (!this.documentStore) {
      return null;
    }
    await this.flushPersistNow();
    await loadBrowserCustomContent();
    const document = this.createEmptyGameDocumentFromProject();
    const id = await this.documentStore.create(document);
    this.applyStoredDocument(document);
    this.lastDocumentSignature = stableJsonSignature(document);
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
    this.applyStoredDocument(document);
    await loadBrowserCustomContent();
    return true;
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

  async removeStoredGame(id: string): Promise<boolean> {
    if (!this.documentStore) {
      return false;
    }
    await this.flushPersistNow();
    const wasActive = (await this.documentStore.list()).some((game) => game.id === id && game.active);
    const replacement = wasActive ? this.createEmptyGameDocumentFromProject() : undefined;
    const nextDocument = await this.documentStore.remove(id, replacement);
    if (wasActive) {
      if (nextDocument) {
        this.applyStoredDocument(nextDocument);
      } else {
        const document = replacement ?? this.createEmptyGameDocumentFromProject();
        await this.documentStore.create(document);
        this.applyStoredDocument(document);
      }
      await loadBrowserCustomContent();
    }
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
    this.persistNow();
  }

  private async flushPersistNow(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    await this.persistQueuePromise;
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
      await loadBrowserCustomContent();
      this.persistNow();
      return true;
    } catch (error) {
      console.warn('Failed to hydrate Daggerheart state from IndexedDB.', error);
      return false;
    }
  }

  private async persistGameDocument(snapshot: ReturnType<typeof snapshotPersistedState>): Promise<void> {
    if (!this.documentStore) {
      return;
    }
    try {
      await loadBrowserCustomContent();
      const document = createGameDocument(snapshot, readBrowserCustomContent());
      await this.documentStore.save(document);
      this.lastDocumentSignature = stableJsonSignature(document);
      void this.refreshStoredGames();
    } catch (error) {
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
      if (signature === this.lastDocumentSignature) {
        return;
      }
      this.lastDocumentSignature = signature;

      this.isApplyingStoredDocument = true;
      try {
        if (document) {
          this.applyStoredDocument(document);
        } else {
          resetAllStores();
        }
      } finally {
        this.isApplyingStoredDocument = false;
      }
      void loadBrowserCustomContent();
      void this.refreshStoredGames();
    });
  }

  private async deleteGameDocument(): Promise<void> {
    if (!this.documentStore) {
      return;
    }
    try {
      await this.documentStore.delete();
    } catch (error) {
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

  private createEmptyGameDocumentFromProject(): GameDocument {
    const current = snapshotPersistedState();
    const game = {
      ...createGameState(),
      gmName: current.game.gmName
    };
    return createGameDocument({
      schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
      game,
      characters: current.characters,
      encounter: createEncounterState(),
      rollLog: [],
      feed: [],
      ui: createUiState(),
      sceneTable: createSceneTableState({ participants: current.sceneTable.participants })
    }, readBrowserCustomContent());
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
