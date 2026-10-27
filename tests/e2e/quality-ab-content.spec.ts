import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';
import { expect, test, type Page, type TestInfo, type Locator } from '@playwright/test';
test.beforeEach(async ({ page }) => { await installQualityClickCounter(page); });
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';

// Observational A/B probes: completion means evidence captured, not UX accepted.
const label = (process.env.QUALITY_LABEL ?? 'current').replace(/[^a-zA-Z0-9_-]/g, '_');
const directory = `${process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab'}/${label}`;
let observations: Array<Record<string, unknown>> = [];
let clicks: string[] = [];
async function click(target: Locator, name: string) { clicks.push(name); await target.click(); }
async function capture(page: Page, name: string, target?: Locator) {
  await mkdir(directory, { recursive: true });
  observations.push({ name, pointerClicks: await qualityClickCount(page), role: await qualityViewRole(page), actions: [...clicks], actionCount: clicks.length,
    text: target ? await target.innerText() : undefined, bounds: target ? await target.boundingBox() : undefined,
    rollEntries: await page.locator('.player-activity-event--roll').count(),
    inputs: await page.locator('.unified-roll-composer input').evaluateAll(elements => elements.map((element: any) => ({ name: element.getAttribute('aria-label'), value: element.value }))),
    dialogs: await page.getByRole('dialog').allTextContents(),
    controls: target ? await target.locator('button,[role="button"],input,select').evaluateAll(elements => elements.map((element: any) => ({ tag: element.tagName, text: element.textContent?.trim(), name: element.getAttribute('aria-label'), value: element.value, disabled: element.hasAttribute('disabled') }))) : undefined });
  await page.screenshot({ path: `${directory}/content-${name}.png` });
}
async function boot(page: Page, baseURL: string | undefined, document = createPopulatedGameDocument()) {
  observations = []; clicks = [];
  await installDeterministicP2PTransport(page);
  await page.goto(`${baseURL ?? 'http://127.0.0.1:4208/'}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(document), 'quality-content-identical.dhgame');
}
async function library(page: Page, collection: string) {
  const workspace = await openGameLibrary(page); clicks.push('open Library');
  await click(workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Справочник', exact: true }), 'Compendium');
  await click(workspace.getByLabel('Коллекции справочника').getByRole('button', { name: collection, exact: true }), collection);
  return workspace;
}
async function feature(collection: string, slug: string, featureId: number) {
  const catalog = JSON.parse(await readFile(new URL(`../../public/data/${collection}.json`, import.meta.url), 'utf8'));
  const raw = catalog.data.find((item: any) => item.slug === slug);
  const item = [raw.features, raw.foundation_features, raw.specialization_features, raw.mastery_features].flatMap((items: any[]) => items ?? []).find((item: any) => item.id === featureId);
  const singular = collection === 'classes' ? 'class' : 'subclass';
  return { id: `qa-${singular}-${slug}-${featureId}`, sourceId: `${singular}:${slug}`, featureId, collection: singular, slug, name: item.name, text: cleanMarkdownText(item.main_body, { stripEmphasis: true, stripCodeTicks: true }) };
}

test.afterEach(async ({}, info: TestInfo) => {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/content-${info.title.replace(/[^a-z0-9-]/gi, '-')}.json`, JSON.stringify({ label, title: info.title, status: info.status, errors: info.errors.map(error => error.message), observations, actions: clicks }, null, 2));
});

test('quality content A/B: filtered save keeps context and properties-only HTML is readable', async ({ page, baseURL }) => {
  await boot(page, baseURL); const workspace = await library(page, 'Родословные');
  const search = workspace.getByLabel('Поиск по справочнику');
  await search.fill('нет-совпадений-qa');
  await click(workspace.getByRole('button', { name: 'Создать', exact: true }), 'create custom ancestry');
  const editor = workspace.locator('.player-compendium-editor');
  await editor.getByLabel('Название', { exact: true }).fill('QA Контекст каталога');
  await click(editor.getByRole('button', { name: 'Добавить', exact: true }), 'add property');
  await editor.getByLabel('Название свойства 1', { exact: true }).fill('Стойкость');
  await editor.getByLabel('Текст свойства 1', { exact: true }).fill('<p>Раны &lt; 3 &amp; Стресс &ge; 2.</p><script>qa-hidden-marker</script>');
  await click(editor.getByRole('button', { name: 'Сохранить', exact: true }), 'save material');
  await expect(editor).toContainText('Материал сохранён.');
  await capture(page, 'catalog-after-save', workspace);
  observations.push({ searchAfterSave: await search.inputValue() });
  await click(editor.getByRole('button', { name: 'Отмена', exact: true }), 'return to entry');
  await capture(page, 'catalog-saved-detail', workspace);
  observations.push({ searchAfterClose: await search.inputValue(), detail: await workspace.getByLabel('Полная запись компендиума').allTextContents() });
  await search.fill('QA Контекст каталога');
  await capture(page, 'catalog-properties-preview', workspace);
});

test('quality content A/B: custom armor details exclude weapon-only defaults', async ({ page, baseURL }) => {
  await boot(page, baseURL); const workspace = await library(page, 'Снаряжение');
  await click(workspace.getByRole('button', { name: 'Создать', exact: true }), 'create custom equipment');
  const editor = workspace.locator('.player-compendium-editor');
  await editor.getByLabel('Название', { exact: true }).fill('QA Сравнимый панцирь');
  await editor.getByRole('combobox', { name: 'Тип', exact: true }).selectOption('armor');
  await editor.getByLabel('Показатель брони', { exact: true }).fill('2');
  await click(editor.getByRole('button', { name: 'Добавить', exact: true }), 'add armor property');
  await editor.getByLabel('Название свойства 1', { exact: true }).fill('Контрольное свойство');
  await editor.getByLabel('Текст свойства 1', { exact: true }).fill('Только описание для сравнения.');
  await click(editor.getByRole('button', { name: 'Сохранить', exact: true }), 'save armor');
  await expect(editor).toContainText('Материал сохранён.');
  await click(editor.getByRole('button', { name: 'Отмена', exact: true }), 'close armor editor');
  await workspace.getByLabel('Поиск по справочнику').fill('QA Сравнимый панцирь');
  await capture(page, 'armor-catalog-details', workspace);
});

for (const named of [false, true]) test(`quality content A/B: ${named ? 'named Patron' : 'Prayer with upgrade'} feature prepares rather than auto-rolls`, async ({ page, baseURL }) => {
  const document = createPopulatedGameDocument();
  const hero = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  const main = named ? await feature('subclasses', 'playtest-pact-of-the-wraithful', 1978) : await feature('classes', 'seraph', 135);
  const support = named ? await feature('classes', 'playtest-warlock', 1972) : await feature('subclasses', 'divine-wielder', 189);
  hero.level = named ? 5 : 2; hero.spellcastTrait = 'strength'; hero.traits.strength = 2;
  hero.sheetCards = [{ ...main, kind: named ? 'subclassFeature' : 'classFeature' }, { ...support, kind: named ? 'classFeature' : 'subclassFeature' }];
  await boot(page, baseURL, document);
  await click(page.locator('.player-roster__item').filter({ hasText: filledCharacterName }).first(), 'select PC');
  await click(page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }), 'features');
  await click(page.getByLabel('Персонаж игрока').getByRole('button', { name: main.name, exact: true }), 'open source feature');
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  await expect(preview).toBeVisible();
  await capture(page, named ? 'patron-source' : 'prayer-source', preview);
  const macros = preview.locator('.player-domain-card-macro');
  const macro = named ? macros.filter({ hasText: /Кост.*Покровител/i }).first() : preview.getByRole('button', { name: 'd4', exact: true }).first();
  const available = await macro.count() > 0;
  observations.push({ macroAvailable: available, macroLabels: await macros.allTextContents() });
  if (process.env.QUALITY_EXPECT_FIXED === '1') expect(available, 'Known feature must expose its inline pool').toBe(true);
  if (available) {
    await click(macro, 'activate inline prepared pool');
    await capture(page, named ? 'patron-prepared' : 'prayer-prepared');
    if (process.env.QUALITY_EXPECT_FIXED === '1') {
      await expect(page.locator('.unified-roll-formula-summary')).toContainText(named ? '3d8' : '3d4');
      await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'Предпросмотр', exact: true })).toBeVisible();
      await expect(page.locator('.unified-roll-composer')).not.toContainText('Контекст не распознан');
    }
  }
});

test('quality content A/B: unavailable WebGL still exposes computed roll', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const prototype = HTMLCanvasElement.prototype as any; const original = prototype.getContext;
    prototype.getContext = function (type: string, ...args: unknown[]) { return /webgl/i.test(type) ? null : original.call(this, type, ...args); };
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await boot(page, baseURL);
  await click(page.getByRole('button', { name: 'Открыть панель костей', exact: true }), 'open tray');
  const tray = page.locator(label === 'release' ? '.mini-dice-launcher__panel' : '.mini-dice-launcher__floating-panel');
  await click(tray.getByRole('button', { name: 'Бросить', exact: true }), 'one roll');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await capture(page, 'webgl-unavailable');
  observations.push({ fallback: await page.locator('.polyhedral-dice-fallback').allTextContents(), rollingEntries: await page.locator('.player-activity-event.dh-is-rolling').count(), errors });
});
