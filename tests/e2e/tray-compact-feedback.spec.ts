import { chooseUnifiedAdvantage } from './unified-formula-helpers';
import { expect, test } from '@playwright/test';
import { createExperience } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

for (const viewport of [{ width: 1180, height: 757 }, { width: 390, height: 844 }]) {
  test(`compact experience rows, evaluation hint and unobtrusive success at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGmGame(page);
    const doc = createPopulatedGameDocument();
    const actor = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
    actor.spellcastTrait = 'instinct'; actor.traits.instinct = 0; actor.hope.value = 3;
    actor.experiences = [createExperience('Искатель приключений', 2), createExperience('Верный товарищ', 2)];
    await importGameDocument(page, doc, 'compact-feedback.dhgame');
    const layers = page.getByLabel('Слой интерфейса');
    if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
    const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
    await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('character:e2e-character-cadsuane');
    await tray.getByRole('combobox', { name: 'Характеристика броска', exact: true }).selectOption('instinct');
    await tray.getByRole('button', { name: 'Реакция', exact: true }).click();
    await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
    const experience = tray.getByRole('checkbox', { name: 'Искатель приключений +2', exact: true });
    await experience.check();
    const row = experience.locator('..');
    const metrics = await row.evaluate(el => ({ font: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height }));
    expect(metrics.font).toBeLessThanOrEqual(12);
    expect(metrics.height).toBeGreaterThanOrEqual(viewport.width < 600 ? 40 : 32);
    await expect(tray).toContainText('Цена опыта: 1 Надежды');
    await expect(tray).not.toContainText('Костей:');
    await chooseUnifiedAdvantage(tray, 'advantage', 3);
    await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText(/3d6kh1$/);
    await expect(tray.getByRole('button', { name: 'Убрать преимущество', exact: true })).toContainText('3×d6');
    await page.screenshot({ path: `/home/codex/outputs/dh-condition-note-20261027/tray-compact-${viewport.width}.png` });
    await chooseUnifiedAdvantage(tray, 'advantage', 0);
    await expect(tray.locator('.unified-roll-pool-count')).toHaveCount(0);
    await tray.getByLabel('Модификатор', { exact: true }).fill('abc');
    await expect(tray).toContainText('Введите целый модификатор.');
    await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
    await tray.getByLabel('Модификатор', { exact: true }).fill('0');
    const before = await page.locator('.player-activity-event--roll').count();
    await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
    await expect(page.locator('.player-activity-event--roll')).toHaveCount(before + 1);
    await expect(tray).not.toContainText('Бросок выполнен.');
    await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeEnabled();
  });
}
