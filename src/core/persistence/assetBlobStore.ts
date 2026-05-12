import { ASSET_BLOB_STORAGE } from './storageKeys';
import { createKeyValueStore } from './keyValueStore';

export interface AssetBlobStore {
  get(id: string): Promise<Blob | null>;
  put(id: string, blob: Blob): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createAssetBlobStore(indexedDb: IDBFactory | undefined = globalThis.indexedDB): AssetBlobStore | null {
  const store = createKeyValueStore(ASSET_BLOB_STORAGE.dbName, ASSET_BLOB_STORAGE.storeName, indexedDb);
  if (!store) return null;
  return {
    get: (id) => store.get<Blob>(id),
    put: (id, blob) => store.put(id, blob),
    delete: (id) => store.delete(id)
  };
}
