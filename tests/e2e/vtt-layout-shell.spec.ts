import { expect, test } from '@playwright/test';
import { expectNoOverlap, rect } from './layout-helpers';

test.describe('VTT layout shell contract', () => {
  test('desktop aligns left feed lane, scene, and right character panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/gm');

    const feed = page.locator('.player-left-rail');
    const scene = page.locator('.player-scene-stage');
    const panel = page.locator('.player-character-panel');
    const dice = page.locator('.mini-dice-launcher');

    await expect(feed).toBeVisible();
    await expect(scene).toBeVisible();
    await expect(panel).toBeVisible();

    const feedBox = await rect(feed);
    const sceneBox = await rect(scene);
    const panelBox = await rect(panel);

    expect(feedBox.x).toBeLessThan(panelBox.x);
    expect(sceneBox.width).toBeGreaterThan(420);
    expect(feedBox.height).toBeGreaterThan(500);
    expect(panelBox.height).toBeGreaterThan(500);
    await expectNoOverlap(feed, dice);
    await expectNoOverlap(panel, dice);
  });

  test('mobile tabs switch feed, scene, and sheet layers without document overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player/test-room');

    const root = page.locator('.player-view--player');
    const tabs = page.locator('.player-mobile-layer-tabs');
    const feedTab = tabs.getByRole('button', { name: 'Чат' });
    const sceneTab = tabs.getByRole('button', { name: 'Сцена' });
    const sheetTab = tabs.getByRole('button', { name: 'Лист' });

    await expect(root).toBeVisible();
    await expect(tabs).toBeVisible();
    await feedTab.click();
    await expect(root).toHaveClass(/player-view--mobile-feed/);
    await sheetTab.click();
    await expect(root).toHaveClass(/player-view--mobile-sheet/);
    await sceneTab.click();
    await expect(root).toHaveClass(/player-view--mobile-scene/);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });
});
