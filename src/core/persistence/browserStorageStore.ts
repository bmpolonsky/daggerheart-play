export type BrowserStorageSource = Storage | null | undefined | (() => Storage | null | undefined);
export type BrowserStorageUpdater<T extends object> = Partial<T> | ((current: T) => Partial<T>);

export interface BrowserStorageMigrationContext<T extends object> {
  storage: Storage;
  state: T;
  hasStoredState: boolean;
}

export interface BrowserStorageMigrationResult<T extends object> {
  state: T;
  migrated: boolean;
}

export interface BrowserStorageStoreOptions<T extends object> {
  key: string;
  storage: BrowserStorageSource;
  initialState: () => T;
  normalize?: (value: unknown) => T | null;
  migrate?: (context: BrowserStorageMigrationContext<T>) => BrowserStorageMigrationResult<T>;
}

export class BrowserStorageStore<T extends object> {
  private state: T;
  private loaded = false;
  private loadedStorage: Storage | null = null;

  constructor(private readonly options: BrowserStorageStoreOptions<T>) {
    this.state = options.initialState();
  }

  getState(): T {
    this.ensureLoaded();
    return this.state;
  }

  setState(next: T): T {
    this.ensureLoaded();
    this.state = next;
    this.persist();
    return this.state;
  }

  update(updater: BrowserStorageUpdater<T>): T {
    const current = this.getState();
    const patch = typeof updater === 'function' ? updater(current) : updater;
    return this.setState({ ...current, ...patch });
  }

  reload(): T {
    this.loaded = false;
    return this.getState();
  }

  private ensureLoaded(): void {
    const storage = this.resolveStorage();
    if (this.loaded && storage === this.loadedStorage) {
      return;
    }

    this.loadedStorage = storage;
    this.loaded = true;
    if (!storage) {
      this.state = this.options.initialState();
      return;
    }

    const loaded = this.read(storage);
    let state = loaded.state;
    let shouldPersist = false;
    if (this.options.migrate) {
      const migrated = this.options.migrate({
        storage,
        state,
        hasStoredState: loaded.hasStoredState
      });
      state = migrated.state;
      shouldPersist = migrated.migrated;
    }

    this.state = state;
    if (shouldPersist) {
      this.persist();
    }
  }

  private read(storage: Storage): { state: T; hasStoredState: boolean } {
    try {
      const raw = storage.getItem(this.options.key);
      if (!raw) {
        return { state: this.options.initialState(), hasStoredState: false };
      }
      const parsed = JSON.parse(raw) as unknown;
      const normalized = this.options.normalize ? this.options.normalize(parsed) : parsed as T;
      return { state: normalized ?? this.options.initialState(), hasStoredState: true };
    } catch {
      return { state: this.options.initialState(), hasStoredState: false };
    }
  }

  private persist(): void {
    const storage = this.resolveStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem(this.options.key, JSON.stringify(this.state));
    } catch {
      // Browser storage is local convenience state; callers should keep working without it.
    }
  }

  private resolveStorage(): Storage | null {
    try {
      const storage = typeof this.options.storage === 'function' ? this.options.storage() : this.options.storage;
      return storage ?? null;
    } catch {
      return null;
    }
  }
}
