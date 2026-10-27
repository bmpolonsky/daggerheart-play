import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createDomainCard, createExperience } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

const output = '/home/codex/outputs/dh-quality-reaudit-20261027/independent';
const actorId = 'e2e-character-cadsuane';
const trayFor = (page: Page) => page.getByRole('region', { name: 'Подготовка броска', exact: true });

async function boot(page: Page) {
  const document = createPopulatedGameDocument();
  const actor = document.files['data/characters.json'].entities[actorId];
  actor.proficiency = 2; actor.level = 3; actor.spellcastTrait = 'instinct'; actor.traits.instinct = 2;
  actor.hope.value = 3; actor.stress.marked = 0;
  actor.experiences = Array.from({ length: 12 }, (_, index) => ({ ...createExperience(`Область ${index + 1}`, 2), id: `review-exp-${index}` }));
  const catalog = JSON.parse(readFileSync(new URL('../../public/data/domain-cards.json', import.meta.url), 'utf8'));
  const chaos = catalog.data.find((item: any) => item.slug === 'unleash-chaos');
  actor.domainCards = [createDomainCard({ id: 'review-chaos', sourceId: 'domain-card:unleash-chaos', name: chaos.name,
    domain: 'Arcana', inLoadout: true, text: chaos.features.map((item: any) => item.main_body).join('\n\n'), tokens: { value: 2, max: 2 } })];
  const npc = document.files['data/encounter.json'].adversaries['e2e-adversary-ooze'];
  npc.hp = { marked: 0, max: 5 }; npc.thresholds = { major: 8, severe: 14 };
  await openGmGame(page); await importGameDocument(page, document, 'independent-review.dhgame');
  return chaos.name as string;
}
async function selectPc(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
}
async function openTray(page: Page) {
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = trayFor(page); await expect(tray).toBeVisible(); return tray;
}
async function formula(tray: Locator, text?: string) {
  if (!await tray.getByLabel('Формула броска', { exact: true }).isVisible()) await tray.getByRole('button', { name: 'Изменить формулу', exact: true }).click();
  const field = tray.getByLabel('Формула броска', { exact: true });
  if (text !== undefined) { await field.fill(text); await field.blur(); }
  return field;
}
async function shot(page: Page, name: string, target?: Locator) {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/${name}.png` });
  await writeFile(`${output}/${name}.json`, JSON.stringify({ url: page.url(), text: target ? await target.innerText() : undefined,
    bounds: target ? await target.boundingBox() : undefined, viewport: page.viewportSize(),
    fields: target ? await target.locator('input').evaluateAll(elements => elements.map((element: any) => ({ name: element.getAttribute('aria-label'), value: element.value }))) : undefined }, null, 2));
}

test('independent: familiar empty tray, true counts, one bonus removal and explicit privacy', async ({ page }) => {
  await boot(page); const tray = await openTray(page);
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toHaveText('Мастер');
  await tray.getByRole('button', { name: 'Сбросить набор', exact: true }).click();
  await expect(tray.getByLabel('Формула броска', { exact: true })).toHaveCount(0);
  await expect(tray).not.toContainText('Формула пуста');
  await shot(page, '01-empty-dice-first', tray);
  await tray.getByRole('button', { name: 'Добавить d20', exact: true }).click();
  await expect(tray.getByLabel('Итоговая формула')).toHaveText('1d20');
  await tray.getByRole('button', { name: /^Преим\./ }).click();
  await tray.getByRole('button', { name: /^Преим\./ }).click();
  await expect(tray).toContainText('Костей: 3');
  await expect(tray.locator('.feed-die-icon-wrap--advantage')).toHaveCount(1);
  await shot(page, '02-two-green-d20', tray);
  await tray.getByRole('button', { name: 'Убрать преимущество', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Преим. 1', exact: true })).toBeVisible();
  await expect(tray).toContainText('Костей: 2');
  await tray.getByRole('button', { name: 'Помеха', exact: true }).click();
  await expect(tray).toContainText('Костей: 1');
  await expect(tray.locator('.feed-die-icon-wrap--advantage')).toHaveCount(0);
  await tray.getByRole('button', { name: 'Публичный бросок', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Приватный бросок', exact: true })).toBeVisible();
  await shot(page, '03-clear-private-state', tray);
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
});

test('independent: formula and flat modifier stay bidirectional, negative dice are removable', async ({ page }) => {
  await boot(page); const tray = await openTray(page);
  await formula(tray, '1d20+5');
  await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('5');
  await tray.getByLabel('Модификатор', { exact: true }).fill('-2');
  await expect(await formula(tray)).toHaveValue('1d20-2');
  await tray.getByRole('button', { name: 'Увеличить модификатор', exact: true }).click();
  await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('-1');
  await formula(tray, '1d20+7');
  await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('7');
  await formula(tray, '1d20-1d6-3');
  await expect(tray.getByRole('button', { name: 'Убрать минус d6', exact: true })).toBeVisible();
  await shot(page, '04-negative-die-and-modifier', tray);
  await tray.getByRole('button', { name: 'Убрать минус d6', exact: true }).click();
  await expect(await formula(tray)).toHaveValue('1d20-3');
  await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('-3');
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  await openTray(page);
  await expect(tray.getByLabel('Итоговая формула')).toHaveText('1d20-3');
});

test('independent: selected PC starts Duality, viewing another sheet never changes the draft actor', async ({ page }) => {
  await boot(page); await selectPc(page); const tray = await openTray(page);
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toHaveText(filledCharacterName);
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Убрать кость Страха', exact: true })).toBeVisible();
  await tray.getByRole('button', { name: 'Сбросить набор', exact: true }).click();
  await tray.getByRole('button', { name: 'Добавить d8', exact: true }).click();
  await tray.getByRole('button', { name: 'Дуальность', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: 'Ран' }).first().click();
  await openTray(page);
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toHaveText(filledCharacterName);
  await tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true }).click();
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption('gm');
  await expect(tray.getByLabel('Итоговая формула')).toHaveText('1d20');
  await tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true }).click();
  await tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true }).selectOption(`character:${actorId}`);
  await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
  await shot(page, '05-explicit-actor-restores-duality', tray);
});

test('independent: ability remains readable while one prepared pool is dragged and edited without rolling', async ({ page }) => {
  const chaosName = await boot(page); await selectPc(page);
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  await page.getByLabel('Персонаж игрока').locator('.dh-list-item').filter({ hasText: chaosName }).click();
  const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
  await preview.getByRole('button', { name: 'd10', exact: true }).click();
  const tray = trayFor(page); await expect(tray).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await tray.getByRole('spinbutton', { name: /^Жетонов потрачено на эту атаку/ }).fill('2');
  const anchor = (await tray.boundingBox())!;
  const handle = (await page.getByTestId('dice-tray-drag-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x - 250, handle.y - 40, { steps: 10 }); await page.mouse.up();
  expect((await tray.boundingBox())!.x).toBeLessThan(anchor.x - 80);
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
  await tray.getByRole('button', { name: 'Увеличить модификатор', exact: true }).click();
  await expect(preview).toBeVisible();
  await expect(tray.getByLabel('Итоговая формула')).toHaveText('2d10+1d6+1');
  await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
  await shot(page, '06-card-readable-with-editable-tray');
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
  await openTray(page);
  expect((await tray.boundingBox())!.x).toBeGreaterThan(anchor.x - 30);
  await expect(tray.getByLabel('Итоговая формула')).toHaveText('2d10+1d6+1');
  await expect(preview).toBeVisible();
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`independent: expanded experiences keep a genuinely clickable submit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport); await boot(page); await selectPc(page);
    const layers = page.getByLabel('Слой интерфейса');
    if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
    const tray = await openTray(page);
    await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
    await tray.getByRole('checkbox', { name: 'Область 1 +2', exact: true }).check();
    const button = tray.getByRole('button', { name: 'Бросить', exact: true });
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const hit = await button.evaluate(element => { const box = element.getBoundingClientRect(); const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return Boolean(hit && (hit === element || element.contains(hit))); });
    expect(hit).toBe(true);
    const before = await page.getByLabel('Игровая сцена').boundingBox();
    await tray.locator('.unified-roll-composer__body').hover(); await page.mouse.wheel(0, 1500);
    await expect(button).toBeInViewport();
    const after = await page.getByLabel('Игровая сцена').boundingBox();
    expect(after?.y).toBe(before?.y);
    await shot(page, `07-expanded-options-${viewport.width}x${viewport.height}`, tray);
    await expect(page.locator('.player-activity-event--roll')).toHaveCount(0);
  });
}

test('independent: incoming NPC damage is compact, capped, and requires one explicit application', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await boot(page);
  await page.getByLabel('Игровая сцена').getByRole('button', { name: 'Алая Слизь', exact: true }).click();
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  const sheet = page.getByLabel('Противник мастера', { exact: true });
  const details = sheet.locator('details').filter({ has: page.locator('summary', { hasText: 'Входящий урон' }) });
  await details.locator('summary').click();
  await details.getByRole('spinbutton', { name: 'Полученный урон', exact: true }).fill('14');
  expect((await details.boundingBox())!.height).toBeLessThan(170);
  await expect(details).toContainText('0 → 3 из 5');
  await shot(page, '08-compact-incoming-damage', details);
  await details.getByRole('button', { name: 'Применить урон', exact: true }).click();
  await expect(details.getByRole('spinbutton', { name: 'Полученный урон', exact: true })).toHaveValue('');
  await expect(details.getByRole('button', { name: 'Применить урон', exact: true })).toBeDisabled();
  await details.getByRole('spinbutton', { name: 'Полученный урон', exact: true }).fill('14');
  await expect(details).toContainText('3 → 5 из 5');
  await details.getByRole('button', { name: 'Применить урон', exact: true }).click();
  await expect(details.getByRole('status')).toContainText('Отмечено Ран: 2 (5/5)');
  await shot(page, '09-capped-incoming-damage', details);
});
