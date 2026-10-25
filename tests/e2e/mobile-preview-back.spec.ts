import { expect, test, type Page } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';

test.use({ viewport: { width: 390, height: 844 } });

async function openCards(page: Page) {
  await openFilledGmGame(page);
  const layer = page.getByLabel('Слой интерфейса');
  if (await layer.isVisible()) await layer.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
  if (await layer.isVisible()) await layer.getByRole('button', { name: 'Лист', exact: true }).click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  const sheet = page.getByLabel('Персонаж игрока');
  await expect(sheet.getByRole('region', { name: 'Рука карт доменов' })).toBeVisible();
  return sheet;
}

async function seedSameDocumentLobbyHistory(page: Page) {
  // Model the same-origin lobby -> game history without changing the loaded
  // synthetic world or introducing an extra route solely for the preview.
  await page.evaluate(() => {
    history.replaceState({ previewTestLobby: true }, '', '/');
    history.pushState({ previewTestGame: true }, '', '/#/game');
  });
  return page.evaluate(() => history.length);
}

async function openCard(page: Page, name: string) {
  const row = page.getByLabel('Персонаж игрока').locator('.player-domain-card-zones .dh-list-item').filter({ hasText: name });
  await row.locator('.player-domain-card-thumb').click();
  const preview = page.getByRole('dialog', { name: 'Предпросмотр', exact: true });
  await expect(preview).toContainText(name);
  return preview;
}

test('mobile Back closes preview, preserves route/history and the next Back reaches the lobby', async ({ page }) => {
  await openCards(page);
  const length = await seedSameDocumentLobbyHistory(page);
  for (const name of ['Заклинание 1', 'Заклинание 2', 'Заклинание 1']) {
    await openCard(page, name);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.evaluate(() => history.back());
    await expect(page.getByRole('dialog', { name: 'Предпросмотр', exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/#\/game$/);
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect(await page.evaluate(() => history.state.previewTestGame)).toBe(true);
  }
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-vtt-root]')).toHaveCount(0);
});

test('a direct game route adds no trapping history entry and explicit close leaves it unchanged', async ({ page }) => {
  await openCards(page);
  const before = await page.evaluate(() => ({ length: history.length, url: location.href }));
  const preview = await openCard(page, 'Заклинание 1');
  expect(await page.evaluate(() => history.length)).toBe(before.length);
  await preview.getByRole('button', { name: 'Закрыть предпросмотр', exact: true }).click();
  expect(await page.evaluate(() => ({ length: history.length, url: location.href }))).toEqual(before);
  // A cross-document Back from a freshly opened invite is outside this local
  // popstate guard; no synthetic entry is inserted to trap that navigation.
});

test('synthetic application navigation is not consumed by the mobile preview guard', async ({ page }) => {
  await openCards(page);
  await seedSameDocumentLobbyHistory(page);
  await openCard(page, 'Заклинание 1');
  await page.evaluate(() => {
    history.pushState({ applicationNavigation: true }, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-vtt-root]')).toHaveCount(0);
});

test('preview guard does not consume Back for a topmost critical confirmation or apply its action', async ({ page }) => {
  await openCards(page);
  await seedSameDocumentLobbyHistory(page);
  const preview = await openCard(page, 'Заклинание 6');
  await preview.getByLabel('Другие действия карты Заклинание 6').click();
  await page.getByRole('menu', { name: 'Другие действия карты Заклинание 6' }).getByRole('menuitem', { name: 'Убрать навсегда' }).click();
  await expect(page.getByRole('dialog', { name: 'Навсегда убрать «Заклинание 6»?' })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog', { name: 'Навсегда убрать «Заклинание 6»?' })).toHaveCount(0);
  await page.evaluate(() => history.forward());
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await page.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  const reopened = await openCard(page, 'Заклинание 6');
  await expect(reopened.getByText('Навсегда в Хранилище', { exact: true })).toHaveCount(0);
});
