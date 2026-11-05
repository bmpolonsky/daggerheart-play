import type { Page } from '@playwright/test';
import type { WorldGameState } from '../../src/core/persistence/gameDocumentStore';

/** Read actual browser durability, not the rendered/optimistic state. */
export async function readStoredGameState(page: Page): Promise<WorldGameState> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const value: any = await new Promise((resolve, reject) => {
      const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    }); db.close();
    const world = value?.worlds?.[value.activeWorldId]; return world?.games?.[world.activeGameId]?.state;
  });
}

/** Decode the portrait referenced by the committed world, not an optimistic blob URL. */
export async function readStoredPortraitWidth(page: Page, characterId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const gameDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let assetId: string | undefined;
    try {
      const library = await new Promise<any>((resolve, reject) => {
        const request = gameDb.transaction('documents').objectStore('documents').get('current-game');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const world = library?.worlds?.[library.activeWorldId];
      const character = world?.games?.[world.activeGameId]?.state.characters.entities[id];
      assetId = /^asset:([a-zA-Z0-9_-]+)$/.exec(character?.portraitUrl ?? '')?.[1];
      if (!assetId || !world.shared.assets[assetId]) return 0;
    } finally { gameDb.close(); }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-assets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const value = await new Promise<Blob | { bytes: ArrayBuffer; type: string } | undefined>((resolve, reject) => {
        const request = db.transaction('assets').objectStore('assets').get(assetId!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!value) return 0;
      const url = URL.createObjectURL(value instanceof Blob ? value : new Blob([value.bytes], { type: value.type }));
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image.naturalWidth;
      } finally { URL.revokeObjectURL(url); }
    } finally { db.close(); }
  }, characterId);
}
