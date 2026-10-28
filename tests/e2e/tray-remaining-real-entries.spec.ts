import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { remainingTrayWorld, type RemainingTrayCase } from '../fixtures/remainingTrayWorld';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const output = process.env.TRAY_REMAINING_OUTPUT;
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const library: any = await new Promise((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    const world = library.worlds[library.activeWorldId]; return world.games[world.activeGameId].state;
  });
}
async function shot(page: Page, name: string) { if (output) { mkdirSync(output, { recursive: true }); await page.waitForTimeout(250); await page.screenshot({ path: `${output}/${name}.png` }); } }
async function open(page: Page, kind: RemainingTrayCase, width: number) {
  await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const fixture = await remainingTrayWorld(kind), name = `remaining-${kind}.dhworld`;
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки' }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры' }).click();
  await library.locator('input[type="file"][accept*=".dhworld"]').setInputFiles({ name, mimeType: 'application/zip', buffer: fixture.buffer });
  await expect(library.getByText(`Мир импортирован: ${name}`)).toBeVisible();
  await library.getByRole('button', { name: 'Закрыть библиотеку' }).click();
  await expect.poll(async () => (await saved(page)).characters.order.length).toBe(26);
  if (kind !== 'risk') await page.locator('.player-roster__item').filter({ hasText: kind === 'countdown' ? fixture.environmentName : fixture.actorName }).first().click();
  await page.setViewportSize({ width, height: width === 390 ? 844 : 757 });
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: kind === 'risk' ? /^Чат(?:\.|$)/ : 'Лист', exact: kind !== 'risk' }).click();
  else if (kind === 'risk') { const chat = page.getByRole('button', { name: /^Открыть чат/ }); if (await chat.isVisible()) await chat.click(); }
  if (output && width === 1180) writeFileSync(`${output}/${name}`, fixture.buffer);
  return fixture;
}
async function acceptTray(page: Page) {
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray).toBeVisible(); const replace = tray.getByRole('button', { name: 'Заменить подготовленный бросок', exact: true }); if (await replace.isVisible()) await replace.click(); return tray;
}
for (const width of [1180,390]) for (const kind of ['siphon','combo','countdown','weapon-single','weapon-sequence'] as const) test(`real ${kind} source and every branch at ${width}`, async ({ page }) => {
  const fixture = await open(page, kind, width); const initial = await saved(page);
  if (kind === 'countdown') {
    await shot(page, `${kind}-${width}-source`);
    await page.getByLabel('Окружение мастера', { exact: true }).getByRole('button', { name: fixture.macroLabel, exact: true }).first().click();
  } else {
    const tabs = page.getByLabel('Разделы листа персонажа'); await tabs.getByRole('button', { name: kind === 'siphon' ? 'Карты' : kind === 'combo' ? 'Свойства' : 'Оружие', exact: true }).click();
    const sheet = page.getByLabel('Персонаж игрока', { exact: true });
    if (kind === 'combo') await sheet.getByRole('button', { name: fixture.sourceName, exact: true }).click();
    else await sheet.locator('.dh-list-item').filter({ hasText: fixture.sourceName }).first().click();
    const preview = page.getByLabel('Предпросмотр', { exact: true }); await expect(preview).toBeVisible();
    await shot(page, `${kind}-${width}-source`); await preview.getByRole('button', { name: fixture.macroLabel, exact: true }).first().click();
  }
  const tray = await acceptTray(page), select = tray.getByRole('combobox', { name: 'Вариант способности', exact: true });
  await expect(select).toBeVisible(); await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await shot(page, `${kind}-${width}-unselected`);
  const branches = await select.locator('option').evaluateAll(options => options.map(option => ({ value: (option as HTMLOptionElement).value, label: option.textContent })).filter(option => option.value));
  expect(branches).toHaveLength(kind === 'siphon' ? 2 : kind === 'countdown' ? 3 : 6);
  const formulas = [];
  for (let index = 0; index < branches.length; index++) {
    const branch = branches[index]; await select.selectOption(branch.value);
    if (kind === 'weapon-sequence') {
      await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
      await tray.getByRole('spinbutton', { name: /^Дополнительных костей этого срабатывания/ }).fill('2');
    }
    const formula = kind === 'siphon' ? `${fixture.proficiency + index}d12+4` : kind === 'countdown' ? `${index + 1}d12` : `${kind === 'weapon-sequence' ? 2 : 1}d${[4,6,8,10,12,20][index]}`;
    await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText(formula); await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeEnabled();
    formulas.push(formula); await shot(page, `${kind}-${width}-branch-${index + 1}`);
  }
  const unchanged = await saved(page); expect(unchanged.rollLog).toHaveLength(0); expect(unchanged.characters.entities[fixture.actorId].hope).toEqual(initial.characters.entities[fixture.actorId].hope); expect(unchanged.characters.entities[fixture.actorId].stress).toEqual(initial.characters.entities[fixture.actorId].stress);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => (await saved(page)).rollLog.length).toBe(1);
  const final = await saved(page); expect(final.rollLog[0].formula).toBe(formulas.at(-1));
  expect(final.characters.entities[fixture.actorId].hope).toEqual(initial.characters.entities[fixture.actorId].hope);
  if (output) writeFileSync(`${output}/${kind}-${width}-result.json`, JSON.stringify({ branches, formulas, result: final.rollLog[0], characters: final.characters.order.length }, null, 2));
});
for (const width of [1180,390]) test(`real Risk It All button, fixed pool and repeated-submit guard at ${width}`, async ({ page }) => {
  const fixture = await open(page, 'risk', width); const card = page.locator('.feed-death-move-card');
  await shot(page, `risk-${width}-source`); await card.getByRole('button', { name: 'Рискнуть всем', exact: true }).click();
  let tray = await acceptTray(page); await expect(tray.getByLabel('Исполнитель броска', { exact: true })).toContainText(fixture.actorName); await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12');
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click(); expect((await saved(page)).rollLog).toHaveLength(0);
  await card.getByRole('button', { name: 'Рискнуть всем', exact: true }).click(); tray = await acceptTray(page);
  await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click(); await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled(); await shot(page, `risk-${width}-blocked`);
  await tray.getByRole('button', { name: 'Убрать d6', exact: true }).click(); await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeEnabled();
  await page.evaluate(() => { const original = Math.random; let index = 0; const values = [10,2]; Math.random = () => index < values.length ? (values[index++] - .5) / 12 : original(); });
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click(); await expect.poll(async () => (await saved(page)).rollLog.length).toBe(1);
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  const state = await saved(page), event = state.feed.find((entry: any) => entry.id === 'qa-remaining-risk');
  expect(event.deathMove.status).toBe('resolved'); expect(event.deathMove.roll.hopeDie).toBe(10); expect(event.deathMove.roll.fearDie).toBe(2); expect(event.deathMove.rollId).toBe(state.rollLog[0].id);
  await shot(page, `risk-${width}-applied`); await page.reload(); await expect(page.locator('[data-vtt-root]')).toBeVisible(); expect((await saved(page)).rollLog).toHaveLength(1);
  if (output) writeFileSync(`${output}/risk-${width}-result.json`, JSON.stringify({ event, roll: state.rollLog[0], characters: state.characters.order.length }, null, 2));
});
for (const width of [1180,390]) test(`real beastform activation and alias attack/damage at ${width}`, async ({ page }) => {
  const fixture = await open(page, 'beastform', width); const sheet = page.getByLabel('Персонаж игрока', { exact: true });
  const before = await saved(page), entry = sheet.getByRole('button', { name: 'Управление звериной формой', exact: true }); await entry.click();
  const preview = page.getByLabel('Предпросмотр', { exact: true }), panel = preview.getByRole('region', { name: 'Звериная форма', exact: true });
  await panel.getByRole('button', { name: 'Звериная форма', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор: Звериная форма', exact: true }); await picker.getByRole('option', { name: /^Водный разведчик/ }).click(); await picker.getByRole('button', { name: /^(Выбрать|Выбрано)$/ }).click();
  await panel.getByRole('button', { name: 'Форма', exact: true }).click(); await expect(panel.getByRole('button', { name: 'Выйти', exact: true })).toBeVisible(); await preview.getByRole('button', { name: 'Закрыть предпросмотр', exact: true }).click();
  await expect(entry).toContainText('Активна: Водный разведчик'); await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие', exact: true }).click();
  const alias = sheet.locator('.dh-list-item').filter({ hasText: 'Водный разведчик: атака' }); await expect(alias).toBeVisible(); await expect(alias.getByRole('button', { name: /^Снять/ })).toHaveCount(0); await shot(page, `beastform-${width}-source`);
  await alias.getByRole('button', { name: 'Атака', exact: true }).click(); let tray = await acceptTray(page); await expect(tray.getByLabel('Итоговая формула', { exact: true })).toContainText('2d12'); await shot(page, `beastform-${width}-attack`);
  expect((await saved(page)).rollLog).toHaveLength(0); await tray.getByRole('button', { name: 'Бросить', exact: true }).click(); await expect.poll(async () => (await saved(page)).rollLog.length).toBe(1);
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click(); await alias.getByRole('button', { name: 'Урон', exact: true }).click(); tray = await acceptTray(page);
  const formula = await tray.getByLabel('Итоговая формула', { exact: true }).textContent(); expect(formula).toMatch(/d[468]/); expect(formula).not.toContain('2d12'); await shot(page, `beastform-${width}-damage`);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click(); await expect.poll(async () => (await saved(page)).rollLog.length).toBe(2);
  const after = await saved(page); expect(after.rollLog[0].actorId).toBe(fixture.actorId); expect(after.rollLog[1].actorId).toBe(fixture.actorId); expect(after.rollLog.map((roll: any) => roll.type).sort()).toEqual(['action','damage']); expect(after.characters.entities[fixture.actorId].stress.marked).toBe(1);
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click(); await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства', exact: true }).click(); await entry.click(); await panel.getByRole('button', { name: 'Выйти', exact: true }).click();
  expect((await saved(page)).characters.entities[fixture.actorId].weapons).toEqual(before.characters.entities[fixture.actorId].weapons);
  if (output) writeFileSync(`${output}/beastform-${width}-result.json`, JSON.stringify({ formula, rolls: after.rollLog, characterId: fixture.actorId, characters: after.characters.order.length }, null, 2));
});
