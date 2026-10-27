import { openUnifiedFormulaEditor } from './unified-formula-helpers';
import { expect, test, type Page } from '@playwright/test';
import { createExperience, createWeapon } from '../../src/domain/rules/factories';
import { parseDiceFormula } from '../../src/domain/rules/diceFormula';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

async function prepareAction(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  document.files['data/game.json'].autoApplyRollConsequences = false;
  const actor = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  actor.hope.value = 3;
  actor.traits.finesse = 2;
  actor.experiences = [{ ...createExperience('QA опыт', 2), id: 'qa-exp' }];
  actor.weapons = [createWeapon({ name: 'QA Платёж', trait: 'finesse', damageFormula: '1d6+3' })];
  await importGameDocument(page, document, 'unified-payment.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока');
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  await sheet.locator('#player-sheet-actions .dh-list-item').filter({ hasText: 'QA Платёж' }).getByRole('button', { name: 'Атака', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await openUnifiedFormulaEditor(tray);
  return { sheet, tray };
}

test('preparing and closing pays nothing; one typed submit pays one Hope for one experience', async ({ page }) => {
  const { sheet, tray } = await prepareAction(page);
  const hope = sheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]');
  await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
  await tray.getByRole('checkbox', { name: 'QA опыт +2', exact: true }).check();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('2d12+4');
  await expect(hope).toHaveCount(3);
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  await expect(hope).toHaveCount(3);
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(hope).toHaveCount(2);
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(1);
});

test('ordinary palette dice retain typed reaction, separate advantage, visible individual results and one experience payment', async ({ page }) => {
  const { sheet, tray } = await prepareAction(page);
  await tray.getByRole('button', { name: 'Реакция', exact: true }).click();
  await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
  await tray.getByRole('checkbox', { name: 'QA опыт +2', exact: true }).check();
  await tray.getByRole('button', { name: 'Преим.', exact: true }).click();
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await tray.getByRole('button', { name: 'Добавить d8', exact: true }).click();
  await tray.getByRole('button', { name: 'Убрать дополнительный d8', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('2d12+1d6+4+1d6');
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Убрать кость Страха', exact: true })).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Сделать ручным броском', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('region', { name: 'Итог броска' })).toContainText('1 Надежды');
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  const roll = page.locator('.player-activity-event--roll').first();
  await expect(roll).toContainText('Реакция');
  await expect(roll.locator('.feed-die-chip')).toHaveCount(4);
  await expect(sheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(1);
});

test('explicit manual conversion retains the existing advantage die and never silently charges typed costs', async ({ page }) => {
  const { sheet, tray } = await prepareAction(page);
  await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
  await tray.getByRole('checkbox', { name: 'QA опыт +2', exact: true }).check();
  await tray.getByRole('button', { name: 'Преим.', exact: true }).click();
  await tray.getByLabel('Модификатор', { exact: true }).fill('3');
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Сделать ручным броском', exact: true })).toHaveCount(0);
  await tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await expect(tray).toContainText('не списывает стоимость Опытов');
  await tray.getByRole('button', { name: 'Сделать ручным броском', exact: true }).click();
  const formula = await tray.getByLabel('Формула броска', { exact: true }).inputValue();
  const d6Count = parseDiceFormula(formula).reduce((sum, term) => sum + (term.kind === 'dice' && term.sides === 6 && term.sign === 1 ? term.count : 0), 0);
  expect(d6Count).toBe(2);
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('button', { name: 'Убрать кость Страха', exact: true })).toHaveCount(0);
  await expect(tray.getByRole('checkbox', { name: /QA опыт/ })).toHaveCount(0);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(1);
  await expect(page.locator('.player-activity-event--roll .feed-formula-dice .feed-die-chip')).toHaveCount(3);
  await expect(sheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(3);
});
