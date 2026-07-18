import { expect, test, type Page } from '@playwright/test';
import { createCharacter } from '../../src/domain/rules/factories';
import { openGmGame } from './game-route-helpers';
import { createPopulatedGameDocument, filledCharacterName, filledCharacterResources, importGameDocument, openFilledGmGame } from './filled-game-helpers';

async function chooseRichOption(page: Page, label: string, index = 0): Promise<void> {
  const trigger = page.getByRole('button', { name: label, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const picker = page.getByRole('dialog', { name: `Выбор: ${label}` });
  const options = picker.getByRole('option');
  const optionCount = await options.count();
  expect(optionCount).toBeGreaterThan(index);
  await options.nth(index).click();
  await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
}

async function chooseRichOptionByTitle(page: Page, label: string, title: string): Promise<void> {
  const trigger = page.getByRole('button', { name: label, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const picker = page.getByRole('dialog', { name: `Выбор: ${label}` });
  await picker.getByRole('option').filter({ hasText: title }).click();
  await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
}

test.describe('strict character level-up', () => {
  test('derives effects from weighted choices and applies only a complete valid level-up', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    const editor = workspace.getByLabel('Редактор персонажа');
    await editor.getByRole('button', { name: 'Новый уровень' }).click();

    const levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    await expect(levelUp).toBeVisible();
    await expect(levelUp.getByText('0 из 2 очков')).toBeVisible();
    await expect(levelUp.getByText('Устаревшая ручная пометка')).toHaveCount(0);
    await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Ран' }).click();
    await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Стресса' }).click();
    await expect(levelUp.getByText('2 из 2 очков')).toBeVisible();

    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await expect(levelUp.getByRole('group', { name: 'Шаг: Выборы' })).toBeVisible();
    await levelUp.getByLabel('Новый Опыт (+2)').fill('Победитель алой слизи');

    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await chooseRichOption(page, 'Обязательная карта домена');

    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await expect(levelUp.getByText('Всё готово к повышению.')).toBeVisible();
    const apply = levelUp.getByRole('button', { name: 'Применить повышение' });
    await expect(apply).toBeEnabled();
    await apply.click();

    await expect(levelUp).toHaveCount(0);
    await expect(editor.getByText(/уровень 2/i)).toBeVisible();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Ресурсы' }).click();
    await expect(editor.getByLabel('Макс. Ран')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Редактировать' }).click();
    await expect(editor.getByLabel('Макс. Ран')).toHaveValue(String(filledCharacterResources.hp.max + 1));
    await expect(editor.getByLabel('Макс. Стресса')).toHaveValue(String(filledCharacterResources.stress.max + 1));
  });

  test('keeps every advancement reachable in one mobile scroll owner without premature errors', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    await workspace.getByLabel('Редактор персонажа').getByRole('button', { name: 'Новый уровень' }).click();

    const levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    await expect(levelUp.getByRole('alert')).toHaveCount(0);
    const workspaceScroll = levelUp.getByLabel('Выборы повышения');
    await expect(workspaceScroll).toHaveCSS('overflow-y', 'auto');
    await workspaceScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(levelUp.getByText('+1 к Уклонению', { exact: true })).toBeVisible();
    await expect(levelUp.locator('summary').filter({ hasText: 'Свободный режим мастера' })).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('keeps the low desktop wizard compact and scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();

    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    await workspace.getByLabel('Редактор персонажа').getByRole('button', { name: 'Новый уровень' }).click();

    const levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    await levelUp.getByRole('button', { name: 'Добавить: +1 к двум неотмеченным характеристикам' }).click();
    await levelUp.getByRole('button', { name: 'Добавить: +1 к Уклонению' }).click();
    await levelUp.getByRole('button', { name: 'Дальше' }).click();

    const workspaceScroll = levelUp.getByLabel('Выборы повышения');
    const automaticNotice = levelUp.getByText(/Автоматически:/);
    await expect(automaticNotice).toBeVisible();
    expect(await automaticNotice.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(80);
    expect(await workspaceScroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await workspaceScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(levelUp.getByLabel('Новый Опыт (+2)')).toBeVisible();
    await expect(levelUp.getByRole('button', { name: 'Дальше' })).toBeVisible();
  });

  test('completes a dense rank transition, card exchange, and real multiclass journey', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openGmGame(page);
    const document = createPopulatedGameDocument();
    const characters = document.files['data/characters.json'];
    const original = characters.entities['e2e-character-cadsuane'];
    characters.entities[original.id] = createCharacter({
      ...original,
      level: 4,
      experiences: [
        { id: 'e2e-experience-one', name: 'Архивистка', modifier: 2 },
        { id: 'e2e-experience-two', name: 'Охотница за тайнами', modifier: 2 }
      ],
      advancement: {
        choiceUsesByRank: { 2: { hp: 2 } },
        markedTraits: [],
        multiclass: null
      }
    });
    await importGameDocument(page, document, 'e2e-level-up-rank-three.dhgame');

    await page.getByRole('button', { name: 'Инструменты' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    const editor = workspace.getByLabel('Редактор персонажа');
    await editor.getByRole('button', { name: 'Новый уровень' }).click();

    let levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    const rankSelect = levelUp.getByLabel('Отметки ранга');
    await rankSelect.selectOption('2');
    await expect(rankSelect).toHaveValue('2');
    await expect(rankSelect.locator('option:checked')).toHaveText('Ранг 2 — отмечено 2');
    await expect(levelUp.locator('.dh-list-item').filter({ hasText: 'Добавить ячейку Ран' })).toContainText('отметки закончились');
    await expect(levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Ран' })).toBeDisabled();
    await levelUp.getByRole('button', { name: 'Добавить: +1 к существующему Опыту' }).click();
    await rankSelect.selectOption('3');
    await levelUp.getByRole('button', { name: 'Добавить: Дополнительная карта домена' }).click();
    await levelUp.getByRole('button', { name: 'Дальше' }).click();

    await levelUp.getByLabel('Новый Опыт (+2)').fill('Победительница рощи');
    await levelUp.getByLabel('Увеличить Опыт — 1 из 2').selectOption('e2e-experience-one');
    await levelUp.getByLabel('Увеличить Опыт — 2 из 2').selectOption('e2e-experience-two');
    await levelUp.getByRole('button', { name: 'Дальше' }).click();

    await chooseRichOption(page, 'Обязательная карта домена');
    await chooseRichOption(page, 'Дополнительная карта домена 1', 1);
    await chooseRichOption(page, 'Заменить карту (необязательно)', 1);
    await chooseRichOption(page, 'Новая карта');
    await levelUp.getByRole('button', { name: 'Дальше' }).click();

    await expect(levelUp.getByText('Победительница рощи +2')).toBeVisible();
    await expect(levelUp.getByText('Архивистка')).toBeVisible();
    await expect(levelUp.getByText('Охотница за тайнами')).toBeVisible();
    await expect(levelUp.getByText(/Замена:/)).toBeVisible();
    await levelUp.getByRole('button', { name: 'Применить повышение' }).click();
    await expect(levelUp).toHaveCount(0);
    await expect(editor.getByText(/уровень 5/i)).toBeVisible();

    await editor.getByRole('button', { name: 'Новый уровень' }).click();
    levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    await levelUp.getByRole('button', { name: 'Добавить: Мультикласс' }).click();
    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await chooseRichOptionByTitle(page, 'Новый класс', 'Воин');
    await levelUp.getByLabel('Новый домен').selectOption('Blade');
    await chooseRichOption(page, 'Подкласс', 1);
    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await chooseRichOption(page, 'Карта домена мультикласса');
    await levelUp.getByRole('button', { name: 'Дальше' }).click();
    await expect(levelUp.locator('.dh-list-item__title').getByText('Мультикласс', { exact: true })).toBeVisible();
    await expect(levelUp.getByText('Особенности класса', { exact: true })).toBeVisible();
    await expect(levelUp.getByText('Карта подкласса', { exact: true })).toBeVisible();
    await levelUp.getByRole('button', { name: 'Применить повышение' }).click();
    await expect(levelUp).toHaveCount(0);
    await expect(editor.getByText(/уровень 6/i)).toBeVisible();
  });
});
