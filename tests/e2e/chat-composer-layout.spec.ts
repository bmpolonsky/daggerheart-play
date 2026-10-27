import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openGmGame, openPlayerGame } from './game-route-helpers';
const phase = process.env.CONTROL_POLISH_PHASE ?? 'after';
const output = process.env.CONTROL_POLISH_OUTPUT ?? '/tmp/control-polish';
for (const role of ['gm', 'player'] as const) for (const width of [1440, 390]) {
  test(`chat composer keeps aligned nested controls and submits once ${role} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    if (role === 'gm') await openGmGame(page); else await openPlayerGame(page);
    if (!await page.getByLabel('Чат игры', { exact: true }).isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
    const composer = page.locator('.player-chat-composer');
    const input = composer.getByRole('textbox'); const send = composer.getByRole('button', { name: 'Отправить сообщение', exact: true });
    await expect(composer).toBeVisible(); await expect(send).toBeDisabled();
    await mkdir(`${output}/${phase}`, { recursive: true });
    await composer.screenshot({ path: `${output}/${phase}/composer-${role}-${width}-empty.png` });
    const geometry = await composer.evaluate(el => {
      const button = el.querySelector('button')!; const outer = el.getBoundingClientRect(); const inner = button.getBoundingClientRect();
      return { outer: { width: outer.width, height: outer.height, radius: parseFloat(getComputedStyle(el).borderRadius) },
        button: { width: inner.width, height: inner.height, radius: parseFloat(getComputedStyle(button).borderRadius) },
        inset: { top: inner.top - outer.top, right: outer.right - inner.right, bottom: outer.bottom - inner.bottom } };
    });
    if (phase === 'after') {
      expect(geometry.outer.radius).toBeLessThan(geometry.outer.height / 2);
      expect(geometry.button.width).toBeGreaterThanOrEqual(32); expect(geometry.button.height).toBeGreaterThanOrEqual(32);
      expect(Math.abs(geometry.inset.top - geometry.inset.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.inset.bottom - geometry.inset.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.outer.radius - geometry.button.radius - geometry.inset.right)).toBeLessThanOrEqual(1);
      expect(geometry.outer.height).toBeLessThanOrEqual(46);
    }
    await input.fill('QA: сообщение'); await expect(send).toBeEnabled();
    await composer.screenshot({ path: `${output}/${phase}/composer-${role}-${width}-typed.png` });
    await send.click(); await expect(input).toHaveValue(''); await expect(send).toBeDisabled();
    if (role === 'gm') await expect(page.locator('.player-activity-event').filter({ hasText: 'QA: сообщение' })).toHaveCount(1);
    await input.fill('QA: Enter'); await input.press('Enter'); await expect(input).toHaveValue('');
    if (role === 'gm') await expect(page.locator('.player-activity-event').filter({ hasText: 'QA: Enter' })).toHaveCount(1);
    await writeFile(`${output}/${phase}/composer-${role}-${width}.json`, JSON.stringify({ phase, role, width, geometry,
      scope: role === 'gm' ? 'Local send click and Enter each create one event.' : 'Player presentation and intent clear only; transport delivery not re-proven by this CSS check.' }, null, 2));
  });
}
