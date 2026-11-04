import { test, expect, type Page } from '@playwright/test';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createCountdown, createGameHandout } from '../../src/domain/rules/factories';
import { readStoredGameState } from './persistence-helpers';
const before = process.env.RECOVERY_BEFORE === '1';
const id = 'e2e-character-cadsuane', name = 'QA — восстановление';
async function libraryState(page: Page): Promise<any> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const result = await new Promise(resolve => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); }); db.close(); return result;
  });
}
async function holdWriter(page: Page) {
  const holder = await page.context().newPage();
  await holder.route('**/qa-lock-holder', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>ready</body>' }));
  await holder.goto('/qa-lock-holder');
  await holder.evaluate(() => { void navigator.locks.request('daggerheart-play:game-document', async () => { document.body.textContent = 'held'; await new Promise<void>(resolve => { (window as any).releaseQA = resolve; }); }); });
  await expect(holder.locator('body')).toHaveText('held');
  return async () => { await holder.evaluate(() => (window as any).releaseQA()); await holder.close(); };
}
function target(state: any, kind: string) {
  if (kind === 'threshold') return state.characters.entities[id].armor.baseMajor;
  if (kind === 'handout') return state.game.handouts.find((x: any) => x.id === 'qa-handout').visibleToPlayers;
  return state.encounter.countdowns.find((x: any) => x.id === 'qa-countdown').visibility;
}
for (const kind of ['threshold', 'handout', 'countdown']) for (const mode of ['reload', 'hard-close']) {
 test(`${kind} recovers the last edit after ${mode} without overwriting the original world`, async ({ page, context }, info) => {
  test.setTimeout(60000);
  const width = kind === 'handout' ? 400 : 1180;
  await page.setViewportSize({ width: 1440, height: 900 }); await openGmGame(page);
  const doc = createPopulatedGameDocument(), hero = doc.files['data/characters.json'].entities[id];
  hero.name = name; hero.level = 1; hero.sheetCards = []; hero.ruleModifiers = [];
  hero.armor = { ...hero.armor, name: 'QA броня', equipped: true, baseMajor: 6, baseSevere: 13, score: 2, feature: '', featureText: '' };
  doc.files['data/game.json'].handouts = [createGameHandout({ id: 'qa-handout', title: 'QA — записка', visibleToPlayers: true })];
  doc.files['data/encounter.json'].countdowns = [createCountdown({ id: 'qa-countdown', name: 'QA — отсчёт', visibility: 'gm', max: 4, current: 4 })];
  await importGameDocument(page, doc, 'recovery-source.dhgame', name);
  const baseline = kind === 'threshold' ? 6 : kind === 'handout' ? true : 'gm';
  const edited = kind === 'threshold' ? 10 : kind === 'handout' ? false : 'public';
  let edit: () => Promise<void>;
  if (kind === 'threshold') {
    const library = await openGameLibrary(page); await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByRole('navigation', { name: 'Ростер персонажей' }).getByRole('button', { name, exact: true }).click();
    const editor = library.getByRole('region', { name: 'Редактор персонажа', exact: true });
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики', exact: true }).click();
    await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await editor.locator('summary').filter({ hasText: 'Тонкая настройка брони и порогов' }).click();
    edit = async () => { const input = editor.getByRole('spinbutton', { name: 'База Ощутимого', exact: true }); await input.fill('10'); await input.press('Tab'); };
  } else if (kind === 'handout') {
    const library = await openGameLibrary(page); await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Раздатка', exact: true }).click();
    edit = () => library.getByRole('checkbox', { name: 'Доступна игрокам', exact: true }).uncheck();
  } else {
    const field = page.getByLabel('Название отсчета', { exact: true });
    const card = field.locator('xpath=ancestor::article[contains(@class, "player-countdown-card")]');
    edit = () => card.getByTitle('Показать игрокам', { exact: true }).click();
  }
  await expect.poll(async () => target(await readStoredGameState(page), kind)).toBe(baseline);
  const original = await libraryState(page), originalWorld = original.activeWorldId;
  const release = await holdWriter(page);
  let current = page, warnings = 0;
  try {
    await edit();
    expect(target(await readStoredGameState(page), kind)).toBe(baseline);
    if (mode === 'reload') {
      page.on('dialog', async dialog => { expect(dialog.type()).toBe('beforeunload'); warnings += 1; await dialog.accept(); });
      await page.reload(); expect(warnings).toBe(1);
    } else {
      await page.close({ runBeforeUnload: false }); // Unexpected closure: no beforeunload opportunity.
      current = await context.newPage(); await current.goto('/#/game');
    }
    await current.setViewportSize({ width, height: 757 });
    const recovery = current.getByRole('dialog', { name: 'Восстановление изменений', exact: true });
    if (before) {
      await expect(current.getByRole('button', { name: 'Открыть панель костей', exact: true })).toBeVisible();
      await expect(recovery).toHaveCount(0);
      expect(target(await readStoredGameState(current), kind)).toBe(baseline);
      await current.screenshot({ path: info.outputPath(`${kind}-${mode}-lost-before-${width}.png`) });
      await release();
      await info.attach('controlled-loss', { body: JSON.stringify({ kind, mode, baseline, edited, observed: baseline, recoveryAvailable: false, rootPersonalQA: false }), contentType: 'application/json' });
      return;
    }
    await expect(recovery).toBeVisible();
    await expect(current.getByRole('dialog')).toHaveCount(1);
    await recovery.getByRole('combobox', { name: 'Восстановительная копия', exact: true }).focus();
    await current.keyboard.press('Tab');
    await expect(recovery.getByRole('button', { name: 'Не сейчас', exact: true })).toBeFocused();
    await current.screenshot({ path: info.outputPath(`${kind}-${mode}-offer-${width}.png`) });
    // The source transaction is still blocked; the offer came from the synchronous journal.
    expect(target(await readStoredGameState(current), kind)).toBe(baseline);
    if (kind === 'handout' && mode === 'hard-close') {
      await recovery.getByRole('button', { name: 'Не сейчас', exact: true }).click(); await expect(recovery).toHaveCount(0);
      await current.reload(); await expect(recovery).toBeVisible();
    }
    await release();
    const journalFacts = async () => ({ library: await libraryState(current), drafts: await current.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('daggerheart-play:recovery:v1:')).map(key => JSON.parse(localStorage.getItem(key)!))) });
    await info.attach('before-restore-storage', { body: JSON.stringify(await journalFacts()), contentType: 'application/json' });
    await recovery.getByRole('button', { name: 'Восстановить отдельный мир', exact: true }).click();
    try { await expect(recovery).toHaveCount(0); }
    finally { await info.attach('after-restore-storage', { body: JSON.stringify(await journalFacts()), contentType: 'application/json' }); }
    await expect.poll(async () => target(await readStoredGameState(current), kind)).toBe(edited);
    const after = await libraryState(current); expect(after.activeWorldId).not.toBe(originalWorld);
    const old = after.worlds[originalWorld]; expect(target(old.games[old.activeGameId].state, kind)).toBe(baseline);
    await current.screenshot({ path: info.outputPath(`${kind}-${mode}-recovered-${width}.png`) });
    await current.reload(); await expect(recovery).toHaveCount(0); expect(target(await readStoredGameState(current), kind)).toBe(edited);
    await info.attach('recovery-result', { body: JSON.stringify({ kind, mode, baseline, edited, warnings, sourceWorldPreserved: true, recoveredWorldDistinct: true, rootPersonalQA: false }), contentType: 'application/json' });
  } finally { await release().catch(() => {}); }
 });
}

test('journal cost and payload on the complete 26-character synthetic world', async ({ page }, info) => {
  test.skip(before, 'Benchmark is relevant only to the journal candidate');
  test.setTimeout(60000); await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры', exact: true }).click();
  await library.locator('input[type="file"][accept*=".dhworld"]').setInputFiles('tests/fixtures/qa-world/synthetic-coverage-world.dhworld');
  await expect(library.getByText('Мир импортирован: synthetic-coverage-world.dhworld', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  const release = await holdWriter(page);
  try {
    const costs = await page.getByRole('group', { name: 'Страх', exact: true }).getByRole('button').evaluateAll(buttons => {
      const durations: number[] = [];
      for (let index = 0; index < 25; index++) { const start = performance.now(); (buttons[index % 2] as HTMLButtonElement).click(); durations.push(performance.now() - start); }
      const record = Object.keys(localStorage).filter(key => key.startsWith('daggerheart-play:recovery:v1:')).map(key => localStorage.getItem(key)!).sort((a, b) => b.length - a.length)[0];
      return { samples: durations.length, medianMs: durations.sort((a, b) => a - b)[12], maxMs: Math.max(...durations), journalBytesUTF8: record ? new Blob([record]).size : 0, instrumentation: 'synthetic DOM click loop measuring synchronous event/store/journal path; not native-device latency' };
    });
    expect(costs.journalBytesUTF8).toBeGreaterThan(1000); await info.attach('journal-performance', { body: JSON.stringify(costs), contentType: 'application/json' });
  } finally { await release(); }
});

test('two local tabs restore one copy and preserve a newer durable edit', async ({ page, context }, info) => {
  test.setTimeout(60000); test.skip(before);
  await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const doc = createPopulatedGameDocument(); doc.files['data/game.json'].fear = 1;
  doc.files['data/game.json'].handouts = [createGameHandout({ id: 'qa-handout', title: 'QA — конфликт', visibleToPlayers: true })];
  await importGameDocument(page, doc, 'recovery-two-tabs.dhgame');
  const library = await openGameLibrary(page); await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Раздатка', exact: true }).click();
  await expect.poll(async () => (await readStoredGameState(page)).game.handouts[0].visibleToPlayers).toBe(true);
  const source = await libraryState(page), sourceId = source.activeWorldId;
  const release = await holdWriter(page);
  await library.getByRole('checkbox', { name: 'Доступна игрокам', exact: true }).uncheck();
  await page.close({ runBeforeUnload: false });
  const a = await context.newPage(); await a.goto('/#/game');
  const recoveryA = a.getByRole('dialog', { name: 'Восстановление изменений', exact: true }); await expect(recoveryA).toBeVisible();
  await release();
  const b = await context.newPage(); await b.goto('/#/game');
  const recoveryB = b.getByRole('dialog', { name: 'Восстановление изменений', exact: true }); await expect(recoveryB).toBeVisible();
  await recoveryB.getByRole('button', { name: 'Не сейчас', exact: true }).click();
  await b.getByRole('group', { name: 'Страх', exact: true }).getByRole('button', { name: 'Страх 9 из 12', exact: true }).click();
  await expect.poll(async () => (await readStoredGameState(b)).game.fear).toBe(9);
  await b.reload(); await expect(recoveryB).toBeVisible();
  await Promise.all([
    recoveryA.getByRole('button', { name: 'Восстановить отдельный мир', exact: true }).click(),
    recoveryB.getByRole('button', { name: 'Восстановить отдельный мир', exact: true }).click()
  ]);
  await expect(recoveryA).toHaveCount(0); await expect(recoveryB).toHaveCount(0);
  const result = await libraryState(a); expect(Object.keys(result.worlds)).toHaveLength(2);
  const original = result.worlds[sourceId];
  expect(original.games[original.activeGameId].state.game.fear).toBe(9);
  expect(original.games[original.activeGameId].state.game.handouts[0].visibleToPlayers).toBe(true);
  const copy = result.worlds[result.activeWorldId]; expect(copy.id).not.toBe(sourceId); expect(copy.name).toContain('восстановленная копия');
  expect(copy.games[copy.activeGameId].state.game.handouts[0].visibleToPlayers).toBe(false);
  await a.reload(); await expect(recoveryA).toHaveCount(0);
  expect(Object.keys((await libraryState(a)).worlds)).toHaveLength(2);
  await info.attach('two-tab-result', { body: JSON.stringify({ localTabs: 2, liveRTC: false, worlds: 2, sourceNewerFear: 9, sourceVisibility: true, recoveredVisibility: false, distinctNames: true, rootPersonalQA: false }), contentType: 'application/json' });
  await a.screenshot({ path: info.outputPath('two-tabs-one-copy.png') });
});

test('recovery after switching worlds keeps the second world custom catalog', async ({ page, context }, info) => {
  test.setTimeout(60000); test.skip(before);
  await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const catalog = await (await page.request.get('/data/equipment.json')).json();
  const raw = catalog.data[0];
  const a = createPopulatedGameDocument(); a.files['data/game.json'].name = 'QA World A'; a.manifest.name = 'QA World A'; a.files['manifest.json'].name = 'QA World A';
  a.files['content/custom-equipment.json'] = [{ ...raw, name: 'QA custom A', slug: 'qa-custom-a', source_slugs: ['custom'] }];
  await importGameDocument(page, a, 'qa-world-a.dhgame');
  await page.getByRole('group', { name: 'Страх', exact: true }).getByRole('button', { name: 'Страх 1 из 12', exact: true }).click();
  await expect.poll(async () => (await readStoredGameState(page)).game.fear).toBe(1);
  const b = createPopulatedGameDocument(); b.files['data/game.json'].name = 'QA World B'; b.manifest.name = 'QA World B'; b.files['manifest.json'].name = 'QA World B';
  b.files['content/custom-equipment.json'] = [{ ...raw, name: 'QA custom B', slug: 'qa-custom-b', source_slugs: ['custom'] }];
  b.files['data/game.json'].handouts = [createGameHandout({ id: 'qa-b-handout', title: 'QA B handout', visibleToPlayers: true })];
  await importGameDocument(page, b, 'qa-world-b.dhgame');
  const original = await libraryState(page), worldB = original.activeWorldId;
  const library = await openGameLibrary(page); await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Раздатка', exact: true }).click();
  const release = await holdWriter(page);
  try {
    await library.getByRole('checkbox', { name: 'Доступна игрокам', exact: true }).uncheck();
    await page.close({ runBeforeUnload: false });
    const next = await context.newPage(); await next.goto('/#/game');
    const recovery = next.getByRole('dialog', { name: 'Восстановление изменений', exact: true }); await expect(recovery).toBeVisible();
    await release(); await recovery.getByRole('button', { name: 'Восстановить отдельный мир', exact: true }).click(); await expect(recovery).toHaveCount(0);
    const result = await libraryState(next); expect(Object.keys(result.worlds)).toHaveLength(3);
    expect(result.worlds[result.activeWorldId].shared.customContent.equipment[0].slug).toBe('qa-custom-b');
    expect(result.worlds[worldB].shared.customContent.equipment[0].slug).toBe('qa-custom-b');
    expect(Object.values(result.worlds).some((world: any) => world.shared.customContent.equipment[0]?.slug === 'qa-custom-a')).toBe(true);
    const copy = result.worlds[result.activeWorldId]; expect(copy.games[copy.activeGameId].state.game.handouts[0].visibleToPlayers).toBe(false);
    await info.attach('custom-catalog-isolation', { body: JSON.stringify({ worlds: 3, sourceA: 'qa-custom-a', sourceB: 'qa-custom-b', recovered: 'qa-custom-b', rootPersonalQA: false }), contentType: 'application/json' });
  } finally { await release().catch(() => {}); }
});
