import { expect, test } from '@playwright/test';
import { filledCharacterName, filledCharacterResources, openFilledGmGame } from './filled-game-helpers';

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
    await levelUp.getByRole('button', { name: 'Улучшения' }).click();
    await expect(levelUp.getByText('Выбрано: 0 из 2')).toBeVisible();
    await expect(levelUp.getByText('Устаревшая ручная пометка')).toHaveCount(0);

    await levelUp.getByRole('button', { name: 'Добавить: +1 к Мастерству' }).click();
    await expect(levelUp.getByText('Выбрано: 2 из 2')).toBeVisible();
    await expect(levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Ран' })).toBeDisabled();
    await levelUp.getByRole('button', { name: 'Итог' }).click();
    await expect(levelUp.getByLabel('Мастерство')).toHaveValue('3');
    await levelUp.getByRole('button', { name: 'Улучшения' }).click();
    await levelUp.getByRole('button', { name: 'Убрать: +1 к Мастерству' }).click();
    await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Ран' }).click();
    await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Стресса' }).click();
    await expect(levelUp.getByText('Выбрано: 2 из 2')).toBeVisible();

    await levelUp.getByRole('button', { name: 'Итог' }).click();
    await expect(levelUp.getByLabel('Мастерство')).toHaveValue('2');
    await levelUp.getByRole('button', { name: 'Параметры' }).click();
    await expect(levelUp.getByLabel('Макс. Ран')).toBeDisabled();
    await expect(levelUp.getByLabel('Макс. Ран')).toHaveValue(String(filledCharacterResources.hp.max + 1));
    await expect(levelUp.getByLabel('Макс. Стресса')).toBeDisabled();
    await expect(levelUp.getByLabel('Макс. Стресса')).toHaveValue(String(filledCharacterResources.stress.max + 1));
    await levelUp.getByLabel('Новый Опыт +2').fill('Победитель алой слизи');

    await levelUp.getByRole('button', { name: 'Карта', exact: true }).click();
    const mandatoryCard = levelUp.getByLabel('Обязательная карта домена');
    await expect.poll(() => mandatoryCard.locator('option').count()).toBeGreaterThan(1);
    await mandatoryCard.selectOption({ index: 1 });

    await levelUp.getByRole('button', { name: 'Проверка' }).click();
    await expect(levelUp.getByText('Все обязательные выборы заполнены, повышение соответствует правилам.')).toBeVisible();
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

  test('keeps rule bypass GM-only and requires an audit reason', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFilledGmGame(page);
    await page.getByRole('button', { name: 'Инструменты' }).click();
    const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
    await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    await workspace.getByLabel('Редактор персонажа').getByRole('button', { name: 'Новый уровень' }).click();

    const levelUp = page.getByRole('dialog', { name: 'Повышение уровня' });
    await levelUp.getByRole('button', { name: 'Проверка' }).click();
    const apply = levelUp.getByRole('button', { name: 'Применить повышение' });
    await expect(apply).toBeDisabled();
    await levelUp.locator('summary').filter({ hasText: 'Свободный режим мастера' }).click();
    await levelUp.getByLabel('Обойти строгие ограничения').check();
    await expect(apply).toBeDisabled();
    await levelUp.getByLabel('Причина обхода правил').fill('Перенос согласованного бумажного листа');
    await expect(apply).toBeEnabled();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });
});
