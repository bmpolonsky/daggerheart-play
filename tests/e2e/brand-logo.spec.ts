import { expect, test } from '@playwright/test';

for (const width of [1440, 768, 390, 320]) {
  test(`lobby brand remains visible without overlapping role tabs at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const logo = page.getByAltText('Daggerheart Play');
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const iconHref = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(new URL(await logo.getAttribute('src') ?? '', page.url()).pathname).toBe(new URL(iconHref ?? '', page.url()).pathname);
    const logoBox = await logo.boundingBox();
    const tabsBox = await page.getByLabel('Роль', { exact: true }).boundingBox();
    expect(logoBox?.width).toBe(32);
    expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(tabsBox!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Игрок', exact: true }).click();
    await expect(logo).toBeVisible();
    await page.getByRole('button', { name: 'Мастер', exact: true }).click();
    await expect(logo).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`lobby-brand-${width}.png`), fullPage: true });
  });
}
