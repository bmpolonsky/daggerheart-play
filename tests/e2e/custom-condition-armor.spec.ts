import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { createDomainCard } from '../../src/domain/rules/factories';

async function openSyntheticSheet(page: Page, bareBones = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  character.level = 2;
  character.sheetCards = [];
  character.domainCards = [];
  character.conditions = [{ id: 'core-hidden', name: 'hidden' }];
  character.armor = {
    name: 'Тестовый доспех', equipped: true,
    baseMajor: 6, baseSevere: 13, score: 3, markedSlots: 2,
    feature: '', featureText: ''
  };
  character.thresholds = { major: 8, severe: 15 };
  if (bareBones) {
    character.level = 1;
    character.traits.strength = 2;
    character.armor = { ...character.armor, name: 'Стеганый доспех QA', baseMajor: 5, baseSevere: 11, markedSlots: 1 };
    character.thresholds = { major: 6, severe: 12 };
    character.domainCards = [createDomainCard({ sourceId: 'domain-card:bare-bones', name: 'Ничего лишнего', inLoadout: true })];
  }
  await importGameDocument(page, document, 'custom-condition-armor.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click({ position: { x: 18, y: 28 } });
  const sheet = page.getByLabel('Персонаж игрока');
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('manual custom conditions and armor equipment', () => {
  test.describe.configure({ timeout: 90_000 });

  test('creates and edits manual description/removal reminder without changing core status', async ({ page }) => {
    const sheet = await openSyntheticSheet(page);
    const hidden = sheet.getByRole('button', { name: 'Снять состояние Скрыт', exact: true });
    await expect(hidden).toBeVisible();
    await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
    await sheet.getByRole('menuitem', { name: 'Своё состояние', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Пользовательское состояние', exact: true });
    await create.getByLabel('Название состояния', { exact: true }).fill('Обморожение');
    await create.getByLabel('Описание состояния', { exact: true }).fill('Пальцы онемели от холода.');
    await create.getByLabel(/^Условие снятия/).fill('Согреться у костра.');
    await expect(create).toContainText('состояние снимается вручную');
    await create.getByRole('button', { name: 'Сохранить состояние', exact: true }).click();
    await expect(create).toHaveCount(0);
    await expect(hidden).toBeVisible();

    await sheet.getByRole('button', { name: 'Изменить состояние Обморожение', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Изменить состояние', exact: true });
    await expect(edit.getByLabel('Описание состояния', { exact: true })).toHaveValue('Пальцы онемели от холода.');
    await expect(edit.getByLabel(/^Условие снятия/)).toHaveValue('Согреться у костра.');
    await edit.getByLabel('Название состояния', { exact: true }).fill('Остаточный холод');
    await edit.getByLabel('Описание состояния', { exact: true }).fill('Осталась дрожь.');
    await edit.getByLabel(/^Условие снятия/).fill('Завершить отдых.');
    await edit.getByRole('button', { name: 'Сохранить состояние', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Изменить состояние Обморожение', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Изменить состояние Остаточный холод', exact: true }).click();
    await expect(edit.getByLabel('Описание состояния', { exact: true })).toHaveValue('Осталась дрожь.');
    await expect(edit.getByLabel(/^Условие снятия/)).toHaveValue('Завершить отдых.');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await sheet.getByRole('button', { name: 'Снять состояние Остаточный холод', exact: true }).click();
    await expect(hidden).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Изменить состояние Остаточный холод', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
    await sheet.getByRole('menuitem', { name: 'Обездвижен', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Снять состояние Обездвижен', exact: true })).toBeVisible();
    await expect(hidden).toBeVisible();
  });

  test('unequipping uses unarmored thresholds while preserving the armor name and marked slots', async ({ page }) => {
    const sheet = await openSyntheticSheet(page);
    const thresholds = sheet.getByLabel('Пороги урона');
    const armorPips = sheet.getByRole('group', { name: 'Броня', exact: true }).getByRole('button');
    await expect(thresholds).toContainText('8+');
    await expect(thresholds).toContainText('15+');
    await expect(armorPips).toHaveCount(3);
    await expect(armorPips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Инвентарь', exact: true }).click();
    await expect(sheet.getByText('Тестовый доспех', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Снять броню', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Надеть броню', exact: true })).toBeVisible();
    await expect(sheet.getByText('Тестовый доспех', { exact: true })).toBeVisible();
    await expect(thresholds).toContainText('2+');
    await expect(thresholds).toContainText('4+');
    await expect(armorPips).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Надеть броню', exact: true }).click();
    await expect(thresholds).toContainText('8+');
    await expect(thresholds).toContainText('15+');
    await expect(armorPips).toHaveCount(3);
    await expect(armorPips.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(armorPips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(armorPips.nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expect(sheet.getByText('Тестовый доспех', { exact: true })).toBeVisible();
  });

  test('an unequipped item does not claim the character defenses supplied by Bare Bones', async ({ page }) => {
    const sheet = await openSyntheticSheet(page, true);
    const item = sheet.locator('.dh-list-item').filter({ hasText: 'Стеганый доспех QA' });
    await sheet.getByRole('button', { name: 'Снять броню', exact: true }).click();
    await expect(sheet.getByLabel('Пороги урона')).toContainText('10+');
    await expect(sheet.getByLabel('Пороги урона')).toContainText('20+');
    await expect(sheet.getByRole('group', { name: 'Броня', exact: true }).getByRole('button')).toHaveCount(5);
    await expect(item).toContainText('Не надета');
    await expect(item).not.toContainText('Пороги');
    await item.locator('button').first().click();
    const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
    await expect(preview).toContainText('Не надета');
    await expect(preview).not.toContainText('Пороги 10 / 20');
  });
});

test('armor fine-tuning explains replacement and base edits actually recalculate stored thresholds', async ({ page }) => {
  const sheet = await openSyntheticSheet(page);
  await sheet.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Редактор персонажа', exact: true });
  const edit = editor.getByRole('button', { name: 'Редактировать', exact: true });
  if (await edit.isVisible()) await edit.click();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
  const fineTune = editor.locator('details').filter({ has: editor.locator('summary', { hasText: 'Тонкая настройка брони и порогов' }) });
  await fineTune.locator('summary').click();
  await expect(fineTune).toContainText('Правка базы пересчитывает пороги: база + уровень.');
  await expect(fineTune).toContainText('Выбор доспеха из каталога заменяет название, источник, базы, показатель и свойство');
  await expect(fineTune).toContainText('Надеть/снять сохраняет предмет и его отметки');
  const major = fineTune.getByLabel('Порог Ощутимого урона', { exact: true });
  await major.fill('25'); await major.press('Tab');
  await expect(major).toHaveValue('25');
  const base = fineTune.getByLabel('База Ощутимого', { exact: true });
  await base.fill('9'); await base.press('Tab');
  await expect(major).toHaveValue('11');
  await expect(fineTune.getByLabel('Показатель Брони', { exact: true })).toHaveValue('3');
});
