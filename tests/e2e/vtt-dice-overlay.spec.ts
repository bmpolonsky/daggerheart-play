import { expect, test, type Page } from '@playwright/test';
import { GAME_DOCUMENT_STORAGE } from '../../src/core/persistence/storageKeys';
import { expectInsideViewport } from './layout-helpers';

async function rollAction(page: Page): Promise<void> {
  await page.locator('.mini-dice-launcher__quick').click();
}

async function storedRollCount(page: Page): Promise<number> {
  return page.evaluate(async (storage) => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open(storage.dbName);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction(storage.storeName, 'readonly').objectStore(storage.storeName).get(storage.key);
      read.onerror = () => {
        db.close();
        reject(read.error ?? new Error('Failed to read game project document.'));
      };
      read.onsuccess = () => {
        const state = read.result as { rollLog?: unknown[]; files?: { 'data/roll-log.json'?: unknown[] } } | undefined;
        const rollLog = Array.isArray(state?.files?.['data/roll-log.json']) ? state.files['data/roll-log.json'] : state?.rollLog;
        db.close();
        resolve(Array.isArray(rollLog) ? rollLog.length : 0);
      };
    };
  }), GAME_DOCUMENT_STORAGE);
}

test.describe('duality dice overlay', () => {
  test('shows a cinematic dice moment and keeps idle dice off the scene', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/player/test-room');

    await expect(page.locator('.duality-dice-stage')).toHaveCount(0);
    await rollAction(page);
    const overlay = page.locator('.duality-dice-stage');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS('pointer-events', 'none');

    const box = await overlay.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(520);
    expect(box?.width).toBeLessThanOrEqual(860);
    expect(box?.height).toBeGreaterThanOrEqual(300);
    expect(box?.height).toBeLessThanOrEqual(560);
  });

  test('keeps the dice moment compact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player/test-room');

    await rollAction(page);
    const overlay = page.locator('.duality-dice-stage');
    await expect(overlay).toBeVisible();
    await expectInsideViewport(page, overlay);

    const box = await overlay.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(330);
    expect(box?.height).toBeLessThanOrEqual(240);
  });

  test('does not replay persisted player dice after async restore on reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/player/test-room');

    await page.locator('.mini-dice-launcher__quick').click();
    await expect(page.locator('.player-dice-overlay .duality-dice-stage')).toBeVisible();
    await expect.poll(() => storedRollCount(page)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.localStorage.getItem('daggerheart-play:v3:game:local'))).toBeNull();

    await page.reload();

    await expect(page.locator('.player-view--player')).toBeVisible();
    await expect(page.locator('.player-activity-event--roll')).toBeVisible();
    await expect(page.locator('.player-dice-overlay')).toHaveCount(0);
    await expect(page.locator('.player-activity-event.dh-is-rolling')).toHaveCount(0);
  });
});
