import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

test('unavailable WebGL falls back to die values and reveals the already computed result', async ({ page }) => {
  const graphicsErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (/webgl|renderer|context/i.test(error.message)) graphicsErrors.push(error.message);
  });
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as unknown as { getContext: (type: string, ...args: unknown[]) => unknown };
    const original = prototype.getContext;
    prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/webgl/i.test(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  await openGmGame(page);
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(page.locator('.polyhedral-dice-fallback')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(1);
  await expect(page.locator('.player-activity-event.dh-is-rolling')).toHaveCount(0, { timeout: 1000 });
  await expect(page.locator('.polyhedral-dice-fallback span')).toHaveCount(1);
  expect(graphicsErrors).toEqual([]);
});
