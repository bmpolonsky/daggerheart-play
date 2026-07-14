import { expect, test, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { expectAbove, expectInsideViewport, expectLeftOf, expectNoOverlap, rect } from './layout-helpers';

async function openBuilder(page: Page): Promise<void> {
  await openGmGame(page);
  await page.getByRole('button', { name: 'Инструменты' }).click();
  const toolsModal = page.getByRole('dialog', { name: 'Рабочее пространство' });
  const tabs = toolsModal.getByRole('group', { name: 'Разделы рабочего пространства' });
  const charactersTab = tabs.getByRole('button', { name: 'Персонажи' });
  await charactersTab.evaluate((button) => {
    button.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  await charactersTab.dispatchEvent('click');
  await page.getByRole('button', { name: /Создать героя/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Новый герой' })).toBeVisible();
}

test.describe('character builder composition', () => {
  test('desktop keeps a focused two-column choice composition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBuilder(page);

    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    const nav = builder.getByRole('navigation', { name: 'Шаги создания' });
    const panel = builder.getByRole('region', { name: 'Шаг создания героя' });
    const stage = builder.getByLabel('Сводка героя');
    const workspace = builder.getByRole('region', { name: 'Выборы создания героя' });
    const choiceDetail = builder.getByLabel('Описание выбора');
    const choiceArea = builder.getByRole('group', { name: 'Шаг: Класс' });
    const actions = builder.getByRole('toolbar', { name: 'Действия создания героя' });

    await expect(choiceDetail).toBeVisible();
    await expectInsideViewport(page, builder);
    await expectAbove(nav, panel, 4);
    await expectAbove(stage, workspace, 4);
    await expectAbove(workspace, actions, 4);
    await expectLeftOf(choiceArea, choiceDetail, 4);
  });

  test('mobile keeps builder surfaces stacked and compact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBuilder(page);

    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    const stage = builder.getByLabel('Сводка героя');
    const workspace = builder.getByRole('region', { name: 'Выборы создания героя' });
    const actions = builder.getByRole('toolbar', { name: 'Действия создания героя' });
    const choiceDetail = builder.getByLabel('Описание выбора');

    await builder.getByRole('button', { name: 'Быстрый старт' }).click();
    await builder.getByRole('button', { name: 'Карты' }).click();
    const choiceArea = builder.getByRole('group', { name: 'Шаг: Стартовые карты доменов' });
    await expect(choiceDetail).toBeVisible();
    await expectInsideViewport(page, builder);
    await expectInsideViewport(page, choiceDetail);
    await expectNoOverlap(choiceArea, choiceDetail, 2);
    await expectAbove(stage, workspace, 4);
    await expectAbove(workspace, actions, 4);
    expect((await rect(choiceArea)).height).toBeGreaterThanOrEqual(160);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('tablet width keeps builder readable without clipping ancestry cards', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1200 });
    await openBuilder(page);

    await page.getByLabel('Родословная').click();
    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    const choiceDetail = builder.getByLabel('Описание выбора');
    const ancestryStep = builder.getByRole('group', { name: 'Шаг: Родословная' });
    const firstCard = ancestryStep.getByRole('button').first();
    const firstCardBody = firstCard.locator('span').last();

    await expectInsideViewport(page, builder);
    await firstCard.click();
    await expect(choiceDetail).toBeVisible();
    await expectLeftOf(ancestryStep, choiceDetail, 4);
    await expect(firstCard).toBeVisible();
    const cardBox = await rect(firstCard);
    const bodyBox = await rect(firstCardBody);
    expect(bodyBox.bottom).toBeLessThanOrEqual(cardBox.bottom + 1);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1024);
  });

  test('small mobile keeps every wizard choice area usable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openBuilder(page);

    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    await builder.getByRole('button', { name: 'Быстрый старт' }).click();
    for (const stepLabel of ['Подкласс', 'Экипировка', 'Карты']) {
      await builder.getByRole('button', { name: stepLabel }).click();
      const choiceArea = builder.getByRole('group', { name: `Шаг: ${stepLabel === 'Экипировка' ? 'Стартовая экипировка' : stepLabel === 'Карты' ? 'Стартовые карты доменов' : stepLabel}` });
      await expect(choiceArea).toBeVisible();
      expect((await rect(choiceArea)).height, `${stepLabel} choice area should remain usable`).toBeGreaterThanOrEqual(145);
      await expectInsideViewport(page, builder);
    }
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 360);
  });
});
