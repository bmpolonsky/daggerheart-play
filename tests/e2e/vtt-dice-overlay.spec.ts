import { expect, test, type Page } from '@playwright/test';
import { expectInsideViewport } from './layout-helpers';

async function rollAction(page: Page): Promise<void> {
  await page.locator('.mini-dice-launcher__quick').click();
  await page.locator('.mini-dice-launcher__roll').click();
}

test.describe('duality dice overlay', () => {
  test('shows a cinematic dice moment and keeps idle dice off the scene', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/player/test-room');

    await expect(page.locator('.polyhedral-dice-stage')).toHaveCount(0);
    await rollAction(page);
    const overlay = page.locator('.polyhedral-dice-stage');
    const board = page.locator('.player-scene-stage__board');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveCSS('pointer-events', 'none');

    const box = await overlay.boundingBox();
    const boardBox = await board.boundingBox();
    expect(box?.width).toBeCloseTo(boardBox?.width ?? 0, 0);
    expect(box?.height).toBeCloseTo(boardBox?.height ?? 0, 0);
  });

  test('uses the full token stage for the dice moment on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player/test-room');

    await rollAction(page);
    const overlay = page.locator('.polyhedral-dice-stage');
    const board = page.locator('.player-scene-stage__board');
    await expect(overlay).toBeVisible();
    await expectInsideViewport(page, overlay);

    const box = await overlay.boundingBox();
    const boardBox = await board.boundingBox();
    expect(box?.width).toBeCloseTo(boardBox?.width ?? 0, 0);
    expect(box?.height).toBeCloseTo(boardBox?.height ?? 0, 0);

    const canvases = page.locator('.polyhedral-dice-stage canvas');
    await expect(canvases.first()).toBeVisible();
    const canvasBoxes = await canvases.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
    expect(canvasBoxes.length).toBeGreaterThanOrEqual(1);
    canvasBoxes.forEach((canvasBox) => {
      expect(canvasBox.width).toBeGreaterThanOrEqual((boardBox?.width ?? 0) * 0.95);
      expect(canvasBox.height).toBeGreaterThanOrEqual((boardBox?.height ?? 0) * 0.95);
    });
  });

  test('does not replay transient player dice after reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/player/test-room');

    await rollAction(page);
    await expect(page.locator('.player-dice-overlay .polyhedral-dice-stage')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('daggerheart-play:v3:game:local'))).toBeNull();

    await page.reload();

    await expect(page.locator('.player-view--player')).toBeVisible();
    await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
    await expect(page.locator('.player-dice-overlay')).toHaveCount(0);
    await expect(page.locator('.player-activity-event.dh-is-rolling')).toHaveCount(0);
  });
});
