import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';

test.describe('GM scene context navigation', () => {
  test('keeps stable tabs and exposes direct participant and prepared flows', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await openFilledGmGame(page);

    const context = page.getByLabel('Контекст мастера');
    const contextButtons = context.getByRole('button');
    await expect(contextButtons).toHaveCount(6);
    await expect(contextButtons.nth(0)).toHaveAccessibleName(/Лист/);
    await expect(contextButtons.nth(1)).toHaveAccessibleName('Участники');
    await expect(contextButtons.nth(2)).toHaveAccessibleName('Подготовлено');
    await expect(contextButtons.nth(3)).toHaveAccessibleName('Сцены');
    await expect(contextButtons.nth(4)).toHaveAccessibleName('Действия');
    await expect(contextButtons.nth(5)).toHaveAccessibleName('Музыка');
    await expect(contextButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Добавить к сцене' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Настроить игроков' }).click();
    let workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    await expect(workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки' })).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.getByLabel('Разделы настроек').getByRole('button', { name: 'Игроки' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await page.getByRole('button', { name: 'Открыть персонажей' }).click();
    workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    await expect(workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await page.getByRole('button', { name: 'Справочник противников' }).click();
    workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    await expect(workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Противники' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await page.getByRole('button', { name: 'Конструктор боя' }).click();
    workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    await expect(workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Бой' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await context.getByRole('button', { name: 'Подготовлено' }).click();
    const prepared = page.getByRole('region', { name: 'Подготовлено' });
    await expect(prepared).toBeVisible();
    await expect(prepared.getByLabel('Поиск подготовленных ресурсов')).toBeVisible();
    await expect(prepared.getByRole('button', { name: 'Создать героя' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
    await expect(page.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' })).toBeVisible();
  });
});
