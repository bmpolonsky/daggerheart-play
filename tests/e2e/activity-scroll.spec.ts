import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';

test('mobile chat opens at the latest event and preserves deliberate history reading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  document.files['data/feed.json'] = Array.from({ length: 18 }, (_, index) => ({
    id: `history-${index}`, type: 'message' as const,
    createdAt: new Date(Date.UTC(2026, 9, 25, 10, index)).toISOString(),
    visibility: 'public' as const, publication: 'public' as const,
    authorName: 'Мастер', title: 'Мастер',
    body: `Событие ${index}: ${'история приключения '.repeat(12)}`
  })).reverse();
  // The import awaits a document-store save. This history must survive reload;
  // typing many messages then reloading can outrun the debounced save.
  await importGameDocument(page, document, 'activity-history.dhgame');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const tabs = page.getByLabel('Слой интерфейса');
  await tabs.getByRole('button', { name: /^Чат/ }).click();
  const list = page.locator('.player-activity-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.player-activity-event--message')).toHaveCount(18);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(200);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(5);
  await list.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  const composer = page.getByLabel('Сообщение в чат');
  await composer.fill('Новое событие во время чтения истории');
  await composer.press('Enter');
  await expect(page.getByRole('button', { name: 'Новые события: 1', exact: true })).toBeVisible();
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeLessThan(5);
  await tabs.getByRole('button', { name: 'Сцена', exact: true }).click();
  await tabs.getByRole('button', { name: /^Чат/ }).click();
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeLessThan(5);
  await page.getByRole('button', { name: 'Новые события: 1', exact: true }).click();
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(5);
});
