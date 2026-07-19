import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';

test.describe('scene add menu', () => {
  test('GM can reach every add flow from the scene on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await openFilledGmGame(page);

    const addButton = page.getByLabel('Инструменты сцены').getByRole('button', { name: 'Добавить к сцене' });
    await expect(addButton).toBeVisible();
    await addButton.click();
    const menu = page.getByRole('menu', { name: 'Добавить к сцене' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Героя', 'Противника', 'Окружение', 'Создать бой']);

    await menu.getByRole('menuitem', { name: 'Героя' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await expect(workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' })).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.getByRole('button', { name: 'Создать героя' })).toBeVisible();
    await workspace.getByRole('button', { name: 'Закрыть' }).click();

    await addButton.click();
    await menu.getByRole('menuitem', { name: 'Противника' }).click();
    await expect(workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Противники' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть' }).click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Лист' }).click();
    await expect(addButton).toBeVisible();
    await addButton.click();
    await menu.getByRole('menuitem', { name: 'Окружение' }).click();
    await expect(workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Окружения' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть' }).click();

    await addButton.click();
    await menu.getByRole('menuitem', { name: 'Создать бой' }).click();
    await expect(workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Бой' })).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.getByRole('region', { name: 'Бой' })).toBeVisible();
  });
});
