import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) test(`starting traits preserve slots, navigation and keyboard ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await openFilledGmGame(page);
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
  await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
  await builder.getByRole('button', { name: 'Характеристики', exact: true }).click();
  const group = builder.getByRole('group', { name: 'Шаг: Характеристики', exact: true });
  const labels = ['Проворность', 'Сила', 'Искусность', 'Инстинкт', 'Влияние', 'Знание'];
  const fields = labels.map((name) => group.getByRole('combobox', { name, exact: true }));
  for (const field of fields) {
    expect(await field.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(['', '2', '1', '0', '-1']);
  }
  // Start from explicit values, independent of random class recommendations.
  for (const field of fields) await field.selectOption('');
  for (let i = 0; i < fields.length; i++) await fields[i].selectOption(['0', '-1', '1', '0', '2', '1'][i]);
  // Zero also has two slots: use a free instance before clearing a stable owner.
  await fields[3].selectOption('');
  await fields[1].selectOption('0');
  await expect(fields[0]).toHaveValue('0');
  await expect(fields[3]).toHaveValue('');
  await fields[1].selectOption('-1');
  await fields[3].selectOption('0');
  await fields[5].selectOption('0');
  await expect(fields[0]).toHaveValue('');
  await expect(fields[3]).toHaveValue('0');
  await expect(fields[5]).toHaveValue('0');
  await expect(group.getByRole('status')).toContainText('Проворность');
  await fields[5].selectOption('1');
  await fields[0].selectOption('0');
  await fields[5].selectOption('');
  await fields[1].selectOption('1');
  await expect(fields[2]).toHaveValue('1');
  await expect(fields[4]).toHaveValue('2');
  await expect(fields[5]).toHaveValue('');
  const freeOutput = process.env.TRAIT_OUTPUT_DIR;
  if (freeOutput) {
    await mkdir(freeOutput, { recursive: true });
    await page.screenshot({ path: path.join(freeOutput, `free-slot-${viewport.width}x${viewport.height}.png`) });
  }
  await fields[1].selectOption('-1');
  await fields[5].selectOption('1');
  await fields[1].selectOption('2');
  await expect(fields[4]).toHaveValue('');
  await expect(group.getByRole('status')).toContainText('Влияние');
  await expect(fields[4].locator('..')).toContainText('Выберите значение');
  const output = process.env.TRAIT_OUTPUT_DIR;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `released-trait-${viewport.width}x${viewport.height}.png`) });
  }
  for (const field of fields) {
    const controlBox = (await field.boundingBox())!;
    const cardBox = (await field.locator('..').boundingBox())!;
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  }
  if (viewport.height < 500) {
    const scroller = group.locator('.dh-stat-grid');
    await scroller.hover(); await page.mouse.wheel(0, 400);
    await fields[5].click({ trial: true });
    if (output) await page.screenshot({ path: path.join(output, `last-trait-${viewport.width}x${viewport.height}.png`) });
    await page.mouse.wheel(0, -400);
  }
  await fields[1].selectOption('2');
  await expect(fields[0]).toHaveValue('0');
  await expect(fields[2]).toHaveValue('1');
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeDisabled();
  await builder.getByRole('button', { name: 'Характеристики', exact: true }).click();
  await expect(fields[4]).toHaveValue('');
  await fields[4].focus();
  await expect(fields[4]).toBeFocused();
  // Use native typeahead without depending on platform-specific popup keys.
  await page.keyboard.press('-');
  await expect(fields[4]).toHaveValue('-1');
  for (let i = 0; i < fields.length; i++) await expect(fields[i]).toHaveValue(['0', '2', '1', '0', '-1', '1'][i]);
  await expect(fields[4].locator('..')).not.toContainText('Выберите значение');
  await builder.getByRole('button', { name: 'Дальше', exact: true }).click();
  await builder.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(fields[4]).toHaveValue('-1');
  for (let i = 0; i < fields.length; i++) await expect(fields[i]).toHaveValue(['0', '2', '1', '0', '-1', '1'][i]);
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeEnabled();
});
