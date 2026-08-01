import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectHorizontallyInsideViewport(page: Page, locator: Locator, tolerance = 1): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-tolerance);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + tolerance);
}

async function expectNoHorizontalDocumentScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    doc: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  expect(overflow.doc).toBeLessThanOrEqual(overflow.viewport);
}

test.describe('mobile card creator workspace', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps cards search, header, preview, and tools within the viewport', async ({ page }) => {
    await page.goto('/#/tools/cards');

    const root = page.locator('.tool-viewport--cards');
    const sidebar = root.locator('.sidebar');
    const search = root.locator('.dh-search-field');
    const workspace = root.locator('.workspace');
    const header = root.locator('.workspace__header');

    await expect(root).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(search).toBeVisible();
    await expect(workspace).toBeVisible();
    await expect(header).toBeVisible();
    await expectHorizontallyInsideViewport(page, sidebar);
    await expectHorizontallyInsideViewport(page, search);
    await expectHorizontallyInsideViewport(page, workspace);
    await expectHorizontallyInsideViewport(page, header);
    await expectNoHorizontalDocumentScroll(page);

    await root.locator('.template-card').first().click();

    const selection = root.locator('.workspace__selection');
    const preview = root.locator('.card-preview');
    const properties = root.locator('.properties-panel');

    await expect(selection).toBeVisible();
    await expect(preview).toBeVisible();
    await expect(properties).toBeVisible();
    await expectHorizontallyInsideViewport(page, selection);

    const typeSelect = root.locator('#card-type');
    await typeSelect.selectOption('community');
    await expect(typeSelect).toHaveValue('community');
    await expect(preview.locator('.card').first()).toHaveClass(/community/);
  });

  test('switches template category sections from the sidebar', async ({ page }) => {
    await page.goto('/#/tools/cards');

    const root = page.locator('.tool-viewport--cards');
    const category = (title: string) => root.locator('.template-group').filter({ hasText: title }).first();

    await expect(root).toBeVisible();
    await expect(category('Родословная').locator('.template-card')).toHaveCount(0);

    await category('Родословная').locator('.template-group__toggle').click();
    await expect(category('Родословная').locator('.template-card').first()).toBeVisible();

    await category('Сообщество').locator('.template-group__toggle').click();
    await expect(category('Сообщество').locator('.template-card').first()).toBeVisible();
  });
});
