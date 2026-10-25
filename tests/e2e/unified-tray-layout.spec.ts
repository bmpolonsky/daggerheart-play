import { expect, test, type Page } from '@playwright/test';
import { createExperience, createWeapon } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { expectInsideViewport } from './layout-helpers';

async function openActionTray(page: Page) {
  await page.setViewportSize({ width: 1188, height: 780 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const actor = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  actor.experiences = Array.from({ length: 12 }, (_, index) => ({ ...createExperience(`QA опыт ${index + 1}`, 2), id: `qa-exp-${index}` }));
  actor.weapons = [createWeapon({ name: 'Короткий Посох', trait: 'instinct', damageFormula: '1d8+1', damageType: 'magic' }), createWeapon({ name: 'Короткий Меч', damageFormula: '1d8+2' })];
  await importGameDocument(page, document, 'unified-layout.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  const row = page.getByLabel('Персонаж игрока').locator('#player-sheet-actions .dh-list-item').filter({ hasText: 'Короткий Посох' });
  await row.getByRole('button', { name: 'Атака', exact: true }).click();
  return { tray: page.getByRole('region', { name: 'Подготовка броска', exact: true }), row };
}

test('desktop tray anchors above Dice, clamps after growing and resizing, and leaves weapon text readable', async ({ page }, testInfo) => {
  const { tray, row } = await openActionTray(page);
  const dice = page.getByRole('button', { name: 'Скрыть панель костей', exact: true });
  await expect.poll(async () => {
    const panel = await tray.boundingBox(); const anchor = await dice.boundingBox();
    return panel && anchor ? Math.abs(anchor.y - panel.y - panel.height - 10) : 1000;
  }).toBeLessThan(3);
  await expect(row.locator('.dh-list-item__title')).toHaveCSS('text-overflow', 'clip');
  await expect(row.locator('.dh-list-item__subtitle')).toHaveCSS('text-overflow', 'clip');
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Убрать кость Страха', exact: true })).toBeVisible();
  const before = (await tray.boundingBox())!;
  const lock = (await tray.getByRole('button', { name: 'Приватный бросок', exact: true }).boundingBox())!;
  await page.mouse.move(lock.x + lock.width / 2, lock.y + lock.height / 2);
  await page.mouse.down(); await page.mouse.move(lock.x + 30, lock.y + 25); await page.mouse.up();
  expect(Math.abs((await tray.boundingBox())!.x - before.x)).toBeLessThan(2);
  expect(Math.abs((await tray.boundingBox())!.y - before.y)).toBeLessThan(2);
  await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
  await tray.getByRole('checkbox', { name: 'QA опыт 1 +2', exact: true }).check();
  await expectInsideViewport(page, tray);
  await expect.poll(async () => {
    const panel = (await tray.boundingBox())!; const anchor = (await dice.boundingBox())!;
    return panel.y + panel.height <= anchor.y - 8;
  }).toBe(true);
  await page.setViewportSize({ width: 1000, height: 620 });
  await expectInsideViewport(page, tray);
  const footer = tray.getByRole('region', { name: 'Итог броска', exact: true });
  await expectInsideViewport(page, footer);
  await expectInsideViewport(page, footer.getByRole('button', { name: 'Бросить', exact: true }));
  await footer.getByRole('button', { name: 'Бросить', exact: true }).click({ trial: true });
  await page.screenshot({ path: testInfo.outputPath('tray-desktop-expanded.png') });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mobile tray stays fixed, scrolls internally and keeps submit reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const { tray } = await openActionTray(page);
    await page.setViewportSize(viewport);
    await expect(tray).toHaveClass(/floating-panel--mobile/);
    await expectInsideViewport(page, tray);
    await expect(page.getByTestId('dice-tray-drag-handle')).toHaveCount(0);
    await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
    await tray.getByRole('checkbox', { name: 'QA опыт 1 +2', exact: true }).check();
    const body = tray.locator('.unified-roll-composer__body');
    const scene = page.locator('.player-scene-stage__background');
    const sceneBefore = await scene.getAttribute('style');
    const pageBefore = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    const bodyBox = (await body.boundingBox())!;
    await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2);
    await page.mouse.wheel(0, 700);
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await scene.getAttribute('style')).toBe(sceneBefore);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(pageBefore);
    const footer = tray.getByRole('region', { name: 'Итог броска', exact: true });
    const submit = footer.getByRole('button', { name: 'Бросить', exact: true });
    await expectInsideViewport(page, footer);
    await expectInsideViewport(page, submit);
    await submit.click({ trial: true });
    await expectInsideViewport(page, tray);
    await page.screenshot({ path: testInfo.outputPath(`tray-mobile-${viewport.width}x${viewport.height}.png`) });
  });
}
