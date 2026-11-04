import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

const longName = 'Хранитель Дальних Рубежей — Великан — Военное — Ассасин — Гильдия Отравителей';

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
  { width: 844, height: 390 }
]) {
  test(`character header retains the whole wrapped name at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openGmGame(page);
    const gameDocument = createPopulatedGameDocument();
    const hero = gameDocument.files['data/characters.json'].entities['e2e-character-cadsuane'];
    hero.name = longName;
    hero.ancestry = 'Великан';
    hero.community = 'Военное';
    hero.className = 'Assassin';
    hero.classDisplayName = 'Ассасин';
    hero.subclassName = 'Гильдия Отравителей';
    await importGameDocument(page, gameDocument, 'long-character-name.dhgame', longName);
    if (viewport.width <= 920) {
      await page.getByRole('group', { name: 'Слой интерфейса', exact: true })
        .getByRole('button', { name: 'Лист', exact: true }).click();
    }
    const roster = page.getByLabel('Участники сцены').locator('.player-roster__item');
    await roster.filter({ hasText: longName }).first().click({ position: { x: 18, y: 28 } });
    const sheet = page.getByLabel('Персонаж игрока', { exact: true });
    const header = sheet.locator('.player-character-panel__hero');
    await expect(header.locator('.player-character-panel__hero-copy > strong')).toHaveText(longName);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await header.evaluate((element) => {
      const copy = element.querySelector<HTMLElement>('.player-character-panel__hero-copy')!;
      const title = copy.querySelector<HTMLElement>('strong')!;
      const portrait = element.querySelector<HTMLElement>('img, .player-character-panel__portrait-fallback');
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        headerHeight: box.height,
        contentHeight: Math.max(copy.getBoundingClientRect().height, portrait?.getBoundingClientRect().height ?? 0),
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        titleTop: title.getBoundingClientRect().top - box.top,
        titleBottom: title.getBoundingClientRect().bottom - box.top,
        titleWidth: title.clientWidth,
        titleScrollWidth: title.scrollWidth,
        headerWidth: element.clientWidth,
        headerScrollWidth: element.scrollWidth
      };
    });
    await info.attach('header-geometry', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('long-name.png') });
    expect(metrics.headerHeight).toBeGreaterThanOrEqual(metrics.paddingTop + metrics.contentHeight + metrics.paddingBottom - 1);
    expect(metrics.titleTop).toBeGreaterThanOrEqual(metrics.paddingTop - 1);
    expect(metrics.titleBottom).toBeLessThanOrEqual(metrics.headerHeight - metrics.paddingBottom + 1);
    expect(metrics.titleScrollWidth).toBeLessThanOrEqual(metrics.titleWidth + 1);
    expect(metrics.headerScrollWidth).toBeLessThanOrEqual(metrics.headerWidth + 1);
    const edit = page.getByRole('button', { name: 'Редактировать', exact: true });
    await edit.focus();
    await expect(edit).toBeFocused();

    await page.getByRole('group', { name: 'Контекст мастера', exact: true })
      .getByRole('button', { name: 'Участники', exact: true }).click();
    await page.getByLabel('Участники сцены').locator('.player-roster__item')
      .filter({ has: page.getByText('Ран', { exact: true }) }).first().click({ position: { x: 18, y: 28 } });
    await expect(header.locator('.player-character-panel__hero-copy > strong')).toHaveText('Ран');
    expect((await header.boundingBox())!.height).toBeLessThan(metrics.headerHeight);
    await expect(sheet.getByRole('group', { name: 'Раны', exact: true })).toBeVisible();
  });
}
