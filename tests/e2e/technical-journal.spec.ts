import { expect, test, type Page } from '@playwright/test';
import { TECHNICAL_JOURNAL_STORAGE_KEY } from '../../src/core/observability/technicalJournal';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';

async function openJournal(page: Page) {
  await openGameLibrary(page);
  const dialog = page.getByRole('dialog', { name: 'Библиотека игры' });
  await dialog.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await dialog.getByLabel('Разделы настроек').getByRole('button', { name: 'Диагностика', exact: true }).click();
  const journal = dialog.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Журнал событий ·/ }) });
  await journal.locator('summary').click();
  return { dialog, journal };
}

async function storedJournal(page: Page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]') as Array<{ area: string; operation: string; phase: string }>, TECHNICAL_JOURNAL_STORAGE_KEY);
}

test('general journal records startup, import and save, survives reload and can be cleared', async ({ page }) => {
  await openGmGame(page);
  await importGameDocument(page, createPopulatedGameDocument());
  await expect.poll(async () => (await storedJournal(page)).some(event => event.area === 'import' && event.phase === 'succeeded')).toBe(true);
  // Import saves directly; exercise the separate autosave path with a real edit.
  const settings = await openGameLibrary(page);
  await settings.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await settings.getByLabel('Разделы настроек').getByRole('button', { name: 'Игра', exact: true }).click();
  await settings.getByLabel('Название игры').fill('Проверка сохранения журнала');
  await expect.poll(async () => (await storedJournal(page)).some(event => event.area === 'persistence' && event.operation === 'write' && event.phase === 'succeeded')).toBe(true);
  const before = await storedJournal(page);
  const startups = before.filter(event => event.area === 'startup' && event.phase === 'succeeded').length;
  expect(startups).toBeGreaterThan(0);
  await page.reload();
  await expect.poll(async () => (await storedJournal(page)).filter(event => event.area === 'startup' && event.phase === 'succeeded').length).toBe(startups + 1);
  // Reload restores the library route; wait for its dialog instead of reopening it.
  const reloadedSettings = page.getByRole('dialog', { name: 'Библиотека игры' });
  await expect(reloadedSettings).toBeVisible();
  await reloadedSettings.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await reloadedSettings.getByLabel('Разделы настроек').getByRole('button', { name: 'Игра', exact: true }).click();
  await expect(reloadedSettings.getByLabel('Название игры')).toHaveValue('Проверка сохранения журнала');
  const { dialog, journal } = await openJournal(page);
  await expect(journal).toContainText('Запуск приложения');
  await expect(journal).toContainText('Применение импорта');
  await expect(journal).toContainText('Сохраняются при перезагрузке этой вкладки');
  await dialog.getByText('Технические данные', { exact: true }).click();
  await dialog.getByText('Исходный JSON отчёта', { exact: true }).click();
  const report = JSON.parse(await dialog.locator('.player-tools-technical-report').innerText());
  expect(report.journal.some((event: { area: string }) => event.area === 'import')).toBe(true);
  expect(JSON.stringify(report)).not.toContain('Кадсуанэ');
  expect(JSON.stringify(report)).not.toContain('Хранительница');
  await journal.getByRole('button', { name: 'Очистить журнал' }).click();
  await expect(journal.getByLabel('Технические события').locator('li')).toHaveCount(0);
  await expect(journal.getByRole('button', { name: 'Очистить журнал' })).toBeDisabled();
  await page.reload();
  await expect.poll(async () => (await storedJournal(page)).some(event => event.area === 'startup' && event.phase === 'succeeded')).toBe(true);
  expect((await storedJournal(page)).some(event => event.area === 'import')).toBe(false);
});

test('blocked tab storage falls back to live memory without breaking startup', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await openGmGame(page);
  const { journal } = await openJournal(page);
  await expect(journal).toContainText('Хранилище вкладки недоступно');
  await expect(journal).toContainText('Запуск приложения');
  expect(pageErrors).toEqual([]);
});
