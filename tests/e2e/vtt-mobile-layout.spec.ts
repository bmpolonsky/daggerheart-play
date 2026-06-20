import { expect, test } from '@playwright/test';
import { openGmGame, openPlayerGame } from './game-route-helpers';
import { expectInsideViewport, expectNoOverlap, rect } from './layout-helpers';

test.describe('VTT detail composition', () => {
  test('desktop scene stays between activity feed and character panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const root = page.locator('.player-view--gm');
    const feed = page.getByLabel('Чат игры');
    const scene = page.getByLabel('Игровая сцена');
    const panel = page.getByLabel('Инструменты сцены');

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
    await openGmGame(page);

    const feed = page.getByLabel('Чат игры');
    const panel = page.getByLabel('Инструменты сцены');
    const gmDock = panel.getByLabel('Библиотека');

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
    await openPlayerGame(page);

    const root = page.locator('.player-view--player');
    const tabs = page.getByLabel('Слой интерфейса');
    const feed = page.getByLabel('Чат игры');
    const scene = page.getByLabel('Игровая сцена');
    const sheet = page.getByLabel('Персонаж игрока');
    const dice = page.getByLabel('Бросок костей');

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
    await openGmGame(page);

    await page.getByRole('button', { name: 'Библиотека' }).click();
    const modal = page.getByRole('dialog', { name: 'Библиотека' });
    await expect(modal).toBeVisible();
    await expectInsideViewport(page, modal);
    await modal.getByRole('button', { name: 'Закрыть' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('GM tools mobile tabs expose character creation', async ({ page }) => {
    await openGmGame(page);

    await page.getByRole('button', { name: 'Библиотека' }).click();
    const modal = page.getByRole('dialog', { name: 'Библиотека' });
    const mobileTabs = modal.getByRole('group', { name: 'Разделы библиотеки' });
    const charactersTab = mobileTabs.getByRole('button', { name: 'Персонажи' });

    await expect(modal).toBeVisible();
    await expect(mobileTabs).toBeVisible();
    await expectInsideViewport(page, mobileTabs);
    await expect(charactersTab).toBeVisible();
    await charactersTab.evaluate((button) => {
      button.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    await expectInsideViewport(page, charactersTab);
    await charactersTab.dispatchEvent('click');
    await expect(modal.getByRole('button', { name: 'Создать героя' })).toBeVisible();
  });
});
