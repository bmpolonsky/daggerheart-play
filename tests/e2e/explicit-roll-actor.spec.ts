import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';

test('bottom configured check keeps its explicitly chosen actor while another sheet is viewed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  const roster = page.getByLabel('Участники сцены');
  await roster.getByRole('button', { name: filledCharacterName, exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.locator('.mini-dice-launcher__panel');
  await expect(tray.getByRole('combobox', { name: 'От лица', exact: true })).toHaveValue('gm');
  await tray.getByRole('combobox', { name: 'От лица', exact: true }).selectOption('character:e2e-character-cadsuane');
  await tray.getByRole('button', { name: 'Скрыть панель', exact: true }).click();

  await page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Ран', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  await expect(tray.getByRole('combobox', { name: 'От лица', exact: true })).toHaveValue('character:e2e-character-cadsuane');
  await tray.getByRole('button', { name: 'Проверка персонажа', exact: true }).click();
  const confirm = page.getByRole('complementary', { name: 'Подтверждение броска', exact: true });
  await expect(confirm).toContainText(`От лица: ${filledCharacterName}`);
  await expect(confirm.getByLabel('Характеристика броска')).toBeVisible();
  await expect(page.getByLabel('Персонаж игрока')).toContainText('Ран');
});

test('manual tray clearly distinguishes adding dice from replacing its set', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.locator('.mini-dice-launcher__panel');
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Убрать d20', exact: true })).toHaveCount(1);
  await expect(tray.getByRole('button', { name: 'Убрать d6', exact: true })).toHaveCount(1);
  await tray.getByRole('button', { name: 'Заменять набор', exact: true }).click();
  await tray.getByRole('button', { name: 'Заменить набор на d8', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Убрать d20', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('button', { name: 'Убрать d6', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('button', { name: 'Убрать d8', exact: true })).toHaveCount(1);
  await tray.getByRole('button', { name: 'Добавлять', exact: true }).click();
  await tray.getByRole('button', { name: 'Добавить d8', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Убрать d8', exact: true })).toHaveCount(2);
});
