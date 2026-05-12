import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function openCombatBuilder(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tools/combat');
  await expect(page.locator('.combat-builder-app')).toBeVisible();
  return page;
}

async function openGmTable(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/gm');
  await expect(page.locator('.player-view--gm')).toBeVisible();
  return page;
}

async function addRedOoze(page: Page): Promise<void> {
  await page.getByPlaceholder('Поиск...').fill('Алая Слизь');
  const redOoze = page.locator('article').filter({ hasText: 'Алая Слизь' }).first();
  await expect(redOoze).toBeVisible();
  await redOoze.getByTitle('Добавить в бой').click();
}

async function openNpcRoster(page: Page): Promise<void> {
  await page.locator('.player-roster-tabs').getByRole('button', { name: 'NPC' }).click();
}

test.describe('combat builder sync', () => {
  test('uses the core encounter as the shared source for builder and GM tabs', async ({ context }) => {
    const builder = await openCombatBuilder(context);
    const gm = await openGmTable(context);

    await openNpcRoster(gm);
    await expect(gm.locator('.player-roster-empty')).toContainText('NPC еще не добавлены.');

    await addRedOoze(builder);
    await expect(builder.locator('.combat-encounter-panel')).toContainText('1 противников');
    await expect(gm.locator('.player-roster__row').filter({ hasText: 'Алая Слизь' })).toBeVisible();

    const secondBuilder = await openCombatBuilder(context);
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('Алая Слизь');
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('1 противников');

    await secondBuilder.getByTitle('Увеличить').first().click();
    await expect(builder.locator('.combat-encounter-panel')).toContainText('2 противников');
    await expect(builder.locator('.combat-encounter-panel')).toContainText('x2');

    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();
    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();

    await expect(builder.locator('.combat-encounter-panel')).toContainText('0 противников');
    await expect(gm.locator('.player-roster-empty')).toContainText('NPC еще не добавлены.');
  });
});
