import Dexie, { liveQuery, type Table } from 'dexie';

export interface KeyValueDocumentStore {
  get<T = unknown>(key: string): Promise<T | null>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  subscribe<T = unknown>(key: string, listener: (value: T | null) => void): () => void;
}

export function createKeyValueStore(
  dbName: string,
  storeName: string,
  indexedDb: IDBFactory | undefined = globalThis.indexedDB
): KeyValueDocumentStore | null {
  if (!indexedDb) {
    return null;
  }
  return new BrowserKeyValueStore(dbName, storeName);
}

class BrowserKeyValueStore implements KeyValueDocumentStore {
  private readonly db: Dexie;
  private readonly table: Table<unknown, string>;

  constructor(dbName: string, storeName: string) {
    this.db = new Dexie(dbName);
    this.db.version(1).stores({ [storeName]: '' });
    this.table = this.db.table(storeName);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.table.get(key) as T | undefined;
    return value ?? null;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    await this.table.put(value, key);
  }

  async delete(key: string): Promise<void> {
    await this.table.delete(key);
  }

  subscribe<T = unknown>(key: string, listener: (value: T | null) => void): () => void {
    const subscription = liveQuery(() => this.get<T>(key)).subscribe({
      next: listener,
      error: () => undefined
    });
    return () => subscription.unsubscribe();
  }
}
