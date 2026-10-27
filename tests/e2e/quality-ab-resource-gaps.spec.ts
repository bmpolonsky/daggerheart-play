import { hasMixedAncestryMode, chooseMixedAncestryMode, chooseAncestryFeature } from './ancestry-selection-helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createDomainCard } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';

const actorId = 'e2e-character-cadsuane';
const label = (process.env.QUALITY_LABEL ?? 'current').replace(/[^a-zA-Z0-9_-]/g, '_');
const output = `${process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab'}/${label}`;
const fixed = process.env.QUALITY_EXPECT_FIXED === '1';
let observations: Array<Record<string, unknown>> = [];
test.beforeEach(async ({ page }) => { observations = []; await installQualityClickCounter(page); await installDeterministicP2PTransport(page); });

async function resources(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const library: any = await new Promise((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    const world = library?.worlds?.[library.activeWorldId]; const state = world?.games?.[world.activeGameId]?.state;
    const hero = state?.characters?.entities?.['e2e-character-cadsuane'];
    return { level: hero?.level, hp: hero?.hp, stress: hero?.stress, armor: hero?.armor,
      cards: hero?.domainCards?.map((card: any) => ({ id: card.id, name: card.name, tokens: card.tokens })),
      heroes: state?.characters?.order?.map((id: string) => ({ name: state.characters.entities[id].name,
        ancestryFeatures: state.characters.entities[id].sheetCards.filter((card: any) => card.kind === 'ancestryFeature').map((card: any) => card.name) })),
      rolls: state?.rollLog?.length ?? 0 };
  });
}

async function boot(page: Page, baseURL: string | undefined, document: ReturnType<typeof createPopulatedGameDocument>, variant = 'main') {
  await page.goto(`${baseURL ?? 'http://127.0.0.1:4208/'}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(document, variant), 'paired-resource-gaps.dhgame');
}
async function sheet(page: Page) {
  const panel = page.getByLabel('Персонаж игрока', { exact: true });
  if (!await panel.isVisible() || !await panel.getByText(filledCharacterName, { exact: true }).first().isVisible()) {
    await page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: filledCharacterName, exact: true }).click();
  }
  await expect(panel).toBeVisible(); return panel;
}
async function library(page: Page) {
  const existing = page.getByRole('dialog', { name: 'Библиотека игры', exact: true });
  if (/^#\/library(?:\/|$)/.test(new URL(page.url()).hash)) await existing.waitFor({ state: 'visible' });
  const panel = await existing.isVisible() ? existing : await openGameLibrary(page);
  await panel.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click(); return panel;
}
async function capture(page: Page, step: string, target?: Locator, extra: Record<string, unknown> = {}) {
  await mkdir(output, { recursive: true });
  observations.push({ step, pointerClicks: await qualityClickCount(page), role: await qualityViewRole(page),
    text: target ? await target.innerText() : undefined, resources: await resources(page), ...extra });
  await page.screenshot({ path: `${output}/resource-gaps-${step}.png` });
}
async function awaitVisibleResourcePersistence(page: Page, panel: Locator) {
  const marked = async (name: string) => panel.getByRole('group', { name, exact: true }).getByRole('button').evaluateAll(buttons => buttons.filter(button => button.getAttribute('aria-pressed') === 'true').length);
  const visible = { stress: await marked('Стресс'), hp: await marked('Раны') };
  await expect.poll(async () => { const state = await resources(page); return { stress: state.stress?.marked, hp: state.hp?.marked }; }).toEqual(visible);
}
test.afterEach(async ({ page }, info) => {
  await mkdir(output, { recursive: true });
  const name = info.title.replace(/[^a-zA-Z0-9_-]/g, '-');
  await writeFile(`${output}/resource-gaps-${name}.json`, JSON.stringify({ label, fixedAssertions: fixed, title: info.title,
    status: info.status, errors: info.errors.map(error => error.message), observations }, null, 2));
  if (info.status !== info.expectedStatus) await page.screenshot({ path: `${output}/resource-gaps-failed-${name}.png` });
});

test('resource gaps A/B: Chaos refill, repeated activation and full Stress', async ({ page, baseURL }) => {
  for (const fullStress of [false, true]) {
    const document = createPopulatedGameDocument(); const hero = document.files['data/characters.json'].entities[actorId];
    hero.sheetCards = []; hero.spellcastTrait = 'instinct'; hero.traits.instinct = 2;
    hero.stress.marked = fullStress ? hero.stress.max : 0;
    hero.domainCards = [createDomainCard({ id: 'qa-chaos', sourceId: 'domain-card:unleash-chaos', name: 'Высвобождение хаоса', inLoadout: true,
      tokens: { value: 0, max: 6 }, text: 'В начале сессии поместите на эту карту количество жетонов, равное вашей Характеристике Заклинателя. Отметьте Стресс, чтобы восполнить запас жетонов на этой карте вплоть до вашей Характеристики Заклинателя.' })];
    const variant = fullStress ? 'full-stress' : 'refill';
    await boot(page, baseURL, document, variant); const panel = await sheet(page);
    await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
    await panel.locator('.dh-list-item').filter({ hasText: 'Высвобождение хаоса' }).click();
    const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
    const action = preview.getByRole('button', { name: 'Отметьте Стресс', exact: true });
    const supported = await action.count() > 0;
    await capture(page, `chaos-${variant}-before`, preview, { supported });
    if (!supported) { if (fixed) throw new Error('Expected Chaos resource action is unavailable.'); continue; }
    await action.click();
    await awaitVisibleResourcePersistence(page, panel);
    if (fixed) {
      await expect.poll(async () => {
        const state = await resources(page); return { stress: state.stress?.marked, tokens: state.cards?.[0]?.tokens?.value, hp: state.hp?.marked, rolls: state.rolls };
      }).toEqual({ stress: fullStress ? hero.stress.max : 1, tokens: fullStress ? 0 : 2, hp: hero.hp.marked, rolls: 0 });
      if (fullStress) await expect(preview.getByRole('status')).toContainText('нет свободной ячейки Стресса');
    }
    await capture(page, `chaos-${variant}-after`, preview);
    if (!fullStress) {
      await action.click();
      await awaitVisibleResourcePersistence(page, panel);
      if (fixed) {
        await expect(preview.getByRole('status')).toContainText('запас жетонов уже полон');
        expect((await resources(page)).stress?.marked).toBe(1);
      }
      await capture(page, 'chaos-repeated', preview);
    }
  }
});

for (const bareBones of [false, true]) test(`resource gaps A/B: L3 unarmored ${bareBones ? 'Bare Bones' : 'ordinary'}`, async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument(); const hero = document.files['data/characters.json'].entities[actorId];
  hero.level = 3; hero.traits.strength = 2; hero.sheetCards = []; hero.domainCards = [];
  hero.armor = { name: 'QA Сохранённый доспех', equipped: false, score: 3, markedSlots: 1, baseMajor: 5, baseSevere: 11, feature: '', featureText: '' };
  hero.thresholds = { major: 8, severe: 14 };
  if (bareBones) hero.domainCards = [createDomainCard({ id: 'qa-bare-bones', sourceId: 'domain-card:bare-bones', name: 'Ничего лишнего', inLoadout: true })];
  await boot(page, baseURL, document); const panel = await sheet(page);
  await capture(page, `unarmored-${bareBones ? 'bare-bones' : 'ordinary'}`, panel);
  const thresholds = panel.getByLabel('Пороги урона');
  observations.push({ action: 'effective defenses', thresholdText: await thresholds.innerText(), armorPips: await panel.getByRole('group', { name: 'Броня', exact: true }).getByRole('button').count() });
  if (fixed) {
    await expect(thresholds).toContainText(`${bareBones ? 14 : 3}+`);
    await expect(thresholds).toContainText(`${bareBones ? 27 : 6}+`);
    await expect(panel.getByRole('group', { name: 'Броня', exact: true }).getByRole('button')).toHaveCount(bareBones ? 5 : 0);
    expect((await resources(page)).armor?.markedSlots).toBe(1);
  }
});

test('resource gaps A/B: custom condition create edit casing and manual reminder', async ({ page, baseURL }) => {
  await boot(page, baseURL, createPopulatedGameDocument()); const panel = await sheet(page);
  await panel.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
  const custom = panel.getByRole('menuitem', { name: 'Своё состояние', exact: true });
  const supported = await custom.count() > 0;
  await capture(page, 'condition-add-menu', panel, { supported });
  if (!supported) { if (fixed) throw new Error('Custom condition creation unexpectedly unavailable.'); return; }
  await custom.click();
  const create = page.getByRole('dialog', { name: 'Пользовательское состояние', exact: true });
  await create.getByLabel('Название состояния', { exact: true }).fill('QA — Горит');
  const simpleNote = await create.getByLabel('Заметка (необязательно)', { exact: true }).count() > 0;
  if (simpleNote) await create.getByLabel('Заметка (необязательно)', { exact: true }).fill('Тлеет плащ. Потушить вручную.');
  else {
    await create.getByLabel('Описание состояния', { exact: true }).fill('Тлеет плащ.');
    await create.getByLabel(/^Условие снятия/).fill('Потушить вручную.');
  }
  await create.getByRole('button', { name: 'Сохранить состояние', exact: true }).click();
  await panel.getByRole('button', { name: 'Изменить состояние QA — Горит', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить состояние', exact: true });
  await capture(page, 'condition-created-reopened', edit);
  if (fixed) {
    await expect(edit.getByLabel('Название состояния', { exact: true })).toHaveValue('QA — Горит');
    if (simpleNote) await expect(edit.getByLabel('Заметка (необязательно)', { exact: true })).toHaveValue('Тлеет плащ. Потушить вручную.');
    else {
      await expect(edit.getByLabel('Описание состояния', { exact: true })).toHaveValue('Тлеет плащ.');
      await expect(edit.getByLabel(/^Условие снятия/)).toHaveValue('Потушить вручную.');
    }
    await expect(edit).toContainText(/состояние снимается вручную/i);
  }
  await edit.getByLabel('Название состояния', { exact: true }).fill('QA — Тлеет');
  await edit.getByRole('button', { name: 'Сохранить состояние', exact: true }).click();
  await capture(page, 'condition-renamed', panel);
  if (fixed) {
    await expect(panel.getByRole('button', { name: 'Изменить состояние QA — Горит', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Изменить состояние QA — Тлеет', exact: true })).toHaveCount(1);
  }
});

test('resource gaps A/B: mixed ancestry rejects same pair and saves both orientations', async ({ page, baseURL }) => {
  await boot(page, baseURL, createPopulatedGameDocument()); const workspace = await library(page);
  for (const [first, second, wanted] of [
    ['Великан', 'Эльф', ['Выносливость', 'Небесный транс']],
    ['Эльф', 'Великан', ['Быстрые рефлексы', 'Размах']]
  ] as const) {
    await workspace.getByRole('button', { name: 'Создать героя', exact: true }).click();
    const builder = page.getByRole('dialog', { name: 'Новый герой', exact: true });
    await builder.getByRole('button', { name: 'Случайный герой', exact: true }).click();
    await builder.getByRole('button', { name: 'Личность', exact: true }).click();
    const name = `QA ${first} ${second}`;
    await builder.getByLabel('Имя', { exact: true }).fill(name); await builder.getByLabel('Имя', { exact: true }).blur();
    await builder.getByRole('button', { name: 'Родословная', exact: true }).click();
    const ancestry = builder.getByRole('group', { name: 'Шаг: Родословная', exact: true });
    const supported = await hasMixedAncestryMode(ancestry);
    await capture(page, `mixed-${first}-availability`, builder, { supported, limit: 'Random-generated class/stats are not compared; ancestry choices are explicit.' });
    if (!supported) { if (fixed) throw new Error('Mixed ancestry unexpectedly unavailable.'); return; }
    await chooseMixedAncestryMode(ancestry);
    await chooseAncestryFeature(page, ancestry, 0, first);
    const pickSecond = (title: string) => chooseAncestryFeature(page, ancestry, 1, title);
    await pickSecond(first);
    await builder.getByRole('button', { name: 'Итог', exact: true }).click();
    await capture(page, `mixed-${first}-same-pair`, builder);
    if (fixed) await expect(builder.getByRole('button', { name: 'Создать', exact: true })).toBeDisabled();
    await builder.getByRole('button', { name: 'Родословная', exact: true }).click(); await pickSecond(second);
    await builder.getByRole('button', { name: 'Итог', exact: true }).click();
    await builder.getByRole('button', { name: 'Создать', exact: true }).click(); await expect(builder).toHaveCount(0);
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name, exact: true }).click();
    const editor = workspace.getByLabel('Редактор персонажа', { exact: true });
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click();
    const features = editor.locator('.character-rule-feature').filter({ has: page.getByText('Родословная', { exact: true }) });
    await capture(page, `mixed-${first}-saved`, editor, { selectedFeatureNames: await features.locator('.character-rule-feature__identity > strong').allTextContents() });
    if (fixed) { await expect(features).toHaveCount(2); await expect(features.locator('.character-rule-feature__identity > strong')).toHaveText([...wanted]); }
  }
});

test('resource gaps A/B: level-up explicitly labels base resource increases', async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument(); const hero = document.files['data/characters.json'].entities[actorId];
  hero.level = 1; hero.sheetCards = []; hero.domainCards = [];
  await boot(page, baseURL, document); const workspace = await library(page);
  await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: filledCharacterName, exact: true }).click();
  await workspace.getByLabel('Редактор персонажа').getByRole('button', { name: 'Новый уровень', exact: true }).click();
  const level = page.getByRole('dialog', { name: 'Повышение уровня', exact: true });
  await level.getByRole('button', { name: 'Добавить: Добавить ячейку Ран', exact: true }).click();
  await level.getByRole('button', { name: 'Добавить: Добавить ячейку Стресса', exact: true }).click();
  await level.getByRole('button', { name: 'Дальше', exact: true }).click();
  await level.getByLabel('Новый Опыт (+2)', { exact: true }).fill('QA Проверка');
  await level.getByRole('button', { name: 'Дальше', exact: true }).click();
  await level.getByRole('button', { name: 'Обязательная карта домена', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор: Обязательная карта домена', exact: true });
  await picker.getByRole('option').first().click(); await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await level.getByRole('button', { name: 'Дальше', exact: true }).click();
  await capture(page, 'level-up-base-review', level, { limit: 'Preview labels only; no level-up application requested.' });
  if (fixed) { await expect(level).toContainText('Базовый максимум Ран'); await expect(level).toContainText('Базовый максимум Стресса'); expect((await resources(page)).level).toBe(1); }
});
