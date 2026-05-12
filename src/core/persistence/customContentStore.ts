import { CUSTOM_CONTENT_STORAGE } from './storageKeys';
import { createKeyValueStore } from './keyValueStore';

export function createCustomContentStore(indexedDb: IDBFactory | undefined = globalThis.indexedDB) {
  return createKeyValueStore(CUSTOM_CONTENT_STORAGE.dbName, CUSTOM_CONTENT_STORAGE.storeName, indexedDb);
}
