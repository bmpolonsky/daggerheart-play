import { expect, test, type Page } from '@playwright/test';
import { openGmGame, openPlayerGame } from './game-route-helpers';
import { expectHiddenSurface, expectInsideViewport } from './layout-helpers';

async function openPlayerView(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openPlayerGame(page);
}

async function openAssignedPlayerView(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openPlayerGame(page);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
}

test.describe('Player View empty state', () => {
  test('fresh browser context starts with no hidden campaign data', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => window.sessionStorage.setItem('e2e-copied-invite', value)
        }
      });
    });
    await page.goto('/');

    const gmLobby = page.getByLabel('Создать сессию мастера');
    await expect(gmLobby.getByText('Добавьте игроков')).toBeVisible();
    await expect(gmLobby.getByLabel('Имя игрока')).toHaveCount(0);
    await expect(page.getByLabel('Управление сохранениями').getByText('Сохранений пока нет')).toBeVisible();
    const copyInvite = gmLobby.getByRole('button', { name: 'Копировать ссылку игрока' });
    await expect(copyInvite).toBeEnabled();
    await copyInvite.click();
    await expect(page.getByText('Ссылка скопирована.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem('e2e-copied-invite'))).toContain('/#/join/');

    await openGmGame(page);
    await expect(page.locator('.player-token')).toHaveCount(0);
    await expect(page.getByLabel('Хроника игры')).toContainText('Хроника пока пуста');
    await expect(page.getByLabel('Инструменты сцены')).toContainText('Сцена пока пуста');

    await page.getByRole('button', { name: 'Инструменты' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await expect(workspace.locator('.player-tools-character-card')).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: 'Создать героя' })).toBeVisible();
  });

  test('assigned desktop player sees a character sheet lane, not GM controls', async ({ page }) => {
    await openAssignedPlayerView(page, { width: 1280, height: 720 });

    const panel = page.getByLabel('Персонаж игрока');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Персонаж не назначен');
    await expect(page.locator('body')).not.toContainText('Атака мастера');
    await expect(page.locator('body')).not.toContainText('Цель');
    await expect(page.locator('.superapp-tabs')).toHaveCount(0);
    await expect(page.locator('.player-title-stack')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'К ростеру' })).toHaveCount(0);
    await expect(page.getByLabel(/Страх \d+ из 12/).first().getByRole('button')).toHaveCount(0);
    await expectInsideViewport(page, panel);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
  });

  test('desktop sheet section rail stays visible beside the right sheet', async ({ page }) => {
    await openAssignedPlayerView(page, { width: 1440, height: 900 });

    const panel = page.getByLabel('Персонаж игрока');

    await expect(panel).toBeVisible();
    await expectInsideViewport(page, panel);
  });

  test('desktop explains the missing character and opens character creation', async ({ page }) => {
    await openPlayerView(page, { width: 1440, height: 900 });

    const panel = page.getByLabel('Персонаж игрока');
    const cta = panel.getByRole('button', { name: 'Создать персонажа' });

    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Персонаж не назначен');
    await expect(panel).toContainText('Создайте героя');
    await expect(cta).toBeVisible();
    await expectInsideViewport(page, panel);

    await cta.click();
    await expect(page.getByRole('dialog', { name: 'Новый герой' })).toBeVisible();
  });

  test('mobile keeps the empty state readable and actionable', async ({ page }) => {
    await openPlayerView(page, { width: 390, height: 844 });
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();

    const panel = page.getByLabel('Персонаж игрока');
    const cta = panel.getByRole('button', { name: 'Создать персонажа' });

    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Персонаж не назначен');
    await expect(panel).toContainText('Создайте героя');
    await expect(cta).toBeVisible();
    await expectInsideViewport(page, panel);
    await expectInsideViewport(page, cta);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

    await cta.click();
    await expect(page.getByRole('dialog', { name: 'Новый герой' })).toBeVisible();
  });

  test('GM can adjust Fear from the VTT top bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    const fearTrack = page.getByLabel(/Страх \d+ из 12/).first();
    await expect(fearTrack).toContainText('0/12');
    await expect(fearTrack).toHaveCSS('grid-template-areas', '"label pips value"');

    await fearTrack.getByRole('button', { name: 'Страх 3' }).click();
    await expect(fearTrack).toContainText('3/12');

    const activeFear = fearTrack.getByRole('button', { name: 'Страх 3' });
    const emptyFear = fearTrack.getByRole('button', { name: 'Страх 4' });
    const visualState = (locator: typeof activeFear) => locator.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      boxShadow: getComputedStyle(element).boxShadow,
      transform: getComputedStyle(element).transform
    }));
    const activeBeforeHover = await visualState(activeFear);
    await activeFear.hover();
    expect(await visualState(activeFear)).toEqual(activeBeforeHover);
    const emptyBeforeHover = await visualState(emptyFear);
    await emptyFear.hover();
    expect(await visualState(emptyFear)).toEqual(emptyBeforeHover);

    await fearTrack.getByRole('button', { name: 'Страх 3' }).click();
    await expect(fearTrack).toContainText('2/12');
  });

  test('GM creates and manages countdown from the feed composer', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    await page.getByRole('button', { name: 'Скрыть хронику' }).click();
    const chronicle = page.getByLabel('Хроника игры');
    await expectHiddenSurface(chronicle);
    await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Действия' }).click();
    await page.getByRole('button', { name: 'Создать отсчет' }).click();

    const composer = page.getByLabel('Создать отсчет');
    await expect(chronicle).toHaveCSS('opacity', '1');
    await expect(chronicle).not.toHaveAttribute('inert', '');
    const composerEvent = composer.locator('xpath=ancestor::article[contains(@class, "player-activity-event--countdownComposer")]');
    await expect(composer).toBeVisible();
    await expect(composerEvent).toBeVisible();
    await expect(composer.getByRole('button', { name: 'Запустить' })).toBeDisabled();
    await expect(page.getByLabel('Название отсчета')).toHaveCount(0);
    await composer.getByLabel('Название').fill('Ритуал');
    await composer.getByRole('button', { name: 'Запустить' }).click();
    await expect(composer).toHaveCount(0);

    const countdownName = page.getByLabel('Название отсчета');
    await expect(countdownName).toHaveValue('Ритуал');
    const countdown = countdownName.locator('xpath=ancestor::article[contains(@class, "player-countdown-card")]');
    await expect(countdown).toBeVisible();
    await countdown.getByTitle('Вперед').click();
    await expect(countdown).toContainText('1/4');
    await countdown.getByTitle('Показать игрокам').click();
    await countdown.getByTitle('Удалить отсчет').click();
    await expect(countdown).toHaveCount(0);
  });
});
