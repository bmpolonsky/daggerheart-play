import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { readStoredGameState } from './persistence-helpers';

const before = process.env.NEW_ROLL_PRIORITY_BEFORE === '1';
for (const width of [1180, 400, 320]) test(`new action replaces reset or edited preparation without executing at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await openGmGame(page);
  const doc = createPopulatedGameDocument();
  const hero = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.hope.value = 4; hero.traits.agility = 2; hero.traits.strength = -1;
  await importGameDocument(page, doc, 'new-roll-priority.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока');
  const agility = sheet.locator('.player-trait-grid').getByRole('button', { name: /^Проворность/ });
  const strength = sheet.locator('.player-trait-grid').getByRole('button', { name: /^Сила/ });
  await agility.click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  const close = () => tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  const showLayer = async (name: string) => {
    const layers = page.getByLabel('Слой интерфейса');
    if (await layers.isVisible()) await layers.getByRole('button', { name, exact: true }).click();
  };
  const count = await page.locator('.player-activity-event--roll').count();
  const initial = await readStoredGameState(page);
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await tray.getByRole('button', { name: 'Сбросить набор', exact: true }).click();
  await close(); await agility.click();
  await page.setViewportSize({ width, height: 757 });
  if (before) {
    await expect(tray.getByRole('button', { name: 'Заменить подготовленный бросок', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`new-intent-before-${width}.png`) }); return;
  }
  await expect(tray.getByRole('button', { name: 'Заменить подготовленный бросок', exact: true })).toHaveCount(0);
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12+2');
  await page.screenshot({ path: info.outputPath(`new-intent-after-${width}.png`) });
  // Close/reopen preserves preparation; choosing a different source action replaces it.
  await tray.getByLabel('Модификатор', { exact: true }).fill('3');
  await close(); await showLayer('Сцена'); await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12+5');
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('character:e2e-character-ran');
  await close(); await showLayer('Лист'); await strength.click();
  await expect(tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true })).toHaveValue('character:e2e-character-cadsuane');
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12-1');
  await tray.getByLabel('Модификатор', { exact: true }).fill('-');
  await close(); await agility.dblclick();
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12+2');
  await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('+0');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(count);
  const prepared = await readStoredGameState(page);
  expect(prepared.characters.entities[hero.id].hope).toEqual(initial.characters.entities[hero.id].hope);
  expect(prepared.characters.entities[hero.id].stress).toEqual(initial.characters.entities[hero.id].stress);
  expect(prepared.game.fear).toBe(initial.game.fear);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(count + 1);
});
