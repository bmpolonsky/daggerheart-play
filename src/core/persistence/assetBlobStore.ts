import { ASSET_BLOB_STORAGE } from './storageKeys';
import { createKeyValueStore } from './keyValueStore';

export interface AssetBlobStore {
  get(id: string): Promise<Blob | null>;
  put(id: string, blob: Blob): Promise<void>;
  delete(id: string): Promise<void>;
}

interface StoredAssetBlob {
  bytes: ArrayBuffer;
  type: string;
}

export function createAssetBlobStore(indexedDb: IDBFactory | undefined = globalThis.indexedDB): AssetBlobStore | null {
  const store = createKeyValueStore(ASSET_BLOB_STORAGE.dbName, ASSET_BLOB_STORAGE.storeName, indexedDb);
  if (!store) return null;
  return {
    get: async (id) => {
      const value = await store.get<Blob | StoredAssetBlob>(id);
      if (!value) return null;
      if (value instanceof Blob) return value;
      if (isStoredAssetBlob(value)) return new Blob([value.bytes], { type: value.type });
      return null;
    },
    // WebKit can fail structured cloning Blob/File values into IndexedDB with
    // "Error preparing Blob/File data". ArrayBuffer is reliably cloneable in
    // all supported engines; the MIME type is restored when reading.
    put: async (id, blob) => store.put<StoredAssetBlob>(id, {
      bytes: await blob.arrayBuffer(),
      type: blob.type || 'application/octet-stream'
    }),
    delete: (id) => store.delete(id)
  };
}

function isStoredAssetBlob(value: unknown): value is StoredAssetBlob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredAssetBlob>;
  return candidate.bytes instanceof ArrayBuffer && typeof candidate.type === 'string';
}
