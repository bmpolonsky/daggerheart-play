import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument, openFilledGmGame } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createWeapon } from '../../src/domain/rules/factories';

const name = 'QA Рунический клинок';

test('weapon moves to read-only inventory and back without losing editable attack metadata', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  character.weapons = [createWeapon({
    id: 'qa-weapon-roundtrip', name, sourceId: 'custom-qa', sourceSlug: 'qa-runic', category: 'secondary',
    trait: 'finesse', range: 'Close', damageFormula: '2d8+3', damageType: 'mixed',
    burden: 'one-handed', featureText: 'Свойство QA клинка', notes: 'Отдельная заметка QA'
  })];
  character.inventory = [];
  await importGameDocument(page, document, 'weapon-equipment.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока');
  const unequip = sheet.getByRole('button', { name: `Снять оружие ${name}`, exact: true });
  await expect(unequip).toHaveCount(1);
  await unequip.click();
  await expect(unequip).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: `Надеть оружие ${name}`, exact: true })).toHaveCount(1);

  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByRole('navigation', { name: 'Ростер персонажей' }).getByRole('button', { name: filledCharacterName, exact: true }).click();
  const editor = library.getByRole('region', { name: 'Редактор персонажа' });
  await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
  await expect(editor.getByRole('button', { name: `Надеть оружие ${name}`, exact: true })).toHaveCount(1);
  await expect(editor.getByLabel('Количество', { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel('Название', { exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: `Надеть оружие ${name}`, exact: true }).click();
  await expect(editor.getByRole('button', { name: `Надеть оружие ${name}`, exact: true })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: `Снять оружие ${name}`, exact: true })).toHaveCount(1);
  const weaponEditor = editor.locator('details.character-editor-item').filter({ hasText: name });
  await expect(weaponEditor.getByLabel('Характеристика', { exact: true })).toHaveValue('finesse');
  await expect(weaponEditor.getByLabel('Урон', { exact: true })).toHaveValue('2d8+3');
  await expect(weaponEditor.getByLabel('Занятость', { exact: true })).toHaveValue('one-handed');
  await expect(weaponEditor.getByLabel('Источник', { exact: true })).toHaveValue('qa-runic');
  await expect(weaponEditor.getByLabel('Свойство', { exact: true })).toHaveValue('Свойство QA клинка');
});

test('wizard explicit no-secondary choice survives a two-handed primary and back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFilledGmGame(page);
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
  await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
  await builder.getByRole('button', { name: 'Экипировка', exact: true }).click();
  const equipment = builder.getByRole('group', { name: 'Шаг: Стартовая экипировка', exact: true });
  const sword = equipment.getByRole('button').filter({ has: page.getByText('Палаш', { exact: true }) });
  await sword.click();
  const none = equipment.getByRole('button', { name: 'Без второго оружия', exact: true });
  await none.click();
  await equipment.getByRole('button').filter({ has: page.getByText('Длинный Лук', { exact: true }) }).click();
  await expect(none).toHaveCount(0);
  await sword.click();
  await expect(none).toHaveClass(/dh-is-selected/);
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeEnabled();
});
