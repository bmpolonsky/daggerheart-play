export type BrowserStorageSource = Storage | null | undefined | (() => Storage | null | undefined);
export type BrowserStorageUpdater<T extends object> = Partial<T> | ((current: T) => Partial<T>);

export interface BrowserStorageLoadContext<T extends object> {
  storage: Storage;
  value: unknown;
  hasStoredState: boolean;
  initialState: T;
}

export interface BrowserStorageLoadResult<T extends object> {
  state: T;
  shouldPersist: boolean;
}

export interface BrowserStorageStoreOptions<T extends object> {
  key: string;
  storage: BrowserStorageSource;
  initialState: () => T;
  prepareLoadedState?: (context: BrowserStorageLoadContext<T>) => BrowserStorageLoadResult<T>;
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
    this.state = loaded.state;
    if (loaded.shouldPersist) {
      this.persist();
    }
  }

  private read(storage: Storage): BrowserStorageLoadResult<T> {
    const initialState = this.options.initialState();
    try {
      const raw = storage.getItem(this.options.key);
      const hasStoredState = Boolean(raw);
      const value = raw ? JSON.parse(raw) as unknown : null;
      if (this.options.prepareLoadedState) {
        return this.options.prepareLoadedState({ storage, value, hasStoredState, initialState });
      }
      if (!raw) {
        return { state: initialState, shouldPersist: false };
      }
      return { state: value as T, shouldPersist: false };
    } catch {
      return { state: initialState, shouldPersist: false };
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
