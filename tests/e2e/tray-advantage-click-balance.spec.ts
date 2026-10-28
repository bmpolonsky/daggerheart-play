import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
async function state(page: Page): Promise<any> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const library: any = await new Promise((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    const world = library.worlds[library.activeWorldId]; return world.games[world.activeGameId].state;
  });
}
for (const width of [1180, 390]) test(`advantage clicks cross zero and execute negative MAX at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await openGmGame(page);
  const document = createPopulatedGameDocument(); document.files['data/game.json'].autoApplyRollConsequences = false;
  await importGameDocument(page, document, 'advantage-balance.dhgame');
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('character:e2e-character-cadsuane');
  await tray.getByRole('combobox', { name: 'Характеристика броска', exact: true }).selectOption('presence');
  const positive = tray.getByRole('button', { name: /^Преимущество/ });
  const negative = tray.getByRole('button', { name: /^Помеха/ });
  await expect(tray.getByRole('button', { name: 'Несколько', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('spinbutton', { name: 'Источников преимущества или помехи', exact: true })).toHaveCount(0);
  const sequence = [1, 2, 3, 2, 1, 0, -1, -2, -1, 0, 1, 2, 3]; let previous = 0;
  for (const net of sequence) {
    await (net > previous ? positive : negative).click(); previous = net;
    await expect(positive).toHaveText(net > 1 ? `Преимущество ${net}` : 'Преимущество');
    await expect(negative).toHaveText(net < -1 ? `Помеха ${-net}` : 'Помеха');
    await expect(positive).toHaveAttribute('aria-pressed', String(net > 0));
    await expect(negative).toHaveAttribute('aria-pressed', String(net < 0));
    await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText(`2d12${net ? `${net > 0 ? '+' : '-'}${Math.abs(net)}d6kh1` : ''}`);
    if (net === 3 || net === -2 || net === 0) await page.screenshot({ path: info.outputPath(`ADV-balance-${net}-${width}.png`) });
  }
  for (let i = 0; i < 5; i++) await negative.click();
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => (await state(page)).rollLog.length).toBe(1);
  const roll = (await state(page)).rollLog[0];
  expect(roll.disadvantageRolls).toHaveLength(2); expect(roll.advantageRolls).toHaveLength(0);
  expect(roll.keptExtraDie).toBe(-Math.max(...roll.disadvantageRolls));
  expect(roll.total).toBe(roll.hopeDie + roll.fearDie + roll.keptExtraDie);
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: /^Чат/ }).click();
  const result = page.locator('.player-activity-event--roll').first();
  await result.getByRole('button', { name: 'Подробности броска', exact: true }).click();
  await expect(result).toContainText('2d6kh1');
  await expect(result).toContainText(`Учтено ${roll.keptExtraDie}`);
  await expect(result).toContainText('отброшено:');
  await page.screenshot({ path: info.outputPath(`ADV-negative-MAX-result-${width}.png`) });
});
