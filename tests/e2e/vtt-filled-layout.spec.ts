import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame, usesProvidedFilledGame } from './filled-game-helpers';
import { expectInsideHorizontalBounds, expectInsideViewport, expectNoOverlap, rect } from './layout-helpers';

test.describe('filled VTT layout regressions', () => {
  test.describe.configure({ timeout: 90_000 });

  test('keeps a populated scene usable on a 1024px laptop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openFilledGmGame(page);

    const root = page.locator('.player-view--gm');
    const board = page.locator('.player-scene-stage__board');
    const feed = page.getByLabel('Хроника игры');
    const panel = page.getByLabel('Инструменты сцены');

    await expect(root).not.toHaveClass(/player-view--activity-open/);
    await expect(root).toHaveClass(/player-view--panel-open/);
    await expect(panel).toBeVisible();
    await expect(feed).toHaveAttribute('aria-hidden', 'true');
    expect((await rect(board)).width).toBeGreaterThan(600);
    await expectNoOverlap(board, panel);
    if (usesProvidedFilledGame) {
      await expect.poll(() => page.locator('.player-token').count()).toBeGreaterThanOrEqual(6);
      await expect.poll(() => page.locator('.player-view__scene-image').evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');
    }
  });

  test('keeps the dice dock centered and the complete character sheet scrollable on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFilledGmGame(page);

    const dice = page.locator('.mini-dice-launcher');
    const quickDice = page.locator('.mini-dice-launcher__quick');
    const health = page.getByLabel('Хроника игры').getByRole('button', { name: /Открыть диагностику соединения/ });
    const diceBox = await rect(dice);
    const quickDiceBox = await rect(quickDice);
    expect(Math.abs(diceBox.x + diceBox.width / 2 - 720)).toBeLessThanOrEqual(1);
    expect(Math.abs(quickDiceBox.x + quickDiceBox.width / 2 - 720)).toBeLessThanOrEqual(1);
    await expect(health).toBeVisible();
    await expectNoOverlap(dice, health);
    await expect(page.getByLabel('Хроника игры')).toBeVisible();
    await expect(page.getByLabel('Инструменты сцены')).toBeVisible();
    if (usesProvidedFilledGame) {
      await expect.poll(() => page.locator('.player-token').count()).toBeGreaterThanOrEqual(6);
      await expect.poll(() => page.locator('.player-view__scene-image').evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');
    }

    const desktopRosterItem = page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first();
    await desktopRosterItem.click({ position: { x: 18, y: 28 } });
    const sheet = page.getByLabel('Персонаж игрока');
    const sectionRail = page.getByLabel('Разделы листа персонажа');
    await expect(sheet.locator('.player-sheet-section')).toHaveCount(6);
    const hopePips = sheet.getByRole('group', { name: 'Надежда', exact: true }).getByRole('button');
    await expect(hopePips).toHaveCount(6);
    await expect(hopePips.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(hopePips.last()).toHaveAttribute('aria-pressed', 'false');
    const hopeColors = await hopePips.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor));
    expect(hopeColors[0]).not.toBe(hopeColors.at(-1));
    await expect(sheet.getByRole('group', { name: 'Раны', exact: true }).getByRole('button')).toHaveCount(6);
    await expect(sheet.getByRole('group', { name: 'Стресс', exact: true }).getByRole('button')).toHaveCount(6);
    const desktopScroll = await sheet.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
    expect(desktopScroll.scroll).toBeGreaterThan(desktopScroll.client + 400);
    await sectionRail.getByRole('button', { name: 'Снаряжение' }).click();
    await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(600);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const mobileDice = page.locator('.mini-dice-launcher');
    const mobileHealth = page.getByLabel('Хроника игры').getByRole('button', { name: /Открыть диагностику соединения/ });
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Сцена' }).click();
    await expect(mobileDice).toBeVisible();
    await expect(mobileHealth).toBeHidden();
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();
    const mobileRosterItem = page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first();
    await mobileRosterItem.click({ position: { x: 18, y: 28 } });

    const mobileSheet = page.getByLabel('Персонаж игрока');
    const mobileRail = page.getByLabel('Разделы листа персонажа');
    await expect(mobileRail).toBeVisible();
    expect((await rect(mobileRail)).height).toBeGreaterThanOrEqual(36);
    await expect(mobileRail.getByRole('button')).toHaveCount(6);
    await expect(mobileRail.getByRole('button', { name: 'Снаряжение' })).toBeVisible();
    await expect(mobileSheet.locator('.player-sheet-section')).toHaveCount(6);
    await mobileRail.getByRole('button', { name: 'Снаряжение' }).click();
    await expect.poll(() => mobileSheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(600);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('keeps combat and compendium usable after opening populated details', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    const primaryNav = workspace.getByLabel('Разделы рабочего пространства');
    const body = workspace.getByLabel('Содержимое рабочего пространства');
    await primaryNav.getByRole('button', { name: 'Бой' }).click();
    expect((await rect(primaryNav)).height).toBeGreaterThanOrEqual(36);

    const combatCards = workspace.locator('.player-combat-card');
    await expect.poll(() => combatCards.count()).toBeGreaterThan(10);
    const firstCombatCard = combatCards.first();
    await firstCombatCard.locator('.player-combat-card__add').click();
    await firstCombatCard.locator('.player-combat-card__open').click();

    const combatSection = workspace.getByRole('region', { name: 'Бой' });
    const catalog = workspace.locator('.player-combat-catalog');
    const detail = workspace.locator('.player-combat-detail');
    const encounter = workspace.locator('.player-combat-encounter');
    await expect(catalog).toBeHidden();
    await expect(detail).toBeVisible();
    expect((await rect(detail)).height).toBeGreaterThanOrEqual(500);
    const combatScroll = await combatSection.evaluate((element) => ({ overflow: getComputedStyle(element).overflow }));
    const bodyScroll = await body.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
    expect(bodyScroll.scroll).toBeGreaterThan(bodyScroll.client);
    expect(combatScroll.overflow).not.toBe('hidden');
    await encounter.scrollIntoViewIfNeeded();
    await expectInsideViewport(page, encounter, 2);
    await workspace.getByRole('button', { name: 'Закрыть описание' }).click();
    await expect(catalog).toBeVisible();
    expect((await rect(catalog)).height).toBeGreaterThanOrEqual(640);

    await page.setViewportSize({ width: 390, height: 844 });
    await primaryNav.getByRole('button', { name: 'Справочник' }).click();
    const contextNav = workspace.getByLabel('Коллекции справочника');
    expect((await rect(primaryNav)).height).toBeGreaterThanOrEqual(36);
    expect((await rect(contextNav)).height).toBeGreaterThanOrEqual(48);
    const activePrimary = primaryNav.locator('button[aria-pressed="true"]');
    const activeContext = contextNav.locator('button[aria-pressed="true"]');
    await expectInsideHorizontalBounds(primaryNav, activePrimary);
    await expectInsideHorizontalBounds(contextNav, activeContext);
    await expectNoOverlap(activePrimary, activeContext);
    await expectNoOverlap(activeContext, body);

    const firstPrimary = primaryNav.getByRole('button', { name: 'Сцены' });
    const lastPrimary = primaryNav.getByRole('button', { name: 'Настройки' });
    await firstPrimary.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(primaryNav, firstPrimary);
    await lastPrimary.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(primaryNav, lastPrimary);
    const firstContext = contextNav.getByRole('button', { name: 'Правила' });
    const lastContext = contextNav.getByRole('button', { name: 'Звероформы' });
    await firstContext.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(contextNav, firstContext);
    await lastContext.scrollIntoViewIfNeeded();
    await expectInsideHorizontalBounds(contextNav, lastContext);

    const libraryCards = workspace.locator('.player-library-card');
    await expect.poll(() => libraryCards.count()).toBeGreaterThan(10);
    await libraryCards.first().click();
    const libraryList = workspace.locator('.player-library-list');
    const libraryDetail = workspace.locator('.player-library-detail');
    const libraryLayout = workspace.locator('.dh-list-detail-layout');
    await expect(libraryList).toBeHidden();
    await expect(libraryDetail).toBeVisible();
    const detailBox = await rect(libraryDetail);
    const layoutBox = await rect(libraryLayout);
    expect(detailBox.height).toBeGreaterThan(500);
    expect(Math.abs(detailBox.height - layoutBox.height)).toBeLessThanOrEqual(2);
    await workspace.getByRole('button', { name: 'Закрыть описание' }).click();
    await expect(libraryList).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('asks before removing a populated character and preserves it on cancel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByRole('button', { name: `Удалить персонажа ${filledCharacterName}` }).first().click();

    const confirmation = page.getByRole('dialog', { name: `Удалить персонажа «${filledCharacterName}»?` });
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('button', { name: 'Отмена' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Отмена' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: `Удалить персонажа ${filledCharacterName}` }).first()).toBeVisible();
  });

  test('uses a focused list to editor journey for populated characters on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    const roster = workspace.getByLabel('Ростер персонажей');
    const editor = workspace.getByLabel('Редактор персонажа');
    await expect(roster).toBeVisible();
    await expect(editor).toBeHidden();
    if (usesProvidedFilledGame) await expect(roster.locator('.player-tools-character-card')).toHaveCount(3);

    await roster.getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    await expect(roster).toBeHidden();
    await expect(editor).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Вернуться к ростеру персонажей' })).toBeVisible();
    expect((await rect(editor)).height).toBeGreaterThan(560);
    await expectInsideViewport(page, editor.getByLabel('Разделы листа персонажа'));

    await workspace.getByRole('button', { name: 'Вернуться к ростеру персонажей' }).click();
    await expect(roster).toBeVisible();
    await expect(editor).toBeHidden();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('opens adversary and environment sheets from the free area of their cards', async ({ page }) => {
    test.skip(!usesProvidedFilledGame, 'Requires the provided populated campaign.');
    await page.setViewportSize({ width: 1280, height: 860 });
    await openFilledGmGame(page);

    const adversaryCard = page.locator('.player-combat-tracker__entry').first();
    await adversaryCard.click({ position: { x: 12, y: 14 } });
    await expect(page.getByLabel('Противник мастера')).toBeVisible();
    await page.getByRole('button', { name: 'К ростеру' }).click();

    const environmentCard = page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: 'Заброшенная роща' });
    await environmentCard.click({ position: { x: 16, y: 24 } });
    await expect(page.getByLabel('Окружение мастера')).toBeVisible();
  });
});
