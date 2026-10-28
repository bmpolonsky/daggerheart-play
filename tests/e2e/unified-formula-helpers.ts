import { expect, type Locator } from '@playwright/test';

/** Formula editing is auxiliary; tests which inspect/edit it open it deliberately. */
export async function openUnifiedFormulaEditor(tray: Locator): Promise<Locator> {
  await expect(tray).toBeVisible();
  const input = tray.getByLabel('Формула броска', { exact: true });
  if (!await input.isVisible()) await tray.getByRole('button', { name: 'Изменить формулу', exact: true }).click();
  await expect(input).toBeVisible();
  return input;
}

/** Use visible source controls to reach the requested signed balance. */
export async function chooseUnifiedAdvantage(tray: Locator, kind: 'advantage' | 'disadvantage', count = 1): Promise<void> {
  const positive = tray.getByRole('button', { name: /^Преимущество/ });
  const negative = tray.getByRole('button', { name: /^Помеха/ });
  let current = 0;
  for (const [button, sign] of [[positive, 1], [negative, -1]] as const) {
    if (await button.getAttribute('aria-pressed') === 'true') current = sign * Number((await button.innerText()).match(/\d+$/)?.[0] ?? 1);
  }
  const target = (kind === 'advantage' ? 1 : -1) * count;
  for (let step = 0; step < Math.abs(target - current); step++) await (target > current ? positive : negative).click();
}
