import { expect, type Locator } from '@playwright/test';

/** Formula editing is auxiliary; tests which inspect/edit it open it deliberately. */
export async function openUnifiedFormulaEditor(tray: Locator): Promise<Locator> {
  await expect(tray).toBeVisible();
  const input = tray.getByLabel('Формула броска', { exact: true });
  if (!await input.isVisible()) await tray.getByRole('button', { name: 'Изменить формулу', exact: true }).click();
  await expect(input).toBeVisible();
  return input;
}

/** Rare source counts are explicit; an ordinary repeated click now toggles off. */
export async function chooseUnifiedAdvantage(tray: Locator, kind: 'advantage' | 'disadvantage', count = 1): Promise<void> {
  const label = kind === 'advantage' ? /^Преимущество/ : /^Помеха/;
  const button = tray.getByRole('button', { name: label });
  const active = await button.getAttribute('aria-pressed') === 'true';
  if (count === 0) { if (active) await button.click(); return; }
  if (!active) await button.click();
  if (count > 1) {
    const disclosure = tray.getByRole('button', { name: 'Несколько', exact: true });
    if (await disclosure.getAttribute('aria-expanded') !== 'true') await disclosure.click();
    await tray.getByRole('spinbutton', { name: 'Источников преимущества или помехи', exact: true }).fill(String(count));
  }
}
