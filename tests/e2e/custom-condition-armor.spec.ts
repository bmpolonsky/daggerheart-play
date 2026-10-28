import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { createDomainCard } from '../../src/domain/rules/factories';

async function openSyntheticSheet(page: Page, bareBones = false, legacy = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  character.level = 2;
  character.sheetCards = [];
  character.domainCards = [];
  character.conditions = [{ id: 'core-hidden', name: 'hidden' }];
  if (legacy) character.conditions.push({ id: 'legacy-cold', name: 'Старый холод', notes: 'Болит рука', removalCondition: 'Согреться' });
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

  test('creates and edits optional notes without changing core status', async ({ page }) => {
    const sheet = await openSyntheticSheet(page);
    const hidden = sheet.getByRole('button', { name: 'Снять состояние Скрыт', exact: true });
    await expect(hidden).toBeVisible();
    await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
    await sheet.getByRole('menuitem', { name: 'Своё состояние', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Состояние', exact: true });
    await create.getByLabel('Название', { exact: true }).fill('Обморожение');
    await create.getByLabel('Заметка', { exact: true }).fill('Пальцы онемели от холода.');
    await expect(create.getByLabel(/^Условие снятия/)).toHaveCount(0);
    await expect(create).toContainText('Снятие вручную');
    await create.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(create).toHaveCount(0);
    await expect(hidden).toBeVisible();

    await sheet.getByRole('button', { name: 'Изменить состояние Обморожение', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Состояние', exact: true });
    await expect(edit.getByLabel('Заметка', { exact: true })).toHaveValue('Пальцы онемели от холода.');
    await expect(edit.getByLabel(/^Условие снятия/)).toHaveCount(0);
    await edit.getByLabel('Название', { exact: true }).fill('Остаточный холод');
    await edit.getByLabel('Заметка', { exact: true }).fill('Осталась дрожь.');

    await edit.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Изменить состояние Обморожение', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Изменить состояние Остаточный холод', exact: true }).click();
    await expect(edit.getByLabel('Заметка', { exact: true })).toHaveValue('Осталась дрожь.');
    await edit.getByLabel('Заметка', { exact: true }).fill('Несохранённый текст');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await sheet.getByRole('button', { name: 'Изменить состояние Остаточный холод', exact: true }).click();
    await expect(edit.getByLabel('Заметка', { exact: true })).toHaveValue('Осталась дрожь.');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await sheet.getByRole('button', { name: 'Снять состояние Остаточный холод', exact: true }).click();
    await expect(hidden).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Изменить состояние Остаточный холод', exact: true })).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
    await sheet.getByRole('menuitem', { name: 'Обездвижен', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Снять состояние Обездвижен', exact: true })).toBeVisible();
    await expect(hidden).toBeVisible();
  });


  test('legacy description and removal text remain visible, cancel is harmless and save does not duplicate them', async ({ page }) => {
    const sheet = await openSyntheticSheet(page, false, true);
    await sheet.getByRole('button', { name: 'Изменить состояние Старый холод', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Состояние', exact: true });
    const note = edit.getByLabel('Заметка', { exact: true });
    await expect(note).toHaveValue('Болит рука\n\nУсловие снятия: Согреться');
    await page.screenshot({ path: '/home/codex/outputs/dh-condition-copy-20261028/legacy-editor.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(edit).toBeInViewport();
    await page.screenshot({ path: '/home/codex/outputs/dh-condition-copy-20261028/legacy-editor-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await note.fill('Не сохранять');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await sheet.getByRole('button', { name: 'Изменить состояние Старый холод', exact: true }).click();
    await expect(note).toHaveValue('Болит рука\n\nУсловие снятия: Согреться');
    await edit.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await sheet.getByRole('button', { name: 'Изменить состояние Старый холод', exact: true }).click();
    await expect(note).toHaveValue('Болит рука\n\nУсловие снятия: Согреться');
    await edit.getByRole('button', { name: 'Отмена', exact: true }).click();
    await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
    await sheet.getByRole('menuitem', { name: 'Своё состояние', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Состояние', exact: true });
    await create.getByLabel('Название', { exact: true }).fill('Без заметки');
    await create.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Снять состояние Без заметки', exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Снять состояние Старый холод', exact: true }).click();
    await expect(sheet.getByRole('button', { name: 'Снять состояние Скрыт', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Редактор персонажа', exact: true });
  const edit = editor.getByRole('button', { name: 'Редактировать', exact: true });
  if (await edit.isVisible()) await edit.click();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
  const fineTune = editor.locator('details').filter({ hasText: 'Тонкая настройка брони и порогов' });
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
