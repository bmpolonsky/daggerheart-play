import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

test.use({ hasTouch: true });

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
  test(`long world picker scrolls without losing close control at ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
    await page.setViewportSize(viewport);
    await installDeterministicP2PTransport(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Мастер', exact: true }).click();
    await page.getByRole('button', { name: 'Сменить', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Игры', exact: true });
    for (let index = 0; index < 12; index++) {
      const create = dialog.getByRole('button', { name: 'Новый мир', exact: true });
      await create.click();
      await expect(create).toBeEnabled();
    }
    const list = dialog.locator('.role-entry__games-card > section[aria-label="Миры"]');
    const metrics = await list.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.height + 300);
    expect(metrics.overflowY).toBe('auto');
    if (browserName === 'chromium' && viewport.width < 900) {
      const bounds = (await list.boundingBox())!;
      const client = await page.context().newCDPSession(page);
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height * 0.8;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * bounds.height * 0.07 }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
    } else {
      await list.hover();
      await page.mouse.wheel(0, 1200);
    }
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    const close = dialog.getByRole('button', { name: 'Закрыть миры' });
    await expect(close).toBeInViewport();
    const bounds = await dialog.locator('.role-entry__games-dialog').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await close.click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Сменить', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await dialog.getByRole('button', { name: 'Открыть', exact: true }).last().click();
    await expect(dialog).toBeHidden();
  });
}
