import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const before = process.env.FOLLOWUP_CAPTURE_BEFORE === '1';
const heroName = 'QA — Друид с очень длинным именем для проверки редактора';
async function openDruid(page: Page, width: number, height: number) {
  await page.setViewportSize({ width: 1440, height: 900 }); await openGmGame(page);
  const doc = createPopulatedGameDocument(); const hero = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.name = heroName; hero.className = 'Druid'; hero.classDisplayName = 'Друид'; hero.classSlug = 'druid'; hero.classSourceId = 'class:druid'; hero.sheetCards = []; hero.domainCards = [];
  await importGameDocument(page, doc, 'format-editor-entry.dhgame', heroName);
  await page.locator('.player-roster__item').filter({ hasText: heroName }).first().click();
  await page.setViewportSize({ width, height }); const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  return page.getByLabel('Персонаж игрока', { exact: true });
}
for (const [width,height] of [[1188,761],[400,609]]) {
  test(`beastform picker renders block descriptions at ${width}x${height}`, async ({ page }, info) => {
    const sheet = await openDruid(page,width!,height!);
    await sheet.getByRole('button', { name: 'Управление звериной формой', exact: true }).click();
    const preview = page.getByLabel('Предпросмотр', { exact: true });
    await preview.getByRole('button', { name: 'Звериная форма', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор: Звериная форма', exact: true });
    await picker.getByLabel('Поиск: Звериная форма', { exact: true }).fill('хищник');
    await picker.getByRole('option', { name: /^Стайный хищник/ }).click();
    await page.screenshot({ path: info.outputPath(`FORMAT-beastform-${before?'before':'after'}-${width}x${height}.png`) });
    if (before) return;
    await expect(picker.getByRole('heading', { name: 'Калечащий удар', exact: true })).toBeVisible();
    await expect(picker.getByRole('heading', { name: 'Стайная охота', exact: true })).toBeVisible();
    await expect(picker).toContainText('Преимущества:'); await expect(picker).not.toContainText('###');
    expect(await picker.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await picker.getByRole('button', { name: 'Закрыть выбор: Звериная форма', exact: true }).click();
    await expect(preview.getByRole('button', { name: 'Форма', exact: true })).toBeEnabled();
  });
  test(`standalone and Library editor keep name and actions inside at ${width}x${height}`, async ({ page }, info) => {
    await openDruid(page,width!,height!); await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Редактор персонажа', exact: true });
    async function check(target: import('@playwright/test').Locator, entry: string) {
      await page.screenshot({ path: info.outputPath(`EDITOR-${entry}-${before?'before':'after'}-${width}x${height}.png`) });
      const metrics = await target.evaluate(el => { const root = el.getBoundingClientRect(); const heading = el.querySelector('.character-editor-heading h2')!.getBoundingClientRect(); const buttons = Array.from(el.querySelectorAll('.character-editor-heading button')).map(button => { const r=button.getBoundingClientRect(); return {left:r.left,right:r.right}; }); return {overflow:el.scrollWidth-el.clientWidth,left:root.left,right:root.right,titleWidth:heading.width,buttons}; });
      await info.attach(`editor-metrics-${entry}`, { body: JSON.stringify(metrics), contentType: 'application/json' });
      if (before) return;
      expect(metrics.overflow).toBeLessThanOrEqual(1); expect(metrics.titleWidth).toBeGreaterThan(140);
      for (const button of metrics.buttons) { expect(button.left).toBeGreaterThanOrEqual(metrics.left); expect(button.right).toBeLessThanOrEqual(metrics.right+1); }
      await expect(target.getByRole('button', { name: 'Новый уровень', exact: true })).toBeInViewport();
      await target.getByRole('button', { name: 'Редактировать', exact: true }).click();
      await expect(target.getByRole('button', { name: 'Готово', exact: true })).toBeInViewport();
      await target.getByRole('button', { name: 'Готово', exact: true }).click();
    }
    await check(dialog,'standalone'); await dialog.getByRole('button', { name: 'Закрыть редактор персонажа', exact: true }).click();
    const library = await openGameLibrary(page); await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByRole('navigation', { name: 'Ростер персонажей', exact: true }).getByRole('button', { name: heroName, exact: true }).click();
    await check(library.getByRole('region', { name: 'Редактор персонажа', exact: true }),'library');
  });
}
