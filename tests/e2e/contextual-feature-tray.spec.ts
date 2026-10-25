import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';
import { parseContextualDiceMacros } from '../../src/domain/rules/contextualDiceBindings';
import { createPopulatedGameDocument, filledAdversaryName, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

function feature(collection: string, slug: string, id: number) {
  const raw = JSON.parse(readFileSync(new URL(`../../public/data/${collection}.json`, import.meta.url), 'utf8')).data.find((item: any) => item.slug === slug);
  const entry = [raw.features, raw.foundation_features, raw.specialization_features, raw.mastery_features].flatMap((list: any[]) => list ?? []).find((item: any) => item.id === id);
  const singular: Record<string, string> = { classes: 'class', subclasses: 'subclass', adversaries: 'adversary' };
  return { id: `sheet-${singular[collection]}-${slug}-${id}`, sourceId: `${singular[collection]}:${slug}`, featureId: id,
    collection: singular[collection], slug, name: entry.name, text: cleanMarkdownText(entry.main_body, { stripEmphasis: true, stripCodeTicks: true }) };
}

test('PC feature preview binds Prayer pool to Spellcast plus the selected upgrade without autoroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const actor = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  const prayer = feature('classes', 'seraph', 135);
  const upgrade = feature('subclasses', 'divine-wielder', 189);
  actor.spellcastTrait = 'strength'; actor.traits.strength = 2;
  actor.sheetCards = [{ ...prayer, kind: 'classFeature' }, { ...upgrade, kind: 'subclassFeature' }];
  await importGameDocument(page, document, 'contextual-prayer.dhgame');
  await page.locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click();
  await page.getByLabel('Персонаж игрока').getByRole('button', { name: prayer.name, exact: true }).click();
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  await preview.getByRole('button', { name: 'd4', exact: true }).first().click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('3d4');
  await expect(preview).toBeVisible();
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
});

test('a named Patron pool with no dN text prepares tier dice in the same tray', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const actor = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  const patron = feature('classes', 'playtest-warlock', 1972);
  const wrath = feature('subclasses', 'playtest-pact-of-the-wraithful', 1978);
  actor.level = 5;
  actor.sheetCards = [{ ...patron, kind: 'classFeature' }, { ...wrath, kind: 'subclassFeature' }];
  await importGameDocument(page, document, 'contextual-patron.dhgame');
  await page.locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click();
  await page.getByLabel('Персонаж игрока').getByRole('button', { name: wrath.name, exact: true }).click();
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  const named = parseContextualDiceMacros(wrath).find(macro => macro.kind === 'diceRoll' && macro.contextualBinding)!;
  await preview.getByRole('button', { name: named.label, exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('3d8');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
});

test('NPC contextual pool uses that NPC marked wounds rather than the viewed PC', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const document = createPopulatedGameDocument();
  const npc = document.files['data/encounter.json'].adversaries['e2e-adversary-ooze'];
  const scales = feature('adversaries', 'volcanic-dragon-molten-scourge', 1369);
  npc.sourceId = 2275; npc.sourceSlug = scales.slug; npc.hp = { marked: 2, max: 8 };
  npc.features = [{ id: '1369', name: scales.name, kind: 'passive', text: scales.text }];
  await importGameDocument(page, document, 'contextual-npc.dhgame');
  await page.locator('.player-roster__item').filter({ hasText: filledAdversaryName }).first().click();
  await page.getByLabel('Противник мастера', { exact: true }).getByRole('button', { name: 'd6', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveValue('2d6');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
});
