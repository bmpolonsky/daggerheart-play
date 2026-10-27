import { openUnifiedFormulaEditor } from './unified-formula-helpers';
import { expect, test } from '@playwright/test';
import { createWeapon } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

test('PC card and weapon commands prepare the same editable bottom tray without rolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  character.proficiency = 2;
  character.domainCards[0] = { ...character.domainCards[0], text: 'Восстановите 1d4 Ран.' };
  character.weapons = [createWeapon({ name: 'Тестовый кинжал', damageFormula: '1d6+3' })];
  await importGameDocument(page, document, 'roll-confirmation.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока');
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  await sheet.locator('.dh-list-item').filter({ hasText: 'Заклинание 1' }).click();
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  const rollCount = await page.locator('.player-activity-event--roll').count();
  await preview.getByRole('button', { name: '1d4', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await openUnifiedFormulaEditor(tray);
  await expect(tray).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toContainText(filledCharacterName);
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('1d4');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(rollCount);
  await expect(preview.locator('.feed-domain-card')).toContainText('Заклинание 1');
  await expect(page.getByLabel('Подтверждение броска', { exact: true })).toHaveCount(0);
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue(/1d4.*1d6/);
  // The persistent tray is above the card. Move it aside with its actual
  // handle before using the card again, rather than clicking through it.
  const visibleHandle = page.getByTitle('Перетащите панель за заголовок', { exact: true });
  await expect(visibleHandle.locator('svg')).toBeVisible();
  const handle = (await visibleHandle.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 12);
  await page.mouse.down();
  await page.mouse.move(200, 220, { steps: 8 });
  await page.mouse.up();
  await expect(preview).toBeVisible();
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(rollCount);
  await preview.getByRole('button', { name: '1d4', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Оставить текущий', exact: true })).toBeVisible();
  await tray.getByRole('button', { name: 'Оставить текущий', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue(/1d4.*1d6/);
  await tray.getByLabel('Формула броска', { exact: true }).fill('1d4');
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(preview.locator('.feed-domain-card')).toContainText('Заклинание 1');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(rollCount + 1);
  await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();

  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  await sheet.locator('#player-sheet-actions .dh-list-item').filter({ hasText: 'Тестовый кинжал' }).getByRole('button', { name: 'Урон', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('2d6+3');
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeVisible();
  await expect(page.getByLabel('Подтверждение броска', { exact: true })).toHaveCount(0);
});
