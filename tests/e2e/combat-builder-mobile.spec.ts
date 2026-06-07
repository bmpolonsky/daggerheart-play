import { expect, test, type Page } from '@playwright/test';
import { expectInsideViewport, rect } from './layout-helpers';

async function openCombatBuilder(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/combat');
}

test.describe('Combat Builder mobile workspace', () => {
  test('keeps the adversary list usable while encounter controls collapse into a bottom sheet', async ({ page }) => {
    await openCombatBuilder(page);

    const viewport = page.locator('.tool-viewport--combat');
    const sheet = viewport.locator('.combat-encounter-sheet');
    const firstCard = viewport.locator('article').first();
    const addButton = firstCard.locator('button[title="Добавить в бой"]');

    await expect(firstCard).toBeVisible();
    await expect(addButton).toBeVisible();
    await expectInsideViewport(page, addButton);
    await expect(sheet).toBeHidden();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

    await addButton.click();
    await expect(sheet).toHaveClass(/translate-x-0/);
    await expect(sheet.getByText(/1 противников/).first()).toBeVisible();

    const openSheetBox = await rect(sheet);
    expect(openSheetBox.x).toBeGreaterThanOrEqual(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);

    await expectInsideViewport(page, addButton);
  });
});
