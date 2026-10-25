import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

test('creating a second hero opens its Library editor without replacing the viewed scene sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  await expect(page.getByLabel('Персонаж игрока')).toContainText(filledCharacterName);

  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  const roster = library.getByRole('navigation', { name: 'Ростер персонажей' });
  await roster.getByRole('button', { name: filledCharacterName, exact: true }).click();
  const editor = library.getByRole('region', { name: 'Редактор персонажа' });
  await expect(editor.getByRole('heading', { name: filledCharacterName, exact: true })).toBeVisible();
  const previousCount = await roster.locator('.player-tools-character-card').count();

  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Новый герой' });
  await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  const name = (await builder.locator('.cinematic-builder-loadout-summary > strong').textContent())?.trim();
  expect(name).toBeTruthy();
  expect(name).not.toBe(filledCharacterName);
  await builder.getByRole('button', { name: 'Создать', exact: true }).click();

  await expect(builder).toHaveCount(0);
  await expect(roster.locator('.player-tools-character-card')).toHaveCount(previousCount + 1);
  await expect(editor.getByRole('heading', { name: name!, exact: true })).toBeVisible();
  await expect(roster.locator('.dh-is-selected')).toContainText(name!);
  await expect(roster.locator('.dh-is-selected').getByRole('button', { name: 'Убрать со сцены', exact: true })).toBeVisible();

  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  await expect(page.getByLabel('Персонаж игрока')).toContainText(filledCharacterName);
});
