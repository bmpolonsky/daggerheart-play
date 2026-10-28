import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const directory = resolve('tests/fixtures/qa-world');
const output = process.env.QA_WORLD_SCREEN_DIRECTORY;
test('catalog world imports via UI, survives reload and repeated import', async ({ page }) => {
  test.setTimeout(60000);
  const coverage = JSON.parse(readFileSync(`${directory}/coverage.json`, 'utf8'));
  const first = `QA ${coverage.characters[0].className} — ${coverage.characters[0].subclassName}`;
  await page.setViewportSize({ width: 1180, height: 757 });
  await openGmGame(page);
  for (let cycle = 0; cycle < 2; cycle++) {
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки' }).click();
    await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры' }).click();
    await library.locator('input[type="file"][accept*=".dhworld"]').setInputFiles(`${directory}/synthetic-coverage-world.dhworld`);
    await expect(library.getByText('Мир импортирован: synthetic-coverage-world.dhworld')).toBeVisible();
    await library.getByRole('button', { name: 'Закрыть библиотеку' }).click();
    await expect(page.getByRole('button', { name: first, exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: first, exact: true }).first()).toBeVisible();
  }
  if (output) { mkdirSync(output, { recursive: true }); await page.screenshot({ path: `${output}/import-reload-1180.png` }); }
});
