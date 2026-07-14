import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

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
  await openGmGame(page);
  await expect(page.locator('.player-view--gm')).toBeVisible();
  await expect(page.getByLabel('Контекст мастера')).toBeVisible();
  return page;
}

async function addRedOoze(page: Page): Promise<void> {
  await page.getByPlaceholder('Поиск...').fill('Алая Слизь');
  const redOoze = page.locator('article').filter({ hasText: 'Алая Слизь' }).first();
  await expect(redOoze).toBeVisible();
  await redOoze.getByTitle('Добавить в бой').click();
}

test.describe('combat builder sync', () => {
  test('uses the core encounter as the shared source for builder and the unified GM roster', async ({ context }) => {
    const builder = await openCombatBuilder(context);
    const gm = await openGmTable(context);

    await expect(gm.locator('.player-participant-feed__empty')).toContainText('Сцена пока пуста');

    await addRedOoze(builder);
    await expect(builder.locator('.combat-encounter-panel')).toContainText('1 противников');
    await expect(gm.locator('.player-combat-tracker__entry').filter({ hasText: 'Алая Слизь' })).toBeVisible();

    const secondBuilder = await openCombatBuilder(context);
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('Алая Слизь');
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('1 противников');

    await secondBuilder.getByTitle('Увеличить').first().click();
    await expect(builder.locator('.combat-encounter-panel')).toContainText('2 противников');
    await expect(builder.locator('.combat-encounter-panel')).toContainText('x2');

    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();
    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();

    await expect(builder.locator('.combat-encounter-panel')).toContainText('0 противников');
    await expect(gm.locator('.player-participant-feed__empty')).toContainText('Сцена пока пуста');
  });
});
