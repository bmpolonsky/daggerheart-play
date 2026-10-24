import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

for (const width of [1440, 390]) {
test(`world rename uses an accessible form without native prompts at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await installDeterministicP2PTransport(page);
  await page.addInitScript(() => {
    window.prompt = () => { throw new Error('prompt() is not supported'); };
  });
  await page.goto('/#/library/settings/project-games');
  const library = page.getByRole('region', { name: 'Миры', exact: true });
  await expect(library.getByRole('button', { name: 'Новый мир', exact: true })).toBeVisible();
  const originalWorlds = await library.getByRole('button', { name: /^Действия с миром / }).count();
  await library.getByRole('button', { name: 'Новый мир', exact: true }).click();
  const menus = library.getByRole('button', { name: /^Действия с миром / });
  await expect(menus).toHaveCount(originalWorlds + 1);
  const trigger = menus.first();
  const originalLabel = await trigger.getAttribute('aria-label');
  const openRename = async () => {
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Переименовать', exact: true }).click();
    await expect(name).toBeFocused();
  };
  const dialog = page.getByRole('dialog', { name: 'Переименовать мир', exact: true });
  const name = dialog.getByRole('textbox', { name: 'Название мира', exact: true });
  await openRename();
  await expect(name).toBeFocused();
  const originalName = await name.inputValue();
  await name.fill('   ');
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeDisabled();
  await name.press('Enter');
  await expect(dialog).toBeVisible();
  await name.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-label', originalLabel!);
  await openRename();
  await expect(name).toHaveValue(originalName);
  await name.fill('Отменённое имя');
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await openRename();
  await name.fill('  Перенос Foundry QA  ');
  await name.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Отмена', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(name).toBeFocused();
  await name.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'Действия с миром Перенос Foundry QA', exact: true })).toBeVisible();
  await expect(menus).toHaveCount(originalWorlds + 1);
  await page.reload();
  await expect(library.getByRole('button', { name: 'Действия с миром Перенос Foundry QA', exact: true })).toBeVisible();
  await expect(menus).toHaveCount(originalWorlds + 1);
});

}
