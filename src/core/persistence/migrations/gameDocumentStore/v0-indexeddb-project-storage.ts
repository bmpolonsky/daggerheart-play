import Dexie from 'dexie';

const V0_GAME_DOCUMENT_STORAGES = [{
  dbName: 'daggerheart-play-game-project',
  storeName: 'documents',
  key: 'current-game-project'
}, {
  dbName: 'daggerheart-play',
  storeName: 'game-documents',
  key: 'local-game'
}] as const;

export async function readV0ProjectDocument(indexedDb: IDBFactory | undefined): Promise<unknown | null> {
  if (!indexedDb) {
    return null;
  }
  for (const storage of V0_GAME_DOCUMENT_STORAGES) {
    const value = await readV0Document(storage);
    if (value) return value;
  }
  return null;
}

export async function deleteV0ProjectDocuments(indexedDb: IDBFactory | undefined): Promise<void> {
  if (!indexedDb) {
    return;
  }
  for (const storage of V0_GAME_DOCUMENT_STORAGES) {
    await deleteV0Document(storage);
  }
}

async function readV0Document(storage: typeof V0_GAME_DOCUMENT_STORAGES[number]): Promise<unknown | null> {
  if (!(await Dexie.exists(storage.dbName))) {
    return null;
  }
  const db = new Dexie(storage.dbName);
  db.version(1).stores({ [storage.storeName]: '' });
  try {
    const value = await db.table(storage.storeName).get(storage.key) as unknown | undefined;
    return value ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function deleteV0Document(storage: typeof V0_GAME_DOCUMENT_STORAGES[number]): Promise<void> {
  if (!(await Dexie.exists(storage.dbName))) {
    return;
  }
  const db = new Dexie(storage.dbName);
  db.version(1).stores({ [storage.storeName]: '' });
  try {
    await db.table(storage.storeName).delete(storage.key);
  } catch {
    // A failed cleanup should not block reading the migrated game.
  } finally {
    db.close();
  }
}
