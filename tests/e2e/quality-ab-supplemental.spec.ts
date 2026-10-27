import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createExperience, createWeapon } from '../../src/domain/rules/factories';
import { rangeLabel } from '../../src/domain/rules/constants';
import { createPopulatedGameDocument, filledAdversaryName, filledCharacterName, filledEnvironmentName, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { openUnifiedFormulaEditor } from './unified-formula-helpers';
import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';

const actorId = 'e2e-character-cadsuane';
const label = (process.env.QUALITY_LABEL ?? 'current').replace(/[^a-zA-Z0-9_-]/g, '_');
const output = `${process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab'}/${label}`;
const fixed = process.env.QUALITY_EXPECT_FIXED === '1';
let observations: Array<Record<string, unknown>> = [];
test.beforeEach(async ({ page }) => { observations = []; await installQualityClickCounter(page); await installDeterministicP2PTransport(page); });

async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const library: any = await new Promise((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    const world = library?.worlds?.[library.activeWorldId]; const data = world?.games?.[world.activeGameId]?.state;
    const hero = data?.characters?.entities?.['e2e-character-cadsuane'];
    return { fear: data?.game?.fear, rolls: data?.rollLog?.length ?? 0,
      lastRoll: data?.rollLog?.[0], armor: hero?.armor, thresholds: hero?.thresholds,
      inventory: hero?.inventory, weapons: hero?.weapons };
  });
}
async function boot(page: Page, baseURL: string | undefined, document: ReturnType<typeof createPopulatedGameDocument>) {
  await page.goto(`${baseURL ?? 'http://127.0.0.1:4208/'}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(document), 'paired-supplemental.dhgame');
}
async function capture(page: Page, step: string, target?: Locator, extra: Record<string, unknown> = {}) {
  await mkdir(output, { recursive: true });
  observations.push({ step, pointerClicks: await qualityClickCount(page), role: await qualityViewRole(page),
    text: target ? await target.innerText() : undefined, state: await state(page), ...extra });
  await page.screenshot({ path: `${output}/supplemental-${step}.png` });
}
async function closePreview(page: Page) {
  const close = page.getByRole('button', { name: 'Закрыть предпросмотр', exact: true });
  if (await close.isVisible()) await close.click();
}
async function acceptReplacement(tray: Locator) {
  const replace = tray.getByRole('button', { name: 'Заменить подготовленный бросок', exact: true });
  if (await replace.isVisible()) { observations.push({ action: 'explicitly replace cancelled edited draft' }); await replace.click(); }
}
test.afterEach(async ({ page }, info) => {
  await mkdir(output, { recursive: true }); const name = info.title.replace(/[^a-zA-Z0-9_-]/g, '-');
  await writeFile(`${output}/supplemental-${name}.json`, JSON.stringify({ label, fixedAssertions: fixed, title: info.title, status: info.status,
    errors: info.errors.map(error => error.message), observations }, null, 2));
  if (info.status !== info.expectedStatus) await page.screenshot({ path: `${output}/supplemental-failed-${name}.png` });
});

test('supplemental A/B: environment feature prepares one actor-bound pool before one submit', async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument();
  const environment = document.files['data/encounter.json'].environments['e2e-environment-grove'];
  environment.featureText = '### QA Камнепад\nНанесите 2d6+1 физического урона.';
  document.files['data/game.json'].fear = 3;
  await boot(page, baseURL, document);
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledEnvironmentName }).click({ position: { x: 16, y: 24 } });
  const sheet = page.getByLabel('Окружение мастера', { exact: true }); await expect(sheet).toBeVisible();
  const macro = sheet.getByRole('button', { name: /2d6\+1/ }).first();
  const available = await macro.count() > 0; await capture(page, 'environment-source', sheet, { macroAvailable: available });
  if (!available) { if (fixed) throw new Error('Environment fixed dice macro unavailable.'); return; }
  await macro.click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  // Legacy clicks execute immediately; the unified adapter opens after its effect.
  await expect.poll(async () => await tray.isVisible() || (await state(page)).rolls > 0).toBe(true);
  const prepares = await tray.isVisible(); await capture(page, 'environment-clicked', prepares ? tray : sheet, { prepares });
  if (!prepares) {
    observations.push({ limitation: 'This version has no prepared environment tray; click executes immediately, so cancel-before-submit is unavailable.' });
    if (fixed) throw new Error('Environment macro executed without preparing the common tray.');
    await expect.poll(async () => (await state(page)).rolls).toBe(1);
    await capture(page, 'environment-legacy-immediate', sheet); return;
  }
  const formula = await openUnifiedFormulaEditor(tray);
  if (fixed) { await expect(formula).toHaveValue('2d6+1'); await expect(tray).toContainText(filledEnvironmentName); expect((await state(page)).rolls).toBe(0); }
  await page.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  await capture(page, 'environment-cancelled', sheet);
  if (fixed) expect({ rolls: (await state(page)).rolls, fear: (await state(page)).fear }).toEqual({ rolls: 0, fear: 3 });
  await macro.click(); await expect(tray).toBeVisible(); await acceptReplacement(tray);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => (await state(page)).rolls).toBe(1);
  await capture(page, 'environment-submitted', tray);
  if (fixed) {
    const result = await state(page); expect(result.lastRoll.actorId).toBe(environment.id);
    expect(result.lastRoll.actorName).toBe(environment.name); expect(result.lastRoll.formula).toBe('2d6+1'); expect(result.fear).toBe(3);
  }
});

test('supplemental A/B: NPC outgoing experience attack cancellation payment and separate damage', async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument(); document.files['data/game.json'].fear = 3;
  const npc = document.files['data/encounter.json'].adversaries['e2e-adversary-ooze'];
  npc.attackModifier = 3; npc.standardAttack.damageFormula = '2d8+4';
  npc.experiences = [{ ...createExperience('Воровство', 2), id: 'qa-npc-experience' }];
  await boot(page, baseURL, document);
  await page.locator('.player-roster__item').filter({ hasText: filledAdversaryName }).first().click();
  const sheet = page.getByLabel('Противник мастера', { exact: true });
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  const old = page.getByLabel('Подтверждение атаки противника', { exact: true });
  async function prepareAttack() {
    const direct = sheet.getByRole('button', { name: 'Атака', exact: true });
    if (await direct.isVisible()) await direct.click();
    else { observations.push({ action: 'separate Attack control absent; use legacy attack row' }); await sheet.locator('.dh-list-item').filter({ hasText: npc.standardAttack.name }).click(); }
    await expect.poll(async () => await tray.isVisible() || await old.isVisible()).toBe(true);
    if (await tray.isVisible()) { await acceptReplacement(tray); return tray; }
    await expect(old).toBeVisible(); return old;
  }
  async function chooseExperience(panel: Locator) {
    const checkbox = panel.getByRole('checkbox', { name: 'Воровство +2', exact: true });
    if (!await checkbox.isVisible()) await panel.getByRole('button', { name: 'Опыт', exact: true }).click();
    await checkbox.check();
  }
  let panel = await prepareAttack(); await chooseExperience(panel);
  await capture(page, 'npc-attack-experience-ready', panel);
  if (fixed) { await expect(tray).toBeVisible(); expect((await state(page)).fear).toBe(3); expect((await state(page)).rolls).toBe(0); }
  await (await tray.isVisible() ? page.getByRole('button', { name: 'Закрыть панель броска', exact: true }) : old.getByRole('button', { name: 'Закрыть', exact: true })).click();
  await capture(page, 'npc-attack-cancelled', sheet);
  if (fixed) expect({ fear: (await state(page)).fear, rolls: (await state(page)).rolls }).toEqual({ fear: 3, rolls: 0 });
  panel = await prepareAttack(); await chooseExperience(panel);
  if (await tray.isVisible()) { const formula = await openUnifiedFormulaEditor(tray); if (fixed) await expect(formula).toHaveValue('1d20+5'); }
  await panel.getByRole('button', { name: await tray.isVisible() ? 'Бросить' : 'Бросить атаку', exact: true }).click();
  await expect.poll(async () => (await state(page)).rolls).toBe(1);
  await expect.poll(async () => (await state(page)).fear).toBe(2);
  await capture(page, 'npc-attack-submitted', sheet);
  const damage = sheet.getByRole('button', { name: 'Урон', exact: true });
  if (await damage.isVisible()) { await damage.click(); panel = tray; }
  else { observations.push({ action: 'separate Damage control absent; use legacy damage tab' }); panel = await prepareAttack(); await panel.getByRole('button', { name: 'Урон', exact: true }).click(); }
  if (await tray.isVisible()) {
    await acceptReplacement(tray); const formula = await openUnifiedFormulaEditor(tray);
    if (fixed) { await expect(formula).toHaveValue('2d8+4'); await expect(tray.getByRole('checkbox', { name: 'Воровство +2', exact: true })).toHaveCount(0); await expect(tray.getByRole('region', { name: 'Итог броска' })).not.toContainText('Страха'); }
  }
  await capture(page, 'npc-damage-ready', panel);
  await panel.getByRole('button', { name: await tray.isVisible() ? 'Бросить' : 'Бросить урон', exact: true }).click();
  await expect.poll(async () => (await state(page)).rolls).toBe(2);
  await capture(page, 'npc-damage-submitted', sheet);
  if (fixed) { const result = await state(page); expect(result.fear).toBe(2); expect(result.lastRoll.formula).toBe('2d8+4'); expect(result.lastRoll.actorId).toBe(npc.id); }
});

test('supplemental A/B: stored weapon preview supplies and selected custom armor identity', async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument(); const hero = document.files['data/characters.json'].entities[actorId]; hero.level = 3;
  hero.weapons = [createWeapon({ id: 'qa-preview-weapon', name: 'QA Посох просмотра', trait: 'instinct', range: 'Close', damageFormula: '1d8+3', damageType: 'magic', category: 'primary', burden: 'one-handed', featureText: 'Контрольное свойство QA', notes: 'Контрольная заметка QA' })];
  document.files['content/custom-equipment.json'] = [{ id: 'qa-custom-armor', slug: 'qa-custom-armor', name: 'QA Новый панцирь', type_slug: 'armor', tier: 1, armor_score: 2, base_thresholds: [4, 9], features: [{ id: 'qa-property', name: 'QA Новое свойство', main_body: 'Только свойство выбранного панциря.' }] }];
  await boot(page, baseURL, document);
  await page.locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока', { exact: true });
  const stow = sheet.getByRole('button', { name: 'Снять оружие QA Посох просмотра', exact: true });
  if (await stow.isVisible()) {
    await stow.click(); await sheet.locator('.dh-list-item').filter({ hasText: 'QA Посох просмотра' }).click();
    const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
    await capture(page, 'stored-weapon-preview', preview);
    if (fixed) for (const text of ['Инстинкт', rangeLabel('Close'), '1d8+3', 'Контрольное свойство QA', 'Контрольная заметка QA']) await expect(preview).toContainText(text);
    await closePreview(page);
  } else { observations.push({ action: 'stow and stored weapon preview unavailable in this version' }); if (fixed) throw new Error('Stored weapon workflow unexpectedly unavailable.'); }
  const supplies = sheet.locator('.dh-list-item').filter({ hasText: 'Основные припасы' });
  if (await supplies.count()) {
    await supplies.click(); const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
    await capture(page, 'basic-supplies-preview', preview, { limit: 'Description is in the identical imported fixture; this is display evidence, not a test of old new-hero factory output.' });
    if (fixed) await expect(preview).toContainText('Состав уточняется с мастером'); await closePreview(page);
  }
  const workspace = await openGameLibrary(page);
  await workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
  await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: filledCharacterName, exact: true }).click();
  const editor = workspace.getByLabel('Редактор персонажа', { exact: true });
  await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
  async function selectArmor(title: RegExp) {
    await editor.getByRole('button', { name: 'Броня', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор: Броня', exact: true });
    await picker.getByRole('option').filter({ hasText: title }).first().click(); await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
  }
  await selectArmor(/Стеганый Доспех/i); await capture(page, 'catalog-armor-selected', editor);
  await selectArmor(/QA Новый панцирь/);
  if (fixed) await expect.poll(async () => (await state(page)).armor?.sourceId).toBe('qa-custom-armor');
  await capture(page, 'custom-armor-selected', editor);
  if (fixed) {
    const result = await state(page);
    expect(result.armor).toMatchObject({ name: 'QA Новый панцирь', sourceId: 'qa-custom-armor', sourceSlug: 'qa-custom-armor', baseMajor: 4, baseSevere: 9, score: 2 });
    expect(result.armor.feature).toContain('QA Новое свойство'); expect(result.armor.feature).not.toContain('Гибк');
    expect(result.thresholds).toEqual({ major: 7, severe: 12 });
  }
});
