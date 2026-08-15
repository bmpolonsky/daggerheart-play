import { expect, test } from '@playwright/test';
import { openGmGame, openPlayerGame } from './game-route-helpers';
import { expectHiddenSurface, expectNoOverlap, rect } from './layout-helpers';
import { openGameLibrary } from './tools-helpers';

test.describe('VTT layout shell contract', () => {
  test('large tools open in a modal and return to the game', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    await openGameLibrary(page);
    const modal = page.getByRole('dialog', { name: 'Библиотека игры' });
    const close = modal.getByRole('button', { name: 'Закрыть библиотеку' });
    await expect(close).toBeVisible();

    const workspaceHeader = modal.locator('.player-tools-modal__header');
    const workspaceTabs = modal.getByLabel('Разделы библиотеки');
    const headerBox = await rect(workspaceHeader);
    const tabsBox = await rect(workspaceTabs);
    const closeBox = await rect(close);
    expect(headerBox.height).toBeLessThanOrEqual(60);
    expect(Math.abs((tabsBox.y + tabsBox.height / 2) - (closeBox.y + closeBox.height / 2))).toBeLessThanOrEqual(2);

    await close.click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByLabel('Чат игры')).toBeVisible();
    await expect(page).toHaveURL(/\/#\/game$/);
  });

  test('desktop starts with both side panels and collapses them independently', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const feed = page.getByLabel('Чат игры');
    const scene = page.getByLabel('Игровая сцена');
    const panel = page.getByLabel('Инструменты сцены');
    const panelShell = page.locator('.player-character-panel-shell');
    const dice = page.getByLabel('Бросок костей');
    const leftToggle = page.getByRole('button', { name: 'Скрыть чат' });
    const rightToggle = page.getByRole('button', { name: 'Скрыть панель мастера' });

    await expect(page.locator('.player-view--activity-open.player-view--panel-open')).toBeVisible();
    await expect(scene).toBeVisible();
    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();

    const feedBox = await rect(feed);
    const sceneBox = await rect(scene);
    const panelBox = await rect(panel);
    const leftToggleBox = await rect(leftToggle);
    const rightToggleBox = await rect(rightToggle);

    expect(feedBox.x).toBeLessThan(panelBox.x);
    expect(sceneBox.width).toBeGreaterThan(420);
    expect(feedBox.height).toBeGreaterThan(500);
    expect(panelBox.height).toBeGreaterThan(500);
    expect(leftToggleBox.y).toBeLessThan(100);
    expect(rightToggleBox.y).toBeLessThan(100);
    expect(Math.abs(leftToggleBox.y - feedBox.y)).toBeLessThanOrEqual(16);
    expect(Math.abs(rightToggleBox.y - (await rect(panelShell)).y)).toBeLessThanOrEqual(16);
    expect(Math.abs(leftToggleBox.x - (feedBox.x + feedBox.width) - 8)).toBeLessThanOrEqual(2);
    expect(Math.abs((await rect(panelShell)).x - (rightToggleBox.x + rightToggleBox.width) - 8)).toBeLessThanOrEqual(2);
    await expectNoOverlap(feed, dice);
    await expectNoOverlap(panel, dice);
    await expectNoOverlap(dice, page.locator('.p2p-health-indicator'));

    await expect(page.getByLabel('Чат игры').getByRole('button', { name: /Сетевая игра:/ })).toBeVisible();

    await leftToggle.click();
    await rightToggle.click();
    await expectHiddenSurface(feed);
    await expectHiddenSurface(panel);

    const collapsedLeftToggle = page.getByRole('button', { name: 'Открыть чат' });
    const collapsedRightToggle = page.getByRole('button', { name: 'Открыть панель мастера' });
    expect((await rect(collapsedLeftToggle)).y).toBeLessThan(100);
    expect((await rect(collapsedRightToggle)).y).toBeLessThan(100);
    await collapsedLeftToggle.click();
    await collapsedRightToggle.click();
    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();
  });

  test('compact desktop starts with one panel and keeps the scene practically usable', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openGmGame(page);

    const root = page.locator('.player-view--gm');
    const feed = page.getByLabel('Чат игры');
    const board = page.locator('.player-scene-stage__board');
    const panel = page.getByLabel('Инструменты сцены');
    const leftToggle = page.getByRole('button', { name: 'Открыть чат' });
    const rightToggle = page.getByRole('button', { name: 'Скрыть панель мастера' });

    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).toHaveClass(/player-view--panel-open/);
    await expect(page.getByLabel('Слой интерфейса')).toBeHidden();
    await expectHiddenSurface(feed);
    await expect(panel).toBeVisible();
    await expectNoOverlap(board, panel);
    expect((await rect(board)).width).toBeGreaterThan(600);
    expect((await rect(panel)).height).toBeGreaterThan(790);
    expect((await rect(leftToggle)).y).toBeLessThan(100);
    expect((await rect(rightToggle)).y).toBeLessThan(100);
    await expectNoOverlap(leftToggle, page.locator('.player-topbar'));
    await expectNoOverlap(rightToggle, page.locator('.player-topbar'));
    await expect(leftToggle.locator('.player-connection-status-dot')).toBeVisible();

    await leftToggle.click();
    await expect(feed).toBeVisible();
    await expect(panel).toBeVisible();
  });

  test('crossing the mobile breakpoint preserves the chosen desktop panel state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGmGame(page);

    const root = page.locator('.player-view--gm');
    const feed = page.getByLabel('Чат игры');
    const panel = page.getByLabel('Инструменты сцены');
    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).not.toHaveClass(/player-view--panel-open/);
    await expect(page.getByLabel('Слой интерфейса')).toBeVisible();
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Чат' }).click();
    await expect(root).toHaveClass(/player-view--mobile-feed/);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).not.toHaveClass(/player-view--panel-open/);
    await expect(page.getByLabel('Слой интерфейса')).toBeHidden();
    await expectHiddenSurface(feed);
    await expectHiddenSurface(panel);
    await page.getByRole('button', { name: 'Открыть панель мастера' }).click();
    await expect(panel).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).toHaveClass(/player-view--panel-open/);
    await expect(root).toHaveClass(/player-view--mobile-feed/);
    await expect(page.getByLabel('Слой интерфейса')).toBeVisible();
    await expect(feed).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.player-character-panel-a11y-guard')).toHaveAttribute('aria-hidden', 'true');

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).toHaveClass(/player-view--panel-open/);
    await expectHiddenSurface(feed);
    await expect(panel).toBeVisible();
  });

  test('player quick dice command stays centered despite the extra hand action', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlayerGame(page);

    const quickDiceBox = await rect(page.locator('.mini-dice-launcher__quick'));
    expect(Math.abs(quickDiceBox.x + quickDiceBox.width / 2 - 720)).toBeLessThanOrEqual(1);
  });

  test('mobile tabs switch feed, scene, and sheet layers without document overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlayerGame(page);

    const root = page.locator('.player-view--player');
    const tabs = page.getByLabel('Слой интерфейса');
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
