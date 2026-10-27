import { expect, type Locator } from '@playwright/test';

/** Formula editing is auxiliary; tests which inspect/edit it open it deliberately. */
export async function openUnifiedFormulaEditor(tray: Locator): Promise<Locator> {
  await expect(tray).toBeVisible();
  const input = tray.getByLabel('Формула броска', { exact: true });
  if (!await input.isVisible()) await tray.getByRole('button', { name: 'Изменить формулу', exact: true }).click();
  await expect(input).toBeVisible();
  return input;
}
