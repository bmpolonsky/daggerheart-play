import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

for (const width of [1180, 390]) test(`selected tray trait keeps contextual rule help at ${width}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await openGmGame(page);
  await importGameDocument(page, createPopulatedGameDocument(), 'trait-help.dhgame');
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: filledCharacterName, exact: true }).click();
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  const sheet = page.getByLabel('Персонаж игрока', { exact: true });
  await sheet.locator('.player-trait-grid').getByRole('button', { name: /Проворность/ }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  const selector = tray.getByRole('combobox', { name: 'Характеристика броска', exact: true });
  for (const [value, name] of [['agility','Проворность'],['strength','Сила'],['finesse','Искусность'],['instinct','Инстинкт'],['presence','Влияние'],['knowledge','Знание']]) {
    await selector.selectOption(value!);
    const help = tray.getByRole('button', { name: `О характеристике ${name}`, exact: true });
    await help.focus();
    const id = await help.getAttribute('aria-describedby');
    const tooltip = page.locator(`[id="${id}"]`);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(name!);
    await expect(tooltip).toContainText('Нажмите, чтобы открыть статью');
  }
  await page.screenshot({ path: testInfo.outputPath(`trait-help-${width}.png`) });
  await tray.getByRole('button', { name: 'О характеристике Знание', exact: true }).click();
  await expect(page).toHaveURL(/#\/library\/compendium\/rules\/character-traits$/);
  const library = page.getByRole('dialog', { name: 'Библиотека игры', exact: true });
  await expect(library.getByRole('heading', { name: 'Характеристики персонажа', exact: true })).toBeVisible();
});
