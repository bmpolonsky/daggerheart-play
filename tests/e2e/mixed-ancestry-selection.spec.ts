import { chooseMixedAncestryMode, chooseAncestryFeature } from './ancestry-selection-helpers';
import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

test('mixed ancestry blocks the same pair and saves Elf first plus Giant second without unselected features', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  const roster = library.getByRole('navigation', { name: 'Ростер персонажей' });
  const initialCount = await roster.locator('.player-tools-character-card').count();
  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
  await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
  await builder.getByRole('button', { name: 'Личность', exact: true }).click();
  await builder.getByLabel('Имя', { exact: true }).fill('QA Эльф Великан');
  await builder.getByLabel('Имя', { exact: true }).blur();
  await builder.getByRole('button', { name: 'Родословная', exact: true }).click();
  const ancestry = builder.getByRole('group', { name: 'Шаг: Родословная', exact: true });
  await chooseMixedAncestryMode(ancestry);
  await chooseAncestryFeature(page, ancestry, 0, 'Великан');

  await chooseAncestryFeature(page, ancestry, 1, 'Великан');
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(builder.getByRole('group', { name: 'Шаг: Итог', exact: true })).toContainText('Для смешанного наследия выберите две разные родословные.');
  await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeDisabled();
  await expect(roster.locator('.player-tools-character-card')).toHaveCount(initialCount);

  // Keep Giant as the second source and reverse the first source to Elf.
  await builder.getByRole('button', { name: 'Родословная', exact: true }).click();
  await chooseAncestryFeature(page, ancestry, 0, 'Эльф');
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(builder.locator('.cinematic-builder-loadout-summary')).toContainText('Эльф / Великан');
  await expect(builder.getByText('Для смешанного наследия выберите две разные родословные.', { exact: true })).toHaveCount(0);
  await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeEnabled();
  await builder.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(builder).toHaveCount(0);
  await expect(roster.locator('.player-tools-character-card')).toHaveCount(initialCount + 1);

  const editor = library.getByRole('region', { name: 'Редактор персонажа' });
  await expect(editor.getByRole('heading', { name: 'QA Эльф Великан', exact: true })).toBeVisible();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click();
  const ancestryFeatures = editor.locator('.character-rule-feature').filter({ has: page.getByText('Родословная', { exact: true }) });
  await expect(ancestryFeatures).toHaveCount(2);
  await expect(ancestryFeatures.locator('.character-rule-feature__identity > strong')).toHaveText(['Быстрые рефлексы', 'Размах']);
  await expect(ancestryFeatures.getByText('Выносливость', { exact: true })).toHaveCount(0);
  await expect(ancestryFeatures.getByText('Небесный транс', { exact: true })).toHaveCount(0);
});
