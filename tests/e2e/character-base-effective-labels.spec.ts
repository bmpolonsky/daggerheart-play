import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const catalog = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8')).data;
const ancestries = catalog('ancestries');
const equipment = catalog('equipment');
for (const bonus of [true, false]) for (const width of [1180, 1440, 500]) test(`base and effective labels with bonus=${bonus} at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 757 });
  await openGmGame(page);
  const doc = createPopulatedGameDocument();
  const hero = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.className = 'Bard'; hero.classDisplayName = 'Бард'; hero.classSlug = 'bard'; hero.classSourceId = 'class:bard';
  hero.hp = { marked: 0, max: 5 }; hero.stress = { marked: 0, max: 6 }; hero.evasion = 9;
  hero.domainCards = []; hero.sheetCards = [];
  if (bonus) {
    const giant = ancestries.find((x: any) => x.slug === 'giant'), elf = ancestries.find((x: any) => x.slug === 'elf');
    hero.ancestry = `${giant.name} / ${elf.name}`;
    hero.sheetCards = [giant.features[0], elf.features[1]].map((feature: any) => ({ id: `qa-source-${feature.id}`, kind: 'ancestryFeature' as const, name: feature.name, text: feature.main_body }));
  }
  const armor = equipment.find((x: any) => x.slug === (bonus ? 'gambeson-armor' : 'leather-armor'));
  hero.armor = { ...hero.armor, name: armor.name, sourceSlug: armor.slug, equipped: true, score: armor.armor_score, markedSlots: 0,
    baseMajor: armor.base_thresholds[0], baseSevere: armor.base_thresholds[1], feature: armor.features.map((f: any) => `${f.name}: ${f.main_body}`).join('\n'), featureText: '' };
  await importGameDocument(page, doc, 'base-effective-labels.dhgame');
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByRole('navigation', { name: 'Ростер персонажей', exact: true }).getByRole('button', { name: filledCharacterName, exact: true }).click();
  const editor = library.getByRole('region', { name: 'Редактор персонажа', exact: true });
  const evasionTotal = editor.getByLabel('Ключевые параметры').locator('.inline-stat').filter({ hasText: 'Уклонение' }).locator('strong');
  await expect(evasionTotal).toHaveText(bonus ? '10' : '9');
  await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
  const evasionBase = editor.getByLabel('Базовое уклонение', { exact: true });
  await expect(evasionBase).toHaveValue('9');
  await expect(evasionBase).toHaveAttribute('aria-description', /Без бонусов брони и свойств/);
  await evasionBase.fill('10'); await evasionBase.press('Tab');
  await expect(evasionBase.locator('..')).toContainText(bonus ? 'Итог: 11' : 'Итог: 10');
  await evasionBase.fill('9'); await evasionBase.press('Tab');
  await page.screenshot({ path: `${test.info().outputPath()}/evasion-${bonus}-${width}.png` });
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Ресурсы', exact: true }).click();
  const hp = editor.getByRole('group', { name: 'Отмеченные Раны', exact: true }).locator('..').locator('.resource-title strong');
  await expect(hp).toHaveText(bonus ? '0/6' : '0/5');
  const baseHp = editor.getByRole('region', { name: 'Базовые лимиты', exact: true }).getByRole('spinbutton', { name: 'Раны', exact: true });
  await expect(baseHp).toHaveValue('5');
  await expect(editor.getByRole('region', { name: 'Базовые лимиты', exact: true }).getByRole('spinbutton', { name: 'Стресс', exact: true })).toHaveValue('6');
  await baseHp.fill('6'); await baseHp.press('Tab');
  await expect(hp).toHaveText(bonus ? '0/7' : '0/6');
  await baseHp.fill('5'); await baseHp.press('Tab');
  await baseHp.scrollIntoViewIfNeeded();
  await expect(editor).toContainText('Бонусы свойств и шрамы учитываются отдельно.');
  for (const input of await editor.getByRole('region', { name: 'Базовые лимиты', exact: true }).getByRole('spinbutton').all()) {
    const metrics = await input.locator('..').evaluate(label => ({ scroll: label.scrollWidth, width: label.clientWidth }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.width + 1);
  }
  await page.screenshot({ path: `${test.info().outputPath()}/resources-${bonus}-${width}.png` });
});
