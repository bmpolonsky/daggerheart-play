import { expect, test } from '@playwright/test';
import { openGmGame, openPlayerGame } from './game-route-helpers';
import { expectInsideHorizontalBounds, expectInsideViewport, expectNoOverlap, rect } from './layout-helpers';

test.describe('VTT detail composition', () => {
  test('desktop keeps the scene primary and overlays optional workspaces', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const root = page.locator('.player-view--gm');
    const feed = page.getByLabel('Хроника игры');
    const scene = page.getByLabel('Игровая сцена');
    const panel = page.getByLabel('Инструменты сцены');

    await expect(root).toBeVisible();
    await expect(scene).toBeVisible();
    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();
    await expectInsideViewport(page, feed);
    await expectInsideViewport(page, scene);
    await expectInsideViewport(page, panel);
    expect((await rect(scene)).width).toBeGreaterThan(420);
  });

  test('desktop uses activity feed on the left and GM tools inside the right panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const feed = page.getByLabel('Хроника игры');
    const panel = page.getByLabel('Инструменты сцены');
    const contextTabs = panel.getByLabel('Контекст мастера');

    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(contextTabs).toBeVisible();
    await contextTabs.getByRole('button', { name: 'Материалы' }).click();
    await expect(panel.getByRole('region', { name: 'Раздатка' })).toBeVisible();
    await expectNoOverlap(feed, panel);
  });
});

test.describe('mobile VTT composition', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('tapped Fear pip keeps its committed state without sticky hover', async ({ page }) => {
    await openGmGame(page);

    const fearTrack = page.getByLabel(/Страх \d+ из 12/).first();
    await expect(fearTrack).toHaveCSS('grid-template-areas', '"label pips value"');
    await fearTrack.getByRole('button', { name: 'Страх 3' }).tap();
    await expect(fearTrack).toContainText('3/12');
    const pips = fearTrack.getByRole('button');
    const colors = await pips.evaluateAll((buttons) => buttons.slice(0, 4).map((button) => getComputedStyle(button).backgroundColor));
    expect(colors[2]).toBe(colors[1]);
    expect(colors[2]).not.toBe(colors[3]);
    await expect(pips.nth(2)).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps scene primary and switches activity feed as one exclusive layer', async ({ page }) => {
    await openPlayerGame(page);

    const root = page.locator('.player-view--player');
    const tabs = page.getByLabel('Слой интерфейса');
    const feed = page.getByLabel('Хроника игры');
    const scene = page.getByLabel('Игровая сцена');
    const sheet = page.getByLabel('Персонаж игрока');
    const dice = page.getByLabel('Бросок костей');

    await expect(root).toBeVisible();
    await expect(scene).toBeVisible();
    await expectInsideViewport(page, tabs);
    await expectInsideViewport(page, dice);
    await tabs.getByRole('button', { name: 'Хроника' }).click();
    await expect(root).toHaveClass(/player-view--mobile-feed/);
    await expectInsideViewport(page, feed);
    await tabs.getByRole('button', { name: 'Лист' }).click();
    await expect(root).toHaveClass(/player-view--mobile-sheet/);
    await expectInsideViewport(page, sheet);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('tools modal opens above player layers and closes cleanly', async ({ page }) => {
    await openGmGame(page);

    await page.getByRole('button', { name: 'Инструменты' }).click();
    const modal = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await expect(modal).toBeVisible();
    await expectInsideViewport(page, modal);
    await modal.getByRole('button', { name: 'Закрыть' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('GM tools mobile tabs expose character creation', async ({ page }) => {
    await openGmGame(page);

    await page.getByRole('button', { name: 'Инструменты' }).click();
    const modal = page.getByRole('dialog', { name: 'Рабочее пространство' });
    const workspaceTabs = modal.getByRole('group', { name: 'Разделы рабочего пространства' });
    const charactersTab = workspaceTabs.getByRole('button', { name: 'Персонажи' });

    await expect(modal).toBeVisible();
    await expect(workspaceTabs).toBeVisible();
    await expectInsideViewport(page, workspaceTabs);
    await expect(charactersTab).toBeVisible();
    await charactersTab.click();
    await expect(modal.getByRole('button', { name: 'Создать героя' })).toBeVisible();
  });

  test('GM can reach both external tools while dialog focus stays trapped', async ({ page }) => {
    await openGmGame(page);

    await page.getByRole('button', { name: 'Инструменты' }).click();
    const modal = page.getByRole('dialog', { name: 'Рабочее пространство' });
    const workspaceTabs = modal.getByRole('group', { name: 'Разделы рабочего пространства' });
    const combatTool = workspaceTabs.getByRole('button', { name: 'Конструктор боя', exact: true });
    const cardTool = workspaceTabs.getByRole('button', { name: 'Редактор карт', exact: true });
    const visibleFocusable = modal.locator('button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [href]:visible, [tabindex]:not([tabindex="-1"]):visible');

    await combatTool.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(workspaceTabs, combatTool);

    await visibleFocusable.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(visibleFocusable.last()).toBeFocused();

    const combatPopupPromise = page.waitForEvent('popup');
    await combatTool.click();
    const combatPopup = await combatPopupPromise;
    await expect(combatPopup).toHaveURL(/\/tools\/combat$/);
    await combatPopup.close();

    await cardTool.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(workspaceTabs, cardTool);
    const cardPopupPromise = page.waitForEvent('popup');
    await cardTool.click();
    const cardPopup = await cardPopupPromise;
    await expect(cardPopup).toHaveURL(/\/tools\/cards$/);
    await cardPopup.close();
  });
});
