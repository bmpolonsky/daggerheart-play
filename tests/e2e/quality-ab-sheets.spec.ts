import { hasMixedAncestryMode } from './ancestry-selection-helpers';
import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';
import { expect, test, type Locator, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => { await installQualityClickCounter(page); });
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWeapon } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledAdversaryName, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

const root = (process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab');
const label = process.env.QUALITY_LABEL ?? 'current';
const output = `${root}/${label}`;
const actorId = 'e2e-character-cadsuane';
const observations: Record<string, unknown>[] = [];

async function fixture() {
  // Persist one source document, then reuse its exact bytes across A/B runs.
  const path = `${root}/paired-sheets-fixture.dhgame`;
  await mkdir(root, { recursive: true });
  let bytes: string;
  try { bytes = await readFile(path, 'utf8'); }
  catch {
    const document = createPopulatedGameDocument();
    const hero = document.files['data/characters.json'].entities[actorId];
    hero.level = 3; hero.proficiency = 2;
    hero.armor = { name: 'QA Кожаная броня', equipped: true, baseMajor: 5, baseSevere: 11, score: 3, markedSlots: 1, feature: '', featureText: '' };
    hero.thresholds = { major: 8, severe: 14 };
    hero.weapons = [createWeapon({ id: 'qa-staff', name: 'QA Короткий посох', trait: 'instinct', range: 'Melee', damageFormula: '1d8+1', damageType: 'magic', category: 'primary', burden: 'one-handed', featureText: 'Контрольное свойство', notes: 'Контрольная заметка' })];
    hero.conditions = [{ id: 'qa-custom', name: 'QA — Горит', notes: 'Тлеет плащ.', removalCondition: 'Потушить вручную.' }];
    hero.stress.marked = 1;
    const npc = document.files['data/encounter.json'].adversaries['e2e-adversary-ooze'];
    npc.thresholds = { major: 8, severe: 14 }; npc.hp = { marked: 0, max: 5 };
    document.files['data/game.json'].fear = 0;
    bytes = JSON.stringify(document);
    await writeFile(path, bytes);
  }
  observations.push({ sourceFixtureSha256: createHash('sha256').update(bytes).digest('hex') });
  return JSON.parse(bytes) as ReturnType<typeof createPopulatedGameDocument>;
}

async function open(page: Page, baseURL: string | undefined, variant?: (document: Awaited<ReturnType<typeof fixture>>) => void) {
  observations.length = 0;
  const document = await fixture(); variant?.(document);
  await installDeterministicP2PTransport(page);
  await page.goto(`${baseURL ?? 'http://127.0.0.1:4208/'}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(document), 'paired-identical.dhgame');
}

async function snap(page: Page, name: string, target?: Locator) {
  await mkdir(output, { recursive: true });
  if (target) await target.scrollIntoViewIfNeeded();
  // Section-rail clicks can start a smooth inner-panel scroll. Pin the actual
  // object under review into the viewport, rather than capture its old section.
  if (target && (name.startsWith('weapon-') || name.startsWith('beastform-'))) {
    const itemName = name.startsWith('beastform-') ? 'QA Звероформа: атака' : 'QA Короткий посох';
    const item = target.getByText(itemName, { exact: true }).first();
    if (await item.count()) await item.scrollIntoViewIfNeeded();
  }
  observations.push({ step: name, pointerClicks: await qualityClickCount(page), role: await qualityViewRole(page), url: page.url(), text: target ? await target.innerText() : undefined,
    bounds: target ? await target.boundingBox() : undefined,
    controls: target ? await target.locator('button,input,select,textarea').evaluateAll(elements => elements.map(element => ({
      tag: element.tagName, text: element.textContent?.trim(), aria: element.getAttribute('aria-label'),
      disabled: element.hasAttribute('disabled'), value: 'value' in element ? (element as HTMLInputElement).value : undefined
    }))) : undefined });
  await page.screenshot({ path: `${output}/sheets-${name}.png` });
}

async function sheet(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  const panel = page.getByLabel('Персонаж игрока', { exact: true });
  await expect(panel).toBeVisible(); return panel;
}

async function editor(page: Page, edit = false) {
  const existingLibrary = page.getByRole('dialog', { name: 'Библиотека игры', exact: true });
  if (/^#\/library(?:\/|$)/.test(new URL(page.url()).hash)) {
    await existingLibrary.waitFor({ state: 'visible', timeout: 15_000 });
  }
  const library = await existingLibrary.isVisible() ? existingLibrary : await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await library.getByLabel('Ростер персонажей').getByRole('button', { name: filledCharacterName, exact: true }).click();
  const panel = library.getByLabel('Редактор персонажа', { exact: true });
  if (edit) await panel.getByRole('button', { name: 'Редактировать', exact: true }).click();
  return { library, panel };
}

async function optionalAction(locator: Locator, name: string) {
  const available = await locator.count() > 0 && await locator.first().isVisible();
  observations.push({ action: name, available, outcome: available ? 'invoked' : 'control absent in this version' });
  if (available) await locator.first().click();
  return available;
}

test.afterEach(async ({ page }, info) => {
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/sheets-${info.title.replace(/[^a-z0-9-]/gi, '-')}.json`, JSON.stringify({ label, title: info.title, status: info.status, errors: info.errors.map(error => error.message), observations }, null, 2));
  if (info.status !== info.expectedStatus) await page.screenshot({ path: `${output}/sheets-failed-${info.title.replace(/[^a-z0-9-]/gi, '-')}.png` });
});

test('PC sheet resources armor and manual conditions', async ({ page, baseURL }) => {
  await open(page, baseURL); const panel = await sheet(page);
  await snap(page, 'pc-resources', panel);
  const wounds = panel.getByRole('group', { name: 'Раны', exact: true }).getByRole('button');
  if (await wounds.count() > 1) await wounds.nth(1).click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Инвентарь', exact: true }).click();
  await snap(page, 'armor-equipped', panel);
  if (await optionalAction(panel.getByRole('button', { name: 'Снять броню', exact: true }), 'unequip armor')) {
    await snap(page, 'armor-unequipped', panel);
    await optionalAction(panel.getByRole('button', { name: 'Надеть броню', exact: true }), 'equip armor');
  }
  await optionalAction(panel.getByRole('button', { name: 'Изменить состояние QA — Горит', exact: true }), 'edit custom condition');
  const custom = page.getByRole('dialog', { name: 'Изменить состояние', exact: true });
  if (await custom.isVisible()) { await snap(page, 'condition-editor', custom); await custom.getByRole('button', { name: 'Отмена', exact: true }).click(); }
  await snap(page, 'pc-final', panel);
});

test('weapon actions and inventory roundtrip', async ({ page, baseURL }) => {
  await open(page, baseURL); const panel = await sheet(page);
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  await snap(page, 'weapon-p2', panel);
  if (await optionalAction(panel.getByRole('button', { name: 'Снять оружие QA Короткий посох', exact: true }), 'unequip weapon')) {
    await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Инвентарь', exact: true }).click();
    await snap(page, 'weapon-stowed', panel);
    const { panel: edit } = await editor(page, true);
    await edit.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
    await snap(page, 'weapon-stowed-editor', edit);
    await optionalAction(edit.getByRole('button', { name: 'Надеть оружие QA Короткий посох', exact: true }), 'equip stored weapon');
    await snap(page, 'weapon-equipped-editor', edit);
  }
});

test('beastform attack is not an inventory item', async ({ page, baseURL }) => {
  await open(page, baseURL, document => {
    document.files['data/characters.json'].entities[actorId].activeBeastform = {
      slug: 'qa-beast', name: 'QA Звероформа', tier: 1, level: 1, evasionModifier: 0, traitType: 'agility', traitBonus: 0,
      attackTrait: 'agility', attackRange: 'Melee', attackFormula: '1d6+2', attackDamageType: 'physical', featureText: 'Синтетическая звероформа.', activatedAt: '2026-10-27T09:00:00.000Z'
    };
  });
  const panel = await sheet(page);
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  await snap(page, 'beastform-p2', panel);
  await optionalAction(panel.getByRole('button', { name: /^Снять оружие QA Звероформа/ }), 'unequip synthetic beastform attack');
  await snap(page, 'beastform-after-unequip', panel);
});

test('Library money persistence and armor fine tune', async ({ page, baseURL }) => {
  await open(page, baseURL);
  let { panel } = await editor(page);
  await panel.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
  await snap(page, 'library-base-formula', panel);
  await panel.getByRole('button', { name: 'Редактировать', exact: true }).click();
  for (const amount of ['10', '70']) {
    await panel.getByLabel('Горсти', { exact: true }).fill(amount); await panel.getByLabel('Горсти', { exact: true }).blur();
    await panel.getByRole('button', { name: 'Готово', exact: true }).click();
    await panel.getByRole('button', { name: 'Редактировать', exact: true }).click();
    observations.push({ action: 'money save reopen', input: amount, actual: await panel.getByLabel('Горсти', { exact: true }).inputValue() });
  }
  await panel.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
  const fine = panel.locator('details').filter({ hasText: 'Тонкая настройка брони и порогов' });
  await fine.locator('summary').click(); await snap(page, 'armor-fine-tune', panel);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reopened = await editor(page, true);
  await reopened.panel.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
  observations.push({ action: 'money after reload', input: '70', actual: await reopened.panel.getByLabel('Горсти', { exact: true }).inputValue() });
});

test('create second hero preserves independent scene sheet context', async ({ page, baseURL }) => {
  await open(page, baseURL); await sheet(page);
  const { library, panel } = await editor(page);
  await library.getByRole('button', { name: 'Создать героя', exact: true }).click();
  const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
  await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
  await builder.getByRole('button', { name: 'Родословная', exact: true }).click();
  observations.push({ action: 'mixed ancestry capability', available: await hasMixedAncestryMode(builder) });
  await snap(page, 'builder-ancestry', builder);
  await builder.getByRole('button', { name: 'Экипировка', exact: true }).click();
  const oneHandedPrimary = builder.getByRole('group', { name: 'Шаг: Стартовая экипировка', exact: true }).getByRole('button').filter({ has: page.getByText('Палаш', { exact: true }) }).first();
  await optionalAction(oneHandedPrimary, 'select same one-handed primary for no-secondary comparison');
  observations.push({ action: 'explicit no secondary capability', available: await builder.getByRole('button', { name: 'Без второго оружия', exact: true }).count() > 0 });
  await builder.getByRole('button', { name: 'Личность', exact: true }).click();
  await builder.getByLabel('Имя', { exact: true }).fill('QA Второй герой');
  await builder.getByRole('button', { name: 'Итог', exact: true }).click();
  await builder.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(builder).toHaveCount(0);
  await snap(page, 'created-hero-selection', panel);
  observations.push({ action: 'new editor selection', heading: await panel.locator('.character-editor-heading h2').innerText() });
  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  await snap(page, 'scene-sheet-after-create', page.getByLabel('Персонаж игрока', { exact: true }));
});

test('rest current scene selection and actual recovery clarity', async ({ page, baseURL }) => {
  await open(page, baseURL, document => {
    const table = document.files['data/scene-table.json'];
    table.scenes[table.activeSceneId].tokens = table.scenes[table.activeSceneId].tokens.filter(token => token.actor.kind !== 'character' || token.actor.id === actorId);
  });
  await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжительный отдых', exact: true }).click();
  const card = page.getByLabel('Чат игры').locator('.player-activity-event--rest').last();
  await snap(page, 'rest-initial', card);
  observations.push({ action: 'scene participants', count: await card.locator('.feed-rest-participant').count() });
  const pc = card.locator('.feed-rest-participant').filter({ hasText: filledCharacterName });
  for (const name of ['Залечить все Раны', 'Снять весь Стресс']) {
    const select = pc.getByRole('button', { name: new RegExp(`^${name}`) });
    if (await select.count()) await select.first().click();
  }
  await snap(page, 'rest-selected', card);
  const apply = pc.getByRole('button', { name: 'Применить', exact: true });
  for (let attempt = 0; attempt < 4 && await apply.count() > 0; attempt += 1) await apply.first().click();
  await snap(page, 'rest-applied', card);
  await optionalAction(card.getByRole('button', { name: /Получить страх и завершить|Завершить отдых/ }), 'finish rest');
  await snap(page, 'rest-finished', card);
});

test('combat party and budget labels remain explicit', async ({ page, baseURL }) => {
  await open(page, baseURL);
  const library = await openGameLibrary(page);
  if (!await optionalAction(library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Бой', exact: true }), 'combat workspace')) return;
  const panel = library.getByRole('region', { name: 'Бой', exact: true });
  await snap(page, 'combat-budget', await panel.count() ? panel : library);
  await optionalAction(library.getByRole('button', { name: 'Увеличить количество героев', exact: true }), 'increase budget party count');
  await snap(page, 'combat-party-increased', await panel.count() ? panel : library);
});

for (const width of [1440, 390]) test(`NPC incoming damage density and actual wounds ${width}`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await open(page, baseURL);
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByRole('button', { name: filledAdversaryName, exact: true }).first().click();
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  const panel = page.getByLabel('Противник мастера', { exact: true });
  await snap(page, `npc-collapsed-${width}`, panel);
  const damage = panel.locator('details').filter({ hasText: 'Входящий урон' });
  if (!await optionalAction(damage.locator('summary'), 'incoming damage disclosure')) return;
  const input = damage.getByRole('spinbutton', { name: /^Полученный урон/ });
  await input.fill('14'); await snap(page, `npc-damage-expanded-${width}`, damage);
  observations.push({ action: 'damage density', damageBounds: await damage.boundingBox(), panelBounds: await panel.boundingBox() });
  await damage.getByRole('button', { name: 'Применить урон', exact: true }).click();
  await snap(page, `npc-damage-applied-${width}`, damage);
  await input.fill('14'); await damage.getByRole('button', { name: 'Применить урон', exact: true }).click();
  await snap(page, `npc-damage-capped-${width}`, damage);
  await input.fill('-1');
  observations.push({ action: 'invalid negative damage', disabled: await damage.getByRole('button', { name: 'Применить урон', exact: true }).isDisabled() });
});
