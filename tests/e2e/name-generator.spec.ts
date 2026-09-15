import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
  test(`names: filters, clipboard and settlements at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { window.sessionStorage.setItem('copied-names', text); }
      } });
    });
    await openGmGame(page);
    if (viewport.width < 600) await page.getByLabel('Слой интерфейса').getByRole('button', { name: /^Чат/ }).click();
    await page.getByRole('button', { name: 'Имена и названия', exact: true }).click();
    const generator = page.getByRole('region', { name: 'Генератор имён и названий' });
    const rows = generator.getByRole('listitem');
    await expect(rows).toHaveCount(10);
    await expect(page).toHaveURL(/#\/library\/names$/);
    const expectResultsFit = async () => {
      expect(await generator.evaluate((el) => el.parentElement!.scrollHeight <= el.parentElement!.clientHeight)).toBe(true);
      const listBounds = await generator.getByRole('list', { name: 'Варианты имён' }).boundingBox();
      expect(listBounds!.y + listBounds!.height).toBeLessThanOrEqual(viewport.height - (viewport.width < 600 ? 82 : 28));
    };
    await expectResultsFit();
    if (viewport.width < 600) {
      await expect(page.getByRole('region', { name: 'Бросок костей' })).toBeHidden();
      await rows.last().getByRole('button', { name: /^Скопировать / }).click();
      const lastBounds = await rows.last().boundingBox();
      expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(viewport.height - 82);
    }
    await generator.getByRole('combobox', { name: 'Стиль', exact: true }).selectOption('scandinavian');
    await generator.getByRole('combobox', { name: 'Род', exact: true }).selectOption('female');
    const styleField = generator.getByRole('combobox', { name: 'Стиль', exact: true });
    const styleBounds = (await styleField.boundingBox())!;
    const genderBounds = (await generator.getByRole('combobox', { name: 'Род', exact: true }).boundingBox())!;
    if (viewport.width === 320) expect(genderBounds.y).toBeGreaterThanOrEqual(styleBounds.y + styleBounds.height);
    if (viewport.width === 1280 || viewport.width === 390) expect(styleBounds.y).toBe(genderBounds.y);
    await page.evaluate(() => document.fonts.ready);
    const textFits = await styleField.evaluate((el) => {
      const style = getComputedStyle(el);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const textWidth = context.measureText((el as HTMLSelectElement).selectedOptions[0]!.text).width;
      return textWidth <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20;
    });
    expect(textFits).toBe(true);
    const plainNames = await rows.allTextContents();
    await generator.getByLabel('С фамилией или отчеством').check();
    const fullNames = await rows.allTextContents();
    expect(fullNames.every((name, index) => name.startsWith(plainNames[index] + ' '))).toBe(true);
    await generator.getByLabel('С фамилией или отчеством').uncheck();
    expect(await rows.allTextContents()).toEqual(plainNames);
    await generator.getByLabel('С фамилией или отчеством').check();
    expect(await rows.allTextContents()).toEqual(fullNames);
    await expectResultsFit();
    const checkbox = generator.getByRole('checkbox', { name: 'С фамилией или отчеством' });
    const checkboxLabel = checkbox.locator('..');
    const checkboxBounds = await checkboxLabel.boundingBox();
    expect(checkboxBounds!.height).toBeLessThanOrEqual(28);
    expect(await checkboxLabel.locator('span').first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('names-layout.png') });
    await expect(generator.getByRole('button', { name: /Закрепить|Скопировать подборку/ })).toHaveCount(0);
    const beforeRefresh = await rows.allTextContents();
    await generator.getByRole('button', { name: 'Ещё варианты' }).click();
    const refreshed = await rows.allTextContents();
    expect(refreshed.every((name) => !beforeRefresh.includes(name))).toBe(true);
    await rows.first().getByRole('button', { name: /^Скопировать / }).click();
    const copied = await page.evaluate(() => sessionStorage.getItem('copied-names'));
    expect(copied).toBe(refreshed[0]);
    expect(copied).toMatch(/доттир$/);
    const beforeClose = await rows.allTextContents();
    await page.getByRole('button', { name: 'Чат', exact: true }).first().click();
    await page.getByRole('button', { name: 'Имена и названия', exact: true }).click();
    await expect(generator.getByRole('combobox', { name: 'Стиль', exact: true })).toHaveValue('scandinavian');
    expect(await rows.allTextContents()).toEqual(beforeClose);
    await generator.getByRole('combobox', { name: 'Тип', exact: true }).selectOption('settlement');
    await expect(generator.getByRole('combobox', { name: 'Род', exact: true })).toHaveCount(0);
    await expect(generator.getByRole('combobox', { name: 'Стиль', exact: true })).toHaveValue('russian');
    await expect(rows).toHaveCount(10);
    await generator.getByRole('combobox', { name: 'Стиль', exact: true }).selectOption('english');
    await expect(rows).toHaveCount(10);
    for (const row of await rows.all()) await expect(row).toContainText(/\([а-яё +/]+\)/i);
    await expectResultsFit();
    await page.screenshot({ path: test.info().outputPath('settlements-layout.png') });
    await rows.first().getByRole('button', { name: /^Скопировать / }).click();
    await expect(generator.getByRole('status')).toContainText('Скопировано');
    const settlementCopy = await page.evaluate(() => sessionStorage.getItem('copied-names'));
    expect(settlementCopy).toMatch(/^[А-ЯЁа-яё]+$/);
    await expect(rows.first()).toContainText(settlementCopy!);
    if (viewport.width < 600) {
      await rows.last().getByRole('button', { name: /^Скопировать / }).click();
      const lastBounds = await rows.last().boundingBox();
      expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(viewport.height - 82);
    }
    const bounds = await generator.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await page.getByRole('button', { name: 'Генератор NPC', exact: true }).click();
    await expect(page).toHaveURL(/#\/library\/generators$/);
    await expect(generator).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить NPC в чат приватно' })).toBeVisible();
    await page.getByRole('button', { name: 'Имена и названия', exact: true }).click();
    await expect(generator.getByRole('combobox', { name: 'Стиль', exact: true })).toHaveValue('english');
    await page.reload();
    await expect(generator).toBeVisible();
    await expect(page.getByRole('button', { name: 'Имена и названия', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}
