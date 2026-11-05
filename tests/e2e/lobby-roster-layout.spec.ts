import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { readStoredGameState } from './persistence-helpers';

for (const viewport of [
  { width: 2048, height: 901 },
  { width: 1024, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
]) {
  test(`imported 26-player lobby can scroll and open the game at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await openGmGame(page);
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
    await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры', exact: true }).click();
    await library.locator('input[type="file"][accept*=".dhworld"]').setInputFiles(resolve('tests/fixtures/qa-world/synthetic-coverage-world.dhworld'));
    await expect(library.getByText('Мир импортирован: synthetic-coverage-world.dhworld', { exact: true })).toBeVisible();
    await page.goto('/');
    const rows = page.locator('.role-entry__player-row');
    const open = page.getByRole('button', { name: 'Открыть игру', exact: true });
    // World archives carry characters; player seats are session setup.
    for (let index = 0; index < 26; index++) {
      await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    }
    await expect(rows).toHaveCount(26);
    await expect(page.getByText('QA все поддерживаемые подклассы', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('lobby-before-scroll.png') });
    await info.attach('lobby-scroll-metrics', { body: JSON.stringify(await page.locator('.role-entry').evaluate(el => {
      const result = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const box = node.getBoundingClientRect();
        result.push({ name: node.className, height: box.height, client: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY });
      }
      return result;
    }), null, 2), contentType: 'application/json' });
    // Use a real wheel gesture: locator.click() alone can programmatically scroll
    // overflow:hidden ancestors and conceal a broken human navigation path.
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 10000);
    await expect(rows.last()).toBeInViewport();
    await expect(open).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    if (viewport.width > 920) {
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await page.locator('.role-entry').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    } else {
      expect(await page.locator('.role-entry').evaluate(el => el.scrollTop)).toBe(0);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: info.outputPath('lobby-after-scroll.png') });
    await expect.poll(async () => Object.values((await readStoredGameState(page)).sceneTable.participants).filter(seat => seat.role === 'player').length).toBe(26);
    await open.click();
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.reload();
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
    // Returning and re-entering must keep the selected world and working scroll.
    await page.goto('/');
    await expect(rows).toHaveCount(26);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 10000);
    await expect(open).toBeInViewport();
    await open.click();
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
  });
}
