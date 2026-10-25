import { expect, type Locator, type Page } from '@playwright/test';

export async function openGameLibrary(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Библиотека игры' });
  if (await dialog.count()) return dialog;

  const libraryButton = page.getByRole('button', { name: 'Справочник', exact: true });
  // Navigation completes before the persisted game and its chrome render.
  // Wait for an actual entry point instead of mistaking that gap for mobile UI.
  await expect.poll(async () =>
    await libraryButton.isVisible()
    || await page.getByRole('button', { name: /^Открыть чат/ }).isVisible()
    || await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Чат' }).isVisible()
  ).toBe(true);
  if (!await libraryButton.isVisible()) {
    const desktopToggle = page.getByRole('button', { name: /^Открыть чат/ });
    if (await desktopToggle.isVisible()) {
      await desktopToggle.click();
    } else {
      await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Чат' }).click();
    }
  }
  await libraryButton.click();
  return dialog;
}
