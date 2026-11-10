import { test, expect } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { TECHNICAL_JOURNAL_STORAGE_KEY as key } from '../../src/core/observability/technicalJournal';

test.use({ serviceWorkers: 'block' });
async function openJournal(page: import('@playwright/test').Page) {
  await openGameLibrary(page);
  const modal = page.getByRole('dialog', { name: 'Библиотека игры' });
  await modal.getByRole('button', { name: 'Настройки' }).click();
  await modal.getByLabel('Разделы настроек').getByRole('button', { name: 'Диагностика' }).click();
  await modal.getByText(/^Журнал событий ·/).click();
  return modal;
}
for (const width of [1440, 390]) {
  test(`journal survives reload and can be cleared at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
    await openGmGame(page);
    const before = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]'), key);
    expect(before.some((event: any) => event.area === 'startup' && event.phase === 'succeeded')).toBe(true);
    await page.reload();
    let modal = await openJournal(page);
    await expect(modal.getByRole('list', { name: 'Технические события' })).toContainText('Запуск приложения');
    const after = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? '[]'), key);
    expect(after.filter((event: any) => event.area === 'startup' && event.phase === 'succeeded').length).toBeGreaterThan(1);
    await modal.getByRole('button', { name: 'Очистить журнал' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('technical-journal.png'), fullPage: true });
    await modal.getByRole('button', { name: 'Очистить журнал' }).click();
    await expect(modal.getByRole('list', { name: 'Технические события' }).getByRole('listitem')).toHaveCount(0);
    expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
  });
}
