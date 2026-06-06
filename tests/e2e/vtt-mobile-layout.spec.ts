import { expect, test } from '@playwright/test';
import { expectInsideViewport, expectNoOverlap, rect } from './layout-helpers';

test.describe('VTT detail composition', () => {
  test('desktop scene stays between activity feed and character panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/gm');

    const root = page.locator('.player-view--gm');
    const feed = page.locator('.player-left-rail');
    const scene = page.locator('.player-scene-stage');
    const panel = page.locator('.player-character-panel');

    await expect(root).toBeVisible();
    await expect(feed).toBeVisible();
    await expect(scene).toBeVisible();
    await expect(panel).toBeVisible();
    await expectInsideViewport(page, feed);
    await expectInsideViewport(page, scene);
    await expectInsideViewport(page, panel);
    expect((await rect(scene)).width).toBeGreaterThan(420);
  });

  test('desktop uses activity feed on the left and GM tools inside the right panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/gm');

    const feed = page.locator('.player-left-rail');
    const panel = page.locator('.player-character-panel');
    const gmDock = panel.locator('.player-roster-gm-dock');

    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(gmDock).toBeVisible();
    await gmDock.getByRole('button', { name: 'Раздатка' }).click();
    await expect(panel.getByRole('region', { name: 'Раздатка' })).toBeVisible();
    await expectNoOverlap(feed, panel);
  });
});

test.describe('mobile VTT composition', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps scene primary and switches activity feed as one exclusive layer', async ({ page }) => {
    await page.goto('/player/test-room');

    const root = page.locator('.player-view--player');
    const tabs = page.locator('.player-mobile-layer-tabs');
    const feed = page.locator('.player-left-rail');
    const scene = page.locator('.player-scene-stage');
    const sheet = page.locator('.player-character-panel');
    const dice = page.locator('.mini-dice-launcher');

    await expect(root).toBeVisible();
    await expect(scene).toBeVisible();
    await expectInsideViewport(page, tabs);
    await expectInsideViewport(page, dice);
    await tabs.getByRole('button', { name: 'Чат' }).click();
    await expect(root).toHaveClass(/player-view--mobile-feed/);
    await expectInsideViewport(page, feed);
    await tabs.getByRole('button', { name: 'Лист' }).click();
    await expect(root).toHaveClass(/player-view--mobile-sheet/);
    await expectInsideViewport(page, sheet);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('tools modal opens above player layers and closes cleanly', async ({ page }) => {
    await page.goto('/gm');

    await page.locator('.mini-dice-launcher__tools').click();
    const modal = page.locator('.player-tools-modal');
    await expect(modal).toBeVisible();
    await expectInsideViewport(page, modal);
    await modal.getByTitle('Закрыть').click();
    await expect(modal).toHaveCount(0);
  });

  test('GM tools mobile tabs expose character creation', async ({ page }) => {
    await page.goto('/gm');

    await page.locator('.mini-dice-launcher__tools').click();
    const modal = page.locator('.player-tools-modal');
    const mobileTabs = modal.locator('.player-tools-modal__mobile-tabs');
    const charactersTab = mobileTabs.getByRole('button', { name: 'Персонажи' });

    await expect(modal).toBeVisible();
    await expectInsideViewport(page, mobileTabs);
    await expect(charactersTab).toBeVisible();
    await expectInsideViewport(page, charactersTab);
    await charactersTab.click();
    await expect(modal.getByRole('button', { name: 'Создать героя' })).toBeVisible();
  });
});
