import { expect, test, type Locator } from '@playwright/test';
import { filledCharacterName, filledCharacterResources, filledEnvironmentName, openFilledGmGame } from './filled-game-helpers';
import { openPlayerGame } from './game-route-helpers';
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
    await expect(page.locator('.player-token')).toHaveCount(6);
    await expect.poll(() => page.locator('.player-view__scene-image').evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');
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
    await expect(page.locator('.player-token')).toHaveCount(6);
    await expect.poll(() => page.locator('.player-view__scene-image').evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');

    const desktopRosterItem = page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first();
    await desktopRosterItem.click({ position: { x: 18, y: 28 } });
    const sheet = page.getByLabel('Персонаж игрока');
    const sectionRail = page.getByLabel('Разделы листа персонажа');
    await expect(sheet.locator('.player-sheet-section')).toHaveCount(6);
    const hopePips = sheet.getByRole('group', { name: 'Надежда', exact: true }).getByRole('button');
    await expect(hopePips).toHaveCount(filledCharacterResources.hope.max);
    await expect(hopePips.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(hopePips.last()).toHaveAttribute('aria-pressed', 'false');
    const hopeColors = await hopePips.evaluateAll((buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor));
    expect(hopeColors[0]).not.toBe(hopeColors.at(-1));
    await expect(sheet.getByRole('group', { name: 'Раны', exact: true }).getByRole('button')).toHaveCount(filledCharacterResources.hp.max);
    await expect(sheet.getByRole('group', { name: 'Стресс', exact: true }).getByRole('button')).toHaveCount(filledCharacterResources.stress.max);
    const desktopDefenseRows = sheet.getByLabel('Защита').locator(':scope > div');
    await expect(desktopDefenseRows).toHaveCount(2);
    const desktopDefenseBoxes = await desktopDefenseRows.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { y: box.y, width: box.width, height: box.height };
    }));
    expect(desktopDefenseBoxes.every((box) => box.width > 130 && box.height <= 64)).toBe(true);
    expect(Math.abs(desktopDefenseBoxes[0].y - desktopDefenseBoxes[1].y)).toBeLessThanOrEqual(1);
    const desktopTraitCards = sheet.locator('.player-trait-grid .dh-choice-card');
    await expect(desktopTraitCards).toHaveCount(6);
    const desktopTraitBoxes = await desktopTraitCards.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { y: box.y, height: box.height };
    }));
    expect(Math.abs(desktopTraitBoxes[0].y - desktopTraitBoxes[2].y)).toBeLessThanOrEqual(1);
    expect(desktopTraitBoxes[3].y).toBeGreaterThan(desktopTraitBoxes[0].y + desktopTraitBoxes[0].height);
    const desktopScroll = await sheet.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
    expect(desktopScroll.scroll).toBeGreaterThan(desktopScroll.client + 400);
    await sectionRail.getByRole('button', { name: 'Карты' }).click();
    const domainCards = sheet.locator('.dh-list-item').filter({ hasText: 'Заклинание' });
    await expect(domainCards).toHaveCount(7);
    const scrollTopBeforeLastCard = await sheet.evaluate((element) => element.scrollTop);
    await domainCards.last().scrollIntoViewIfNeeded();
    await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollTopBeforeLastCard);
    expect(await domainCards.last().evaluate((element) => {
      const card = element.getBoundingClientRect();
      const container = element.closest('[aria-label="Персонаж игрока"]')?.getBoundingClientRect();
      return Boolean(container && card.top >= container.top && card.bottom <= container.bottom);
    })).toBe(true);
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
    const defense = mobileSheet.getByLabel('Защита');
    await defense.scrollIntoViewIfNeeded();
    const defenseRows = defense.locator(':scope > div');
    await expect(defenseRows).toHaveCount(2);
    const defenseBoxes = await defenseRows.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    expect(defenseBoxes.every((box) => box.width > 130 && box.height <= 64)).toBe(true);
    expect(Math.abs(defenseBoxes[0].y - defenseBoxes[1].y)).toBeLessThanOrEqual(1);

    const traitCards = mobileSheet.locator('.player-trait-grid .dh-choice-card');
    await expect(traitCards).toHaveCount(6);
    const traitBoxes = await traitCards.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
    expect(Math.abs(traitBoxes[0].y - traitBoxes[2].y)).toBeLessThanOrEqual(1);
    expect(traitBoxes[3].y).toBeGreaterThan(traitBoxes[0].y + traitBoxes[0].height);
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

  test('ranks compendium search results and opens the best match', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Справочник' }).click();
    await workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Правила' }).click();
    const search = workspace.getByLabel('Поиск по справочнику');
    const cards = workspace.locator('.player-library-card');

    await search.fill('Уяз');
    await expect(cards.first().locator('strong')).toHaveText('Уязвимость');
    await expect(cards.first()).toContainText(/Уязвим/i);
    await expect(workspace.getByLabel('Полная запись компендиума').getByRole('heading', { name: 'Уязвимость' })).toBeVisible();

    await search.fill('уязвимсоть');
    await expect(cards.first().locator('strong')).toHaveText('Уязвимость');
    await expect(workspace.getByLabel('Полная запись компендиума').getByRole('heading', { name: 'Уязвимость' })).toBeVisible();
  });

  test('uses the workspace scroll for an opened combat opponent on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    const primaryNav = workspace.getByLabel('Разделы рабочего пространства');
    const body = workspace.getByLabel('Содержимое рабочего пространства');
    await primaryNav.getByRole('button', { name: 'Бой' }).click();

    const combatCards = workspace.locator('.player-combat-card');
    await expect.poll(() => combatCards.count()).toBeGreaterThan(10);
    await combatCards.first().locator('.player-combat-card__open').click();

    const detail = workspace.locator('.player-combat-detail');
    const detailBody = detail.locator('.player-library-detail__body');
    const encounter = workspace.locator('.player-combat-encounter');
    await expect(detail).toBeVisible();
    expect((await rect(detail)).height).toBeGreaterThan(600);
    const [workspaceScroll, detailBodyScroll, encounterEntriesScroll] = await Promise.all([
      scrollState(body),
      scrollState(detailBody),
      scrollState(encounter.locator('.player-combat-entries'))
    ]);
    expect(workspaceScroll.scrollHeight).toBeGreaterThan(workspaceScroll.clientHeight + 400);
    expect(detailBodyScroll.overflowY).toBe('visible');
    expect(encounterEntriesScroll.overflowY).toBe('visible');

    const scrollTopBefore = await body.evaluate((element) => element.scrollTop);
    await detailBody.hover({ position: { x: 28, y: 300 } });
    await page.mouse.wheel(0, 1_000);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollTopBefore + 200);
    await encounter.scrollIntoViewIfNeeded();
    await expectInsideViewport(page, encounter, 2);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('keeps the player Tools → Compendium list and detail scroll owners stable on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlayerGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Справочник' }).click();
    const body = workspace.getByLabel('Содержимое рабочего пространства');
    const layout = workspace.locator('.dh-list-detail-layout');
    const list = workspace.locator('.player-library-list');
    const cards = list.locator('.player-library-card');
    await expect.poll(() => cards.count()).toBeGreaterThan(10);

    await list.evaluate((element) => element.scrollTo({ top: 220 }));
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    const desktopListScrollTop = await list.evaluate((element) => element.scrollTop);
    await expectStableGeometry([workspace, body, layout, list]);
    await cards.nth(await firstFullyVisibleIndex(cards)).click();
    const detail = workspace.locator('.player-library-detail');
    const detailBody = detail.locator('.player-library-detail__body');
    await expect(detail).toBeVisible();
    await expect(list).toBeVisible();
    await expectStableGeometry([workspace, body, layout, list, detail]);
    await expectSingleScrollOwner(body, list, detailBody);
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await list.evaluate((element) => element.scrollTop)).toBe(desktopListScrollTop);
    await workspace.getByRole('button', { name: 'Закрыть описание' }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(list).toBeVisible();
    await list.evaluate((element) => element.scrollTo({ top: 420 }));
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(250);
    const mobileListScrollTop = await list.evaluate((element) => element.scrollTop);
    await expectStableGeometry([workspace, body, layout, list]);
    const visibleMobileCardIndex = await firstFullyVisibleIndex(cards);
    await cards.nth(visibleMobileCardIndex).click();
    const retainedMobileListScrollTop = await list.evaluate((element) => element.scrollTop);
    await expect(list).toBeHidden();
    await expect(detail).toBeVisible();
    await expectStableGeometry([workspace, body, layout, detail]);
    await expectSingleScrollOwner(body, detailBody);
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    await workspace.getByRole('button', { name: 'Закрыть описание' }).click();
    await expect(list).toBeVisible();
    expect(retainedMobileListScrollTop).toBeGreaterThanOrEqual(mobileListScrollTop - 1);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(retainedMobileListScrollTop);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('keeps compendium actions fixed below a scrolling environment detail', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Справочник' }).click();
    await workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Окружения' }).click();
    const environmentCard = workspace.locator('.player-library-card').filter({ hasText: filledEnvironmentName }).first();
    await expect(environmentCard).toBeVisible();
    await environmentCard.click();

    const detail = workspace.getByLabel('Полная запись компендиума');
    const detailBody = detail.locator('.player-library-detail__body');
    const footer = detail.locator('.player-library-detail__footer');
    await expect(detail.getByRole('button', { name: 'Добавить в столкновение' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Создать сцену' })).toBeVisible();
    await detailBody.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => detailBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const desktopDetail = await rect(detail);
    const desktopFooter = await rect(footer);
    expect(Math.abs(desktopDetail.bottom - desktopFooter.bottom)).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(footer).toBeVisible();
    const mobileDetail = await rect(detail);
    const mobileFooter = await rect(footer);
    expect(Math.abs(mobileDetail.bottom - mobileFooter.bottom)).toBeLessThanOrEqual(2);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('scrolls the exact GM workspace character route through all seven cards with one scroll owner', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    const body = workspace.getByLabel('Содержимое рабочего пространства');
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();

    const editor = workspace.getByLabel('Редактор персонажа');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение' }).click();
    const cards = editor.locator('.dh-list-item').filter({ hasText: 'Заклинание' });
    await expect(cards).toHaveCount(7);
    const lastCard = cards.last();
    const before = await editor.evaluate((element) => element.scrollTop);
    await editor.hover();
    await page.mouse.wheel(0, 1_600);
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(before + 150);
    await expectInsideScrollport(editor, lastCard);
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    await expectSingleScrollOwner(body, editor);
    await expectStableGeometry([workspace, body, editor]);
  });

  test('keeps simple scene fitting visible and advanced framing collapsed, saved, and rendered', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Сцены' }).click();
    const framingMode = workspace.getByRole('group', { name: 'Размещение фона' });
    const advanced = workspace.locator('.player-tools-scene-framing__advanced');
    const zoom = workspace.getByLabel('Масштаб фона');
    const horizontal = workspace.getByLabel('Положение фона по горизонтали');
    const vertical = workspace.getByLabel('Положение фона по вертикали');
    const preview = workspace.locator('.player-tools-scene-preview img');

    await expect(framingMode.getByRole('button', { name: 'Заполнить сцену' })).toHaveAttribute('aria-pressed', 'true');
    await expect(advanced).not.toHaveAttribute('open', '');
    await expect(zoom).toBeHidden();
    await framingMode.getByRole('button', { name: 'Показать целиком' }).click();
    await expect(preview).toHaveCSS('object-fit', 'contain');

    await advanced.locator('summary').click();
    await expect(zoom).toBeVisible();
    await zoom.fill('1.5');
    await horizontal.fill('0.5');
    await vertical.fill('-0.25');
    await expect(advanced.getByText('Свой кадр')).toBeVisible();
    await expect(preview).toHaveCSS('transform', /matrix\(1\.5, 0, 0, 1\.5,/);

    await framingMode.getByRole('button', { name: 'Заполнить сцену' }).click();
    await expect(preview).toHaveCSS('object-fit', 'cover');
    await expect(zoom).toHaveValue('1');
    await expect(horizontal).toHaveValue('0');
    await expect(vertical).toHaveValue('0');
    await expect(advanced.getByText('Свой кадр')).toHaveCount(0);

    await zoom.fill('1.4');
    await horizontal.fill('-0.4');
    await workspace.getByRole('button', { name: 'Сбросить кадр' }).click();
    await expect(framingMode.getByRole('button', { name: 'Заполнить сцену' })).toHaveAttribute('aria-pressed', 'true');
    await expect(zoom).toHaveValue('1');
    await expect(horizontal).toHaveValue('0');

    await framingMode.getByRole('button', { name: 'Показать целиком' }).click();
    await zoom.fill('1.5');
    await horizontal.fill('0.5');
    await vertical.fill('-0.25');
    await workspace.getByRole('button', { name: 'Закрыть' }).click();

    const renderedBackground = page.locator('.player-view__scene-image');
    await expect(renderedBackground).toHaveCSS('background-size', 'contain');
    await expect(renderedBackground).toHaveCSS('background-repeat', 'no-repeat');
    await expect(renderedBackground).toHaveCSS('transform', /matrix\(1\.5, 0, 0, 1\.5,/);

    await page.reload();
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
    await expect(page.locator('.player-view__scene-image')).toHaveCSS('background-size', 'contain');
    await expect(page.locator('.player-view__scene-image')).toHaveCSS('transform', /matrix\(1\.5, 0, 0, 1\.5,/);
    await page.getByRole('button', { name: 'Инструменты' }).click();
    const reopenedWorkspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await reopenedWorkspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Сцены' }).click();
    await expect(reopenedWorkspace.getByRole('group', { name: 'Размещение фона' }).getByRole('button', { name: 'Показать целиком' })).toHaveAttribute('aria-pressed', 'true');
    await reopenedWorkspace.locator('.player-tools-scene-framing__advanced summary').click();
    await expect(reopenedWorkspace.getByLabel('Масштаб фона')).toHaveValue('1.5');
    await expect(reopenedWorkspace.getByLabel('Положение фона по горизонтали')).toHaveValue('0.5');
    await expect(reopenedWorkspace.getByLabel('Положение фона по вертикали')).toHaveValue('-0.25');
  });

  test('asks before removing a populated character and preserves it on cancel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByRole('button', { name: 'Редактировать' }).click();
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
    await expect(roster.locator('.player-tools-character-card')).toHaveCount(3);

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
    await page.setViewportSize({ width: 1280, height: 860 });
    await openFilledGmGame(page);

    await expect(page.getByLabel('Инструменты сцены').locator('.player-combat-tracker__entry-actions').getByRole('button', { name: /^Открыть лист / })).toHaveCount(0);

    const adversaryCard = page.locator('.player-combat-tracker__entry').first();
    await adversaryCard.click({ position: { x: 12, y: 14 } });
    await expect(page.getByLabel('Противник мастера')).toBeVisible();
    await page.getByRole('button', { name: 'К ростеру' }).click();

    const environmentCard = page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledEnvironmentName });
    await environmentCard.click({ position: { x: 16, y: 24 } });
    await expect(page.getByLabel('Окружение мастера')).toBeVisible();
  });
});

async function expectStableGeometry(locators: Locator[]): Promise<void> {
  for (const locator of locators) {
    const samples = await locator.evaluate(async (element) => {
      const values: Array<{ x: number; y: number; width: number; height: number; scrollTop: number }> = [];
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const rect = element.getBoundingClientRect();
        values.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, scrollTop: element.scrollTop });
      }
      return values;
    });
    for (const key of ['x', 'y', 'width', 'height', 'scrollTop'] as const) {
      const values = samples.map((sample) => sample[key]);
      expect(Math.max(...values) - Math.min(...values), `${key} changed for ${await locator.getAttribute('class')}`).toBeLessThanOrEqual(1);
    }
  }
}

async function expectSingleScrollOwner(outer: Locator, ...inner: Locator[]): Promise<void> {
  const outerState = await scrollState(outer);
  expect(outerState.scrollHeight - outerState.clientHeight).toBeLessThanOrEqual(1);
  const innerStates = await Promise.all(inner.map(scrollState));
  expect(innerStates.map((state) => state.overflowY)).toEqual(innerStates.map(() => 'auto'));
}

async function scrollState(locator: Locator) {
  return locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY
  }));
}

async function expectInsideScrollport(scrollport: Locator, item: Locator): Promise<void> {
  const [viewport, child] = await Promise.all([scrollport.boundingBox(), item.boundingBox()]);
  expect(viewport).not.toBeNull();
  expect(child).not.toBeNull();
  expect(child!.y).toBeGreaterThanOrEqual(viewport!.y);
  expect(child!.y + child!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height);
}

async function firstFullyVisibleIndex(items: Locator): Promise<number> {
  return items.evaluateAll((elements) => {
    const scrollport = elements[0]?.parentElement?.getBoundingClientRect();
    if (!scrollport) return 0;
    const index = elements.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= scrollport.top && rect.bottom <= scrollport.bottom;
    });
    return Math.max(0, index);
  });
}
