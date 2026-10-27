import type { Locator, Page } from '@playwright/test';

/** Paired probes deliberately support both the released/old controls and the
 * coordinated ancestry step; no invisible compatibility control is rendered. */
export async function hasMixedAncestryMode(step: Locator): Promise<boolean> {
  return await step.getByRole('button', { name: 'Смешанная', exact: true }).count() > 0
    || await step.getByRole('checkbox', { name: 'Смешанная родословная', exact: true }).count() > 0;
}

export async function chooseMixedAncestryMode(step: Locator): Promise<void> {
  const mode = step.getByRole('button', { name: 'Смешанная', exact: true });
  if (await mode.count()) await mode.click();
  else await step.getByRole('checkbox', { name: 'Смешанная родословная', exact: true }).check();
}

export async function chooseAncestryFeature(page: Page, step: Locator, position: 0 | 1, name: string): Promise<void> {
  const block = step.getByRole('group', { name: position === 0 ? 'Первое свойство родословной' : 'Второе свойство родословной', exact: true });
  if (await block.count()) {
    await block.getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click();
  } else if (position === 0) {
    await step.locator('.dh-choice-grid').getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click();
  } else {
    await step.getByRole('button', { name: 'Второе свойство — родословная', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор: Второе свойство — родословная', exact: true });
    await picker.getByRole('option').filter({ has: page.getByText(name, { exact: true }) }).click();
    await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
  }
}
