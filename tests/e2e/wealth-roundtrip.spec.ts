import { expect, test } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

test('Library wealth edit preserves handfuls 9, 10 and 70 after Done and reopening without conversion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);

  for (const amount of ['9', '10', '70']) {
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByRole('navigation', { name: 'Ростер персонажей' }).getByRole('button', { name: filledCharacterName, exact: true }).click();
    const editor = library.getByRole('region', { name: 'Редактор персонажа' });
    await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
    await editor.getByLabel('Горсти', { exact: true }).fill(amount);
    await editor.getByLabel('Горсти', { exact: true }).blur();
    await editor.getByLabel('Мешки', { exact: true }).fill('0');
    await editor.getByLabel('Сундуки', { exact: true }).fill('0');
    await editor.getByRole('button', { name: 'Готово', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible();
    await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();

    const reopenedLibrary = await openGameLibrary(page);
    await reopenedLibrary.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await reopenedLibrary.getByRole('navigation', { name: 'Ростер персонажей' }).getByRole('button', { name: filledCharacterName, exact: true }).click();
    const reopened = reopenedLibrary.getByRole('region', { name: 'Редактор персонажа' });
    await reopened.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await reopened.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
    await expect(reopened.getByLabel('Горсти', { exact: true })).toHaveValue(amount);
    await expect(reopened.getByLabel('Мешки', { exact: true })).toHaveValue('0');
    await expect(reopened.getByLabel('Сундуки', { exact: true })).toHaveValue('0');
    await reopened.getByRole('button', { name: 'Готово', exact: true }).click();
    await reopenedLibrary.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  }
});
