import { servedDreadContract } from './reviewed-dread-contract.mjs';
import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

for (const width of [1440, 390, 320]) {
  test(`reviewed Dread source filters remain usable at ${width}px`, async ({ page }) => {
    const contract = await servedDreadContract(page.request);
    await page.setViewportSize({ width, height: 900 });
    await installDeterministicP2PTransport(page);
    await page.goto('/#/library/compendium/classes');
    const workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    const sources = workspace.getByRole('group', { name: 'Источник материалов' });
    if (width === 1440) {
      await sources.getByRole('button', { name: 'Основная книга', exact: true }).click();
      await workspace.locator('.player-library-card').first().click();
      await expect(workspace.locator('.player-library-section')).toHaveClass(/detail-open/);
    }
    await sources.getByRole('button', { name: 'Hope & Fear', exact: true }).click();
    await expect(sources.getByRole('button', { name: 'Hope & Fear', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.locator('.player-library-card')).toHaveCount(4);
    for (const button of await sources.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: test.info().outputPath(`hf-classes-${width}.png`) });
    await page.goto('/#/library/compendium/domain-cards');
    const cards = workspace.locator('.player-library-card');
    await expect(cards).toHaveCount(contract.hfCards);
    await expect(cards.filter({ hasText: 'Ужас — Уровень' })).toHaveCount(contract.hfCards);
    if (contract.restricted) {
      await expect(workspace.locator('.player-library-source-notice')).toBeVisible();
      await expect(workspace.getByText('Ничего не найдено.', { exact: true })).toBeVisible();
    } else {
      await expect(cards.filter({ hasText: 'Глас ужаса' })).toBeVisible();
      await expect(workspace.locator('.player-library-source-notice')).toHaveCount(0);
      await expect(workspace.getByText('Ничего не найдено.', { exact: true })).toHaveCount(0);
    }
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({ path: test.info().outputPath(`hf-dread-cards-${width}.png`) });
    await sources.getByRole('button', { name: 'The Void', exact: true }).click();
    await expect(sources.getByRole('button', { name: 'The Void', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(contract.voidCards);
    if (contract.voidCards === 0) await expect(workspace.getByText('Ничего не найдено.', { exact: true })).toBeVisible();
    else await expect(cards.filter({ hasText: 'Глас ужаса' })).toBeVisible();
    await expect(workspace.locator('.player-library-source-notice')).toHaveCount(0);
    // The empty filtered view must retain usable space without horizontal overflow.
    expect((await workspace.locator('.player-library-workspace').boundingBox())!.height).toBeGreaterThan(200);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({ path: test.info().outputPath(`void-empty-cards-${width}.png`) });
    await sources.getByRole('button', { name: 'Hope & Fear', exact: true }).click();
    await expect(cards).toHaveCount(contract.hfCards);
  });
}
