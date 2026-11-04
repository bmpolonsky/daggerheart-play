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
