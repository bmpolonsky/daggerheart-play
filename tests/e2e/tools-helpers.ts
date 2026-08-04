import type { Locator, Page } from '@playwright/test';

export async function openGameLibrary(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Библиотека игры' });
  if (await dialog.count()) return dialog;

  const libraryButton = page.getByRole('button', { name: 'Библиотека игры' });
  if (!await libraryButton.isVisible()) {
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Чат' }).click();
  }
  await libraryButton.click();
  return dialog;
}
