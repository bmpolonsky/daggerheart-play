import { browserRecoveryJournal, recoveryGameId, type RecoveryJournal, type RecoveryDraft } from '../core/persistence/recoveryJournal';
import {
  createGameDocumentStore,
  GameDocumentConflictError,
  type GameDocumentStore,
  type StoredGameSummary,
  type StoredWorldSummary,
  type WorldArchiveDocument,
  worldAssetUsageCounts
} from '../core/persistence/gameDocumentStore';
import { applyBrowserCustomContent, loadBrowserCustomContent, readBrowserCustomContent, subscribeCustomContentChanges } from '../core/persistence/browserProjectContent';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../domain/p2p/sessionLinks';
import { forkGameDocument, createGameDocument, emptyCustomContent, isGameDocument, gameDocumentCustomContent, gameDocumentToPersistedState } from '../domain/game/gameDocument';
import type { GameDocument } from '../domain/game/gameDocument';
import { createGameState, createEncounterState, createSceneTableState, createUiState } from '../domain/rules/factories';
import { resetAllStores, subscribeToSyncedGameStores } from '../stores/gameStores';
import { CURRENT_PERSISTED_STATE_VERSION, migratePersistedState } from '../domain/migrations/persistedState';
import { hydratePersistedState, isPersistedState, snapshotPersistedState } from '../stores/persistedState';
import type { PersistedState } from '../domain/rules/types';
import type { AssetService } from './AssetService';
import { Store } from '../core/store/Store';
import { readActiveSession, readWorkspaceRole } from './p2p/P2PSessionPersistence';
import { reportOperationalError } from '../core/observability/sentry';
import { toastService } from './ToastService';
import { unsavedGameContentSignature } from '../domain/game/unsavedGameContent';

const LOCAL_STORAGE_SNAPSHOT_KEYS = ['daggerheart-play:v3:game:local'];
const AUTO_PERSIST_DELAY_MS = 500;
const PERSISTENCE_LOCK_NAME = 'daggerheart-play:game-document';

export class PersistenceService {
  private storedGamesStore = new Store<StoredGameSummary[]>([]);
  readonly storedGames$ = this.storedGamesStore.toStream();
  private storedWorldsStore = new Store<StoredWorldSummary[]>([]);
  readonly storedWorlds$ = this.storedWorldsStore.toStream();

  private recoveryDraftsStore = new Store<RecoveryDraft[]>([]);
  readonly recoveryDrafts$ = this.recoveryDraftsStore.toStream();
  private recoveryErrorToastId: string | null = null;
  private recoveryOperations = new Map<string, Promise<boolean>>();
  private started = false;
  private unsubscribeCallbacks: Array<() => void> = [];
  private unsubscribeDocumentChanges: (() => void) | null = null;
  private documentStore: GameDocumentStore | null;
  private readyPromise: Promise<void> = Promise.resolve();
  private isApplyingStoredDocument = false;
  private lastDocumentSignature: string | null = null;
  private lastSavedContentSignature: string | null = null;
  private lastObservedContentSignature: string | null = null;
  private inFlightContentSignature: string | null = null;
  private ownPersistSignatures = new Set<string>();
  private persistTimer: number | undefined;
  private queuedPersistSnapshot: { state: ReturnType<typeof snapshotPersistedState>; revision: number } | null = null;
  private persistQueuePromise: Promise<void> | null = null;
  private changeRevision = 0;
  private persistedRevision = 0;
  private persistError: Error | null = null;
  private errorToastId: string | null = null;
  private guardPendingPersist = (event: BeforeUnloadEvent) => {
    const unsaved = this.hasUnsavedChanges();
    this.flushScheduledPersist();
    // Browsers do not await an async beforeunload/pagehide listener. A cancelled
    // navigation leaves the live document and its queued save intact.
    if (!unsaved) return;
    event.preventDefault();
    event.returnValue = '';
  };

  constructor(documentStore: GameDocumentStore | null = createGameDocumentStore(), private assetService?: AssetService, private recovery: RecoveryJournal | null = browserRecoveryJournal()) {
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
      this.recovery?.start();
      this.readyPromise = this.hydrateFromIndexedDb().then(() => {
        this.subscribeDocumentChanges();
        this.unsubscribeCallbacks = [
          ...subscribeToSyncedGameStores(key => this.schedulePersist(key)),
          subscribeCustomContentChanges('all', () => this.schedulePersist())
        ];
        window.addEventListener('pagehide', this.flushScheduledPersistOnHide);
        window.addEventListener('beforeunload', this.guardPendingPersist);
        void this.refreshRecoveryDrafts();
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
      window.removeEventListener('pagehide', this.flushScheduledPersistOnHide);
      window.removeEventListener('beforeunload', this.guardPendingPersist);
    }
    this.recovery?.stop();
    this.started = false;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  hasUnsavedChanges(): boolean {
    if (isRemotePlayerJoin() || this.changeRevision <= this.persistedRevision) return false;
    // A no-op store emission is not an unsaved edit. Do this comparison only
    // at the navigation boundary, rather than serializing on every drag frame.
    const customContent = readBrowserCustomContent();
    const current = unsavedGameContentSignature(createGameDocument(snapshotPersistedState(), customContent));
    if (current !== this.lastObservedContentSignature) return true;
    // Returning to an old baseline is not clean while an intermediate write
    // can still commit. It is clean only once stored content matches again.
    if (this.inFlightContentSignature && this.inFlightContentSignature !== current) return true;
    return Boolean(this.queuedPersistSnapshot && unsavedGameContentSignature(
      createGameDocument(this.queuedPersistSnapshot.state, customContent)
    ) !== current);
  }

  private flushScheduledPersistOnHide = () => this.flushScheduledPersist();

  persistNow(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (isRemotePlayerJoin()) {
      return;
    }
    const snapshot = snapshotPersistedState();
    if (!this.started) this.changeRevision += 1;
    // Hydration/no-op persistence is not an unsaved user edit. In particular,
    // a startup write waiting behind a lock must not create a revision-0 offer.
    if (this.hasUnsavedChanges()) this.captureRecovery();
    void this.queuePersist(snapshot);
  }

  resetEverything(): void {
    this.isApplyingStoredDocument = true;
    try { resetAllStores(); } finally { this.isApplyingStoredDocument = false; }
    if (typeof window !== 'undefined') window.clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    this.queuedPersistSnapshot = null;
    this.persistedRevision = this.changeRevision;
    this.clearPersistError();
    try { this.recovery?.clearOwn(); } catch { /* Primary reset still works. */ }
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
    await this.flushPersistNow();
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

  async refreshRecoveryDrafts(): Promise<void> {
    if (isRemotePlayerJoin()) { this.recoveryDraftsStore.set([]); return; }
    try {
      const drafts = await this.recovery?.pending() ?? [];
      if (!drafts.length) { this.recoveryDraftsStore.set([]); return; }
      const recovered = await this.recoveredWorlds();
      const stored = storedDocumentToGameDocument(await this.documentStore?.load());
      const signature = stored ? unsavedGameContentSignature(stored) : null;
      const pending = drafts.filter(draft => {
        if (!recovered.has(recoveryGameId(draft)) && signature !== unsavedGameContentSignature(draft.document)) return true;
        // A crash can occur after the transaction commits but before cleanup.
        // These exact game contents already exist durably; do not offer a stale duplicate.
        this.recovery?.removeUnchanged(draft);
        return false;
      });
      this.recoveryDraftsStore.set(pending);
    }
    catch { /* IndexedDB remains authoritative if recovery storage is blocked. */ }
  }

  restoreRecoveryDraft(id: string): Promise<boolean> {
    const active = this.recoveryOperations.get(id);
    if (active) return active;
    const operation = this.performRecovery(id).finally(() => this.recoveryOperations.delete(id));
    this.recoveryOperations.set(id, operation);
    return operation;
  }

  private async recoveredWorlds(): Promise<Map<string, string>> {
    const recovered = new Map<string, string>();
    if (!this.documentStore) return recovered;
    for (const world of await this.documentStore.listWorlds()) {
      const archive = await this.documentStore.exportWorld(world.id);
      for (const game of Object.values(archive?.world.games ?? {})) recovered.set(game.state.game.id, world.name);
    }
    return recovered;
  }

  private async performRecovery(id: string): Promise<boolean> {
    if (!this.documentStore || isRemotePlayerJoin()) return false;
    await this.flushPersistNow();
    // The same existing origin-wide lock as normal saves serializes recovery
    // requests from independent tabs. Recheck after waiting, never before it.
    return withPersistenceLockResult(async () => {
      const draft = await this.recovery?.inactive(id);
      if (!draft) { await this.refreshRecoveryDrafts(); return false; }
      const restoredId = recoveryGameId(draft);
      const recovered = await this.recoveredWorlds();
      const existing = recovered.get(restoredId);
      if (existing) {
        try { this.recovery?.removeUnchanged(draft); } catch { /* Durable marker prevents a duplicate fork. */ }
        this.recoveryDraftsStore.update(drafts => drafts.filter(item => item.id !== id));
        await this.refreshRecoveryDrafts();
        toastService.show(`Эта копия уже восстановлена в отдельном мире «${existing}».`, 'info', 8000);
        return true;
      }
      const suffix = ` — восстановленная копия (${new Date(draft.updatedAt).toLocaleString('ru-RU')})`;
      const document = forkGameDocument(draft.document, suffix);
      document.files['data/game.json'].id = restoredId;
      const names = new Set(await this.documentStore!.listWorlds().then(worlds => worlds.map(world => world.name)));
      const baseName = document.manifest.name;
      let number = 2;
      while (names.has(document.manifest.name)) {
        document.manifest.name = `${baseName} (${number++})`;
        document.files['manifest.json'].name = document.manifest.name;
        document.files['data/game.json'].name = document.manifest.name;
      }
      await this.documentStore!.createWorld(document, document.manifest.name);
      this.isApplyingStoredDocument = true;
      try {
        applyBrowserCustomContent(gameDocumentCustomContent(document));
        this.applyStoredDocument(document);
      } finally { this.isApplyingStoredDocument = false; }
      try { this.recovery?.removeUnchanged(draft); } catch { /* Marker survives interrupted cleanup. */ }
      this.recoveryDraftsStore.update(drafts => drafts.filter(item => item.id !== id));
      await this.refreshRecoveryDrafts();
      await this.refreshStoredWorlds();
      await this.refreshStoredGames();
      toastService.show(`Восстановлен отдельный мир «${document.manifest.name}». Исходный мир сохранён.`, 'success', 8000);
      return true;
    });
  }

  private captureRecovery(changed?: keyof PersistedState): void {
    try {
      if (!this.recovery) throw new Error('Recovery storage unavailable');
      this.recovery.writeSnapshot(snapshotPersistedState(), readBrowserCustomContent(), this.changeRevision, changed);
    } catch {
      if (this.hasUnsavedChanges() && !this.recoveryErrorToastId) this.recoveryErrorToastId = toastService.show(
        'Восстановительная копия последней правки недоступна. Не закрывайте вкладку, пока изменения не сохранятся.', 'error', 60_000);
    }
  }

  private schedulePersist(changed?: keyof PersistedState): void {
    if (this.isApplyingStoredDocument) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (isRemotePlayerJoin()) {
      return;
    }
    this.changeRevision += 1;
    this.captureRecovery(changed);
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
    if (!this.persistQueuePromise && this.hasUnsavedChanges()) this.persistNow();
    do {
      await this.persistQueuePromise;
      this.flushScheduledPersist();
    } while (this.persistQueuePromise || this.queuedPersistSnapshot);
    // Internal world/game transitions must not proceed after a failed save.
    if (this.persistError && this.hasUnsavedChanges()) throw this.persistError;
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
        this.setSavedContentBaseline(createGameDocument(snapshotPersistedState(), readBrowserCustomContent()));
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

  private async persistGameDocument(snapshot: ReturnType<typeof snapshotPersistedState>, revision: number): Promise<void> {
    if (!this.documentStore) {
      this.setPersistError(new Error('Не удалось сохранить изменения: локальное хранилище недоступно. Оставьте вкладку открытой.'));
      return;
    }
    const baseSignature = this.lastDocumentSignature;
    const baseContentSignature = this.lastSavedContentSignature;
    try {
      await loadBrowserCustomContent();
      const document = createGameDocument(snapshot, readBrowserCustomContent());
      const signature = stableJsonSignature(document);
      await withPersistenceLock(async () => {
        const current = storedDocumentToGameDocument(await this.documentStore?.load());
        this.lastObservedContentSignature = current
          ? unsavedGameContentSignature(current)
          : baseSignature === stableJsonSignature(null) ? this.lastSavedContentSignature : null;
        if (baseSignature !== null && stableJsonSignature(current) !== baseSignature
          && (!current || unsavedGameContentSignature(current) !== baseContentSignature)) {
          if (!this.hasUnsavedChanges()) return;
          throw new Error('Мир изменён в другой вкладке. Ваши изменения ещё не сохранены; оставьте эту вкладку открытой.');
        }
        this.ownPersistSignatures.add(signature);
        try {
          await this.documentStore?.save(document, current);
          this.lastDocumentSignature = signature;
          this.setSavedContentBaseline(document);
          this.persistedRevision = Math.max(this.persistedRevision, revision);
          this.clearPersistError();
          // Only the successfully committed revision may clear its own backup.
          // A newer synchronous edit must survive completion of this older write.
          try { this.recovery?.clearThrough(revision); } catch { /* Retain a redundant recovery copy. */ }
          if (this.recoveryErrorToastId) toastService.dismiss(this.recoveryErrorToastId);
          this.recoveryErrorToastId = null;
          void this.refreshStoredGames();
          void this.refreshStoredWorlds();
        } catch (error) {
          this.ownPersistSignatures.delete(signature);
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof GameDocumentConflictError) {
        // The active context/data changed between the preflight read and the
        // guarded write. Do not compare a reverted draft with a stale baseline.
        this.lastObservedContentSignature = null;
        try {
          const latest = storedDocumentToGameDocument(await this.documentStore.load());
          if (latest) this.lastObservedContentSignature = unsavedGameContentSignature(latest);
        } catch { /* Keep the conservative unknown baseline until a later read. */ }
      }
      reportOperationalError(error, {
        area: 'persistence',
        operation: 'persist-game-document',
        details: { schemaVersion: snapshot.schemaVersion }
      });
      console.warn('Failed to persist Daggerheart game to IndexedDB.', error);
      this.setPersistError(error instanceof Error && error.message.startsWith('Мир изменён')
        ? error
        : new Error('Не удалось записать изменения. Проверьте свободное место и оставьте вкладку открытой.'));
    }
  }

  private queuePersist(snapshot: ReturnType<typeof snapshotPersistedState>): Promise<void> {
    this.queuedPersistSnapshot = { state: snapshot, revision: this.changeRevision };
    return this.startPersistQueue();
  }

  private startPersistQueue(): Promise<void> {
    this.persistQueuePromise ??= this.drainPersistQueue().finally(() => {
      this.persistQueuePromise = null;
      if (this.queuedPersistSnapshot) void this.startPersistQueue();
    });
    return this.persistQueuePromise;
  }

  private async drainPersistQueue(): Promise<void> {
    while (this.queuedPersistSnapshot) {
      const snapshot = this.queuedPersistSnapshot;
      this.queuedPersistSnapshot = null;
      this.inFlightContentSignature = unsavedGameContentSignature(createGameDocument(snapshot.state, readBrowserCustomContent()));
      try { await this.persistGameDocument(snapshot.state, snapshot.revision); }
      finally { this.inFlightContentSignature = null; }
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
      this.lastObservedContentSignature = document ? unsavedGameContentSignature(document) : null;
      if (this.hasUnsavedChanges()) {
        if (document && unsavedGameContentSignature(document) === this.lastSavedContentSignature) {
          // Another tab's view-only selection is not a competing game edit.
          this.lastDocumentSignature = signature;
          return;
        }
        // Never overwrite an unsaved local edit with a newer tab's document,
        // and never overwrite that newer document with our stale snapshot.
        this.setPersistError(new Error('Мир изменён в другой вкладке. Ваши изменения ещё не сохранены; оставьте эту вкладку открытой.'));
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
          this.setSavedContentBaseline(createGameDocument(snapshotPersistedState(), readBrowserCustomContent()));
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

  private setPersistError(error: Error): void {
    if (this.persistError?.message !== error.message) {
      if (this.errorToastId) toastService.dismiss(this.errorToastId);
      this.errorToastId = toastService.show(`Изменения не сохранены. ${error.message}`, 'error', 60_000);
    }
    this.persistError = error;
  }

  private clearPersistError(): void {
    this.persistError = null;
    if (this.errorToastId) toastService.dismiss(this.errorToastId);
    this.errorToastId = null;
  }

  private setSavedContentBaseline(document: GameDocument): void {
    this.lastSavedContentSignature = unsavedGameContentSignature(document);
    this.lastObservedContentSignature = this.lastSavedContentSignature;
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
    // Hydration emits each store separately. Never journal a half-applied
    // old/new-world mixture while switching or restoring an existing context.
    const wasApplying = this.isApplyingStoredDocument;
    this.isApplyingStoredDocument = true;
    try {
      hydratePersistedState(gameDocumentToPersistedState(gameDocument));
      this.lastDocumentSignature = stableJsonSignature(gameDocument);
      this.setSavedContentBaseline(gameDocument);
    } finally { this.isApplyingStoredDocument = wasApplying; }
  }
}

async function withPersistenceLock(work: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(PERSISTENCE_LOCK_NAME, work);
    return;
  }
  await work();
}

async function withPersistenceLockResult<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(PERSISTENCE_LOCK_NAME, work);
  return work();
}

function stableJsonSignature(value: unknown): string {
  try {
    // The world store reconstructs objects with a different key order.
    // Its own save notification must not overwrite newer in-memory edits.
    return JSON.stringify(value, (_key, item) => (
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
        : item
    )) ?? 'undefined';
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
  // A remembered player room must not disable the explicit GM workspace in
  // this tab. readWorkspaceRole validates that choice against the saved session.
  return normalizedPath.endsWith('/game')
    && activeSession?.role === 'player'
    && readWorkspaceRole() !== 'gm';
}
