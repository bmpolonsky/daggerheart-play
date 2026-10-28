import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

for (const count of [26, 50]) for (const width of [1188, 390]) test(`large character roster preserves row contents ${count} at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 1188 ? 761 : 844 });
  await openGmGame(page);
  if (count === 26) {
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
    await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры', exact: true }).click();
    await library.locator('input[type="file"][accept*=".dhworld"]').setInputFiles(resolve('tests/fixtures/qa-world/synthetic-coverage-world.dhworld'));
    await expect(library.getByText('Мир импортирован: synthetic-coverage-world.dhworld', { exact: true })).toBeVisible();
    await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  } else {
    const doc = createPopulatedGameDocument();
    const characters = doc.files['data/characters.json'];
    const template = characters.entities[characters.order[0]]!;
    for (let i = characters.order.length; i < count; i++) {
      const hero = structuredClone(template);
      hero.id = `qa-roster-${i}`;
      hero.name = `QA ${i} — очень длинное имя персонажа для проверки нескольких строк списка`;
      characters.entities[hero.id] = hero;
      characters.order.push(hero.id);
    }
    await importGameDocument(page, doc, 'large-roster.dhgame');
  }
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  const roster = library.getByRole('navigation', { name: 'Ростер персонажей', exact: true });
  const back = library.getByRole('button', { name: 'Вернуться к ростеру персонажей', exact: true });
  if (await back.isVisible()) await back.click();
  const cards = roster.locator('.player-tools-character-card');
  await expect(cards).toHaveCount(count);
  const metrics = await cards.evaluateAll(items => items.map(item => {
    const box = item.getBoundingClientRect();
    const children = Array.from(item.querySelectorAll('.dh-list-item__content,.dh-list-item__right-accessory')).map(child => {
      const r = child.getBoundingClientRect(); return { top: r.top, bottom: r.bottom };
    });
    return { top: box.top, bottom: box.bottom, children };
  }));
  await info.attach('row-metrics', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath(`TC026-${count}-${width}-${process.env.ROSTER_CAPTURE_BEFORE === '1' ? 'before' : 'after'}.png`) });
  if (process.env.ROSTER_CAPTURE_BEFORE === '1') return;
  for (const row of metrics) for (const child of row.children) {
    expect(child.top).toBeGreaterThanOrEqual(row.top - 1);
    expect(child.bottom).toBeLessThanOrEqual(row.bottom + 1);
  }
  for (let i = 1; i < metrics.length; i++) expect(metrics[i]!.top).toBeGreaterThanOrEqual(metrics[i - 1]!.bottom - 1);
  await roster.hover(); await page.mouse.wheel(0, 50000);
  await info.attach('scroll-diagnostics', { body: JSON.stringify(await roster.evaluate(el => { const result = []; for (let node: Element | null = el; node; node = node.parentElement) { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); result.push({ className: node.className, top: box.top, height: box.height, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, overflow: style.overflowY }); } return result; }), null, 2), contentType: 'application/json' });
  await expect(cards.last()).toBeInViewport();
  const lastName = (await cards.last().locator('.dh-list-item__title').innerText()).trim();
  const sceneCountBefore = await roster.getByRole('button', { name: 'Убрать со сцены', exact: true }).count();
  // Real pointer hit on the visible name, not a forced click on its overlay.
  const titleBox = (await cards.last().locator('.dh-list-item__title').boundingBox())!;
  await page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
  const editor = library.getByRole('region', { name: 'Редактор персонажа', exact: true });
  await expect(editor.getByRole('heading', { name: lastName, exact: true })).toBeVisible();
  if (await back.isVisible()) await back.click();
  await expect(roster.getByRole('button', { name: 'Убрать со сцены', exact: true })).toHaveCount(sceneCountBefore);
  await cards.last().getByRole('button', { name: 'На сцену', exact: true }).click();
  await expect(cards.last().getByRole('button', { name: 'Убрать со сцены', exact: true })).toBeVisible();
  await cards.last().getByRole('button', { name: 'Убрать со сцены', exact: true }).click();
  await expect(cards.last().getByRole('button', { name: 'На сцену', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`TC026-${count}-${width}-last-row.png`) });
});
