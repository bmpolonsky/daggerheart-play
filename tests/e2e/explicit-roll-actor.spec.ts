import { openUnifiedFormulaEditor } from './unified-formula-helpers';
import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';

test('bottom configured check keeps its explicitly chosen actor while another sheet is viewed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  const roster = page.getByLabel('Участники сцены');
  await roster.getByRole('button', { name: filledCharacterName, exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await openUnifiedFormulaEditor(tray);
  await expect(tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true })).toBeVisible();
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('character:e2e-character-cadsuane');
  await tray.getByLabel('Формула броска', { exact: true }).fill('2d6+3');
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await tray.getByRole('button', { name: 'Сделать ручным броском', exact: true }).click();
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();

  await page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'Ран', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  await expect(tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true })).toHaveValue('character:e2e-character-cadsuane');
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d6+3');
  await expect(page.getByLabel('Подтверждение броска', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Проверка персонажа', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Персонаж игрока')).toContainText('Ран');
});

test('one tray adds from its palette, removes prepared dice and resets without a replace mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await openUnifiedFormulaEditor(tray);
  // This scenario deliberately exercises a free GM pool regardless of the
  // character previously selected during fixture import.
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('gm');
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
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('1d6');
});
