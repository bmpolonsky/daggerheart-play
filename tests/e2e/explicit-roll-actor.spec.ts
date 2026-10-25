import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';

test('bottom configured check keeps its explicitly chosen actor while another sheet is viewed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  const roster = page.getByLabel('Участники сцены');
  await roster.getByRole('button', { name: filledCharacterName, exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray.getByRole('combobox')).toHaveCount(0);
  await tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true }).click();
  await tray.getByLabel('Исполнитель броска', { exact: true }).selectOption('character:e2e-character-cadsuane');
  await tray.getByLabel('Формула броска', { exact: true }).fill('2d6+3');
  await tray.getByRole('button', { name: 'Скрыть панель', exact: true }).click();

  await page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Ран', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toContainText(filledCharacterName);
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('2d6+3');
  await expect(page.getByLabel('Подтверждение броска', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Проверка персонажа', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Персонаж игрока')).toContainText('Ран');
});

test('one tray adds from its palette, removes prepared dice and resets without a replace mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Убрать d20', exact: true })).toHaveCount(1);
  await expect(tray.getByRole('button', { name: 'Убрать d6', exact: true })).toHaveCount(1);
  await expect(tray.getByRole('button', { name: 'Заменять набор', exact: true })).toHaveCount(0);
  await tray.getByRole('button', { name: 'Добавить d8', exact: true }).click();
  await tray.getByRole('button', { name: 'Добавить d8', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue(/2d8/);
  await tray.getByRole('button', { name: 'Убрать d8', exact: true }).first().click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue(/1d8/);
  await tray.getByRole('button', { name: 'Сбросить набор', exact: true }).click();
  await expect(tray.getByRole('button', { name: /^Убрать d/ })).toHaveCount(0);
});
