import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const before = process.env.RESOURCE_HEADER_BEFORE === '1';
for (const width of [1180, 1440, 500]) test(`resource header keeps full HP Stress Armor fractions at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 757 });
  await openGmGame(page);
  const doc = createPopulatedGameDocument();
  const hero = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.hp = { marked: 10, max: 12 }; hero.stress = { marked: 0, max: 12 };
  hero.sheetCards = []; hero.domainCards = [];
  hero.armor = { ...hero.armor, score: 12, markedSlots: 10, equipped: true, feature: '', featureText: '' };
  await importGameDocument(page, doc, 'resource-title.dhgame');
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  const roster = library.getByRole('navigation', { name: 'Ростер персонажей', exact: true });
  await roster.getByRole('button', { name: filledCharacterName, exact: true }).click();
  const editor = library.getByRole('region', { name: 'Редактор персонажа', exact: true });
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Ресурсы', exact: true }).click();
  await page.screenshot({ path: `${test.info().outputPath()}/${before ? 'before' : 'after'}-${width}.png` });
  if (before) return;
  for (const [label, value] of [['Отмеченные Раны', '10/12'], ['Отмеченный Стресс', '0/12'], ['Ячейки Брони', '10/12']]) {
    const resource = editor.getByRole('group', { name: label, exact: true }).locator('..');
    const number = resource.locator('.resource-title strong');
    await expect(number).toHaveText(value);
    const metrics = await resource.locator('.resource-title').evaluate(el => {
      const label = el.querySelector('span')!, value = el.querySelector('strong')!;
      const l=label.getBoundingClientRect(), v=value.getBoundingClientRect(), p=el.getBoundingClientRect();
      return { scroll: value.scrollWidth, width: value.clientWidth, labelRight: l.right, valueLeft: v.left, valueRight: v.right, parentRight: p.right, overflow: getComputedStyle(value).textOverflow };
    });
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
    expect(metrics.labelRight).toBeLessThanOrEqual(metrics.valueLeft);
    expect(metrics.valueRight).toBeLessThanOrEqual(metrics.parentRight + 1);
    expect(metrics.overflow).not.toBe('ellipsis');
  }
  for (const [label, position, result] of [['Отмеченные Раны', 10, '11/12'], ['Отмеченный Стресс', 11, '12/12'], ['Ячейки Брони', 11, '12/12']] as const) {
    const group = editor.getByRole('group', { name: label, exact: true });
    await group.getByRole('button').nth(position).click();
    await expect(group.locator('..').locator('.resource-title strong')).toHaveText(result);
  }
});
