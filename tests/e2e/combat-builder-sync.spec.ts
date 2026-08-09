import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

async function openCombatBuilder(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/tools/combat');
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

async function waitForStoredEncounterSize(page: Page, size: number): Promise<void> {
  await expect.poll(() => page.evaluate(async () => {
    const project = await new Promise<any>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('documents', 'readonly');
        const read = transaction.objectStore('documents').get('current-game');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result);
        transaction.oncomplete = () => db.close();
      };
    });
    const activeGame = project?.games?.[project.activeGameId];
    return activeGame?.state?.encounter?.order?.length ?? -1;
  }), { timeout: 15_000 }).toBe(size);
}

test.describe('combat builder sync', () => {
  test('uses the core encounter as the shared source for builders and the unified GM roster', async ({ context }) => {
    const builder = await openCombatBuilder(context);

    await addRedOoze(builder);
    await expect(builder.locator('.combat-encounter-panel')).toContainText('1 противников');
    await waitForStoredEncounterSize(builder, 1);

    const gm = await openGmTable(context);
    const gmAdversary = gm.locator('.player-roster__item').filter({ hasText: 'Алая Слизь' });
    await expect(gmAdversary).toBeVisible();
    await expect(gmAdversary.getByRole('button', { name: 'Добавить Алая Слизь на сцену' })).toBeVisible();

    const secondBuilder = await openCombatBuilder(context);
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('Алая Слизь');
    await expect(secondBuilder.locator('.combat-encounter-panel')).toContainText('1 противников');

    await secondBuilder.getByTitle('Увеличить').first().click();
    await waitForStoredEncounterSize(secondBuilder, 2);
    await expect(builder.locator('.combat-encounter-panel')).toContainText('2 противников');
    await expect(builder.locator('.combat-encounter-panel')).toContainText('x2');

    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();
    await secondBuilder.getByTitle('Уменьшить / Удалить').first().click();
    await waitForStoredEncounterSize(secondBuilder, 0);

    await expect(builder.locator('.combat-encounter-panel')).toContainText('0 противников');
    await expect(gm.locator('.player-participant-feed__empty')).toContainText('Сцена пока пуста');
  });
});
