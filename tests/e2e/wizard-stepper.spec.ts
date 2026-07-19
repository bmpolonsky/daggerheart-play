import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

test('shows complete wizard step names in a horizontally scrollable builder navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 760 });
  await openGmGame(page);
  await page.getByRole('button', { name: 'Инструменты' }).click();
  const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
  await workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name: 'Персонажи' }).click();
  await workspace.getByRole('button', { name: /Создать героя/ }).first().click();

  const builder = page.getByRole('dialog', { name: 'Новый герой' });
  const stepper = builder.locator('.cinematic-builder-stepper');
  const labels = stepper.locator('.dh-wizard-step-button > span:last-child');
  await expect(labels).toHaveCount(11);
  expect(await labels.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
  await expect.poll(() => stepper.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  const cardsStep = builder.getByLabel('Карты');
  await cardsStep.scrollIntoViewIfNeeded();
  await expect.poll(() => stepper.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await cardsStep.click();
  await expect(builder.getByRole('group', { name: 'Шаг: Стартовые карты доменов' })).toBeVisible();
});
