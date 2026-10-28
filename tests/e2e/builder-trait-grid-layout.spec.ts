import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

for (const width of [390, 760, 761, 1024, 1180, 1280, 1440]) {
  test(`trait labels and signed controls stay whole at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByRole('button', { name: /Создать героя/ }).first().click();
    const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
    await builder.getByRole('button', { name: 'Характеристики', exact: true }).click();
    await page.setViewportSize({ width, height: width === 1180 ? 757 : 900 });
    await page.evaluate(() => document.fonts.ready);
    const group = builder.getByRole('group', { name: 'Шаг: Характеристики', exact: true });
    const fields = group.getByRole('combobox');
    await expect(fields.first()).toHaveCSS('color-scheme', 'dark');
    await expect(fields.first().locator('option').first()).toHaveCSS('color', 'rgb(243, 234, 216)');
    await expect(fields.first().locator('option').first()).toHaveCSS('background-color', 'rgb(20, 27, 34)');
    // Computed theme checks do not claim native OS popup/real browser zoom acceptance.
    for (const field of await fields.all()) await field.selectOption('');
    await group.getByRole('combobox', { name: 'Влияние', exact: true }).selectOption('2');
    await group.getByRole('combobox', { name: 'Проворность', exact: true }).selectOption('2');
    await expect(group.getByRole('combobox', { name: 'Влияние', exact: true })).toHaveValue('');
    const metrics = await group.locator('.dh-stat').evaluateAll(cards => cards.map(card => {
      const label = card.querySelector('.dh-stat-label') as HTMLElement;
      const select = card.querySelector('select') as HTMLElement;
      const l = label.getBoundingClientRect(), c = card.getBoundingClientRect(), s = select.getBoundingClientRect();
      return { top: c.top, textWidth: label.scrollWidth, labelWidth: label.clientWidth, labelRight: l.right, cardRight: c.right, labelHeight: l.height, inputWidth: s.width, inputLeft: s.left, inputTop: s.top, labelBottom: l.bottom };
    }));
    expect(new Set(metrics.map(m => Math.round(m.top))).size).toBe(width <= 760 ? 3 : 2);
    for (const m of metrics) {
      expect(m.labelHeight).toBeLessThan(20);
      expect(m.textWidth).toBeLessThanOrEqual(m.labelWidth + 1);
      expect(m.labelRight).toBeLessThanOrEqual(m.cardRight);
      expect(m.inputWidth).toBeGreaterThanOrEqual(70);
      if (width > 600) expect(m.labelRight).toBeLessThanOrEqual(m.inputLeft);
    }
    expect(await page.locator('body').evaluate(e => e.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/home/codex/outputs/dh-condition-note-20261027/traits-grid-${width}.png` });
  });
}
