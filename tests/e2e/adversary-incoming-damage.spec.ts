import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledAdversaryName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`incoming adversary damage previews actual wounds and applies once ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await openGmGame(page);
    const document = createPopulatedGameDocument();
    const adversary = document.files['data/encounter.json'].adversaries['e2e-adversary-ooze'];
    adversary.thresholds = { major: 7, severe: 14 };
    adversary.hp = { marked: 0, max: 4 };
    await importGameDocument(page, document, 'incoming-damage-synthetic.dhgame');
    const layers = page.getByLabel('Слой интерфейса');
    if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
    await page.getByRole('button', { name: filledAdversaryName, exact: true }).first().click();
    if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
    const sheet = page.getByLabel('Противник мастера', { exact: true });
    const damage = sheet.locator('details').filter({ hasText: 'Входящий урон' });
    await damage.locator('summary').click();
    const input = damage.getByLabel('Полученный урон', { exact: true });
    await input.fill('10');
    await expect(damage).toContainText('Ран к отметке: 2. Раны: 0 → 2 из 4.');
    await page.screenshot({ path: testInfo.outputPath(`incoming-damage-${viewport.width}.png`) });
    await damage.getByRole('button', { name: 'Применить урон', exact: true }).click();
    await expect(damage.getByRole('status')).toContainText('Отмечено Ран: 2 (2/4)');
    await expect(input).toHaveValue('');
    await expect(damage.getByRole('button', { name: 'Применить урон', exact: true })).toBeDisabled();
    await input.fill('20');
    await expect(damage).toContainText('Ран к отметке: 2. Раны: 2 → 4 из 4.');
    await damage.getByRole('button', { name: 'Применить урон', exact: true }).click();
    await expect(damage.getByRole('status')).toContainText('Отмечено Ран: 2 (4/4)');
    await expect(sheet.getByRole('button', { name: 'Снять состояние Побеждён', exact: true })).toBeVisible();
    await input.fill('-1');
    await expect(damage.getByRole('button', { name: 'Применить урон', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Подготовка броска', exact: true })).toHaveCount(0);
  });
}
