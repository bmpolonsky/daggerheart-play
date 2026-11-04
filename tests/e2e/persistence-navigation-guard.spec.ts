import { expect, test, type Page } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { readStoredGameState as stored } from './persistence-helpers';
import { openGameLibrary } from './tools-helpers';

async function guardIsActive(page: Page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  });
}

async function lockWriter(page: Page) {
  const holder = await page.context().newPage();
  await holder.route('**/qa-lock-holder', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>ready</body>' }));
  await holder.goto('/qa-lock-holder');
  await holder.evaluate(() => { void navigator.locks.request('daggerheart-play:game-document', async () => {
    document.body.textContent = 'held'; await new Promise<void>(resolve => { (window as any).releaseQALock = resolve; });
  }); });
  await expect(holder.locator('body')).toHaveText('held');
  return async () => { await holder.evaluate(() => (window as any).releaseQALock()); await holder.close(); };
}

for (const held of [false, true]) test(`Evolution reload protects pending data with writer lock=${held}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const document = createPopulatedGameDocument(); const hero = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.className = 'Druid'; hero.classSlug = 'druid'; hero.classSourceId = 'class:druid'; hero.hope.value = 3; hero.stress.marked = 0; hero.sheetCards = []; hero.domainCards = [];
  await importGameDocument(page, document, 'guard-druid.dhgame');
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  const sheet = page.getByLabel('Персонаж игрока', { exact: true });
  const entry = sheet.getByRole('button', { name: 'Управление звериной формой', exact: true }); await entry.click();
  const preview = page.getByLabel('Предпросмотр', { exact: true }); const panel = preview.getByRole('region', { name: 'Звериная форма', exact: true });
  await panel.getByRole('button', { name: 'Звериная форма', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Выбор: Звериная форма', exact: true });
  await picker.getByRole('option', { name: /^Водный разведчик/ }).click(); await picker.getByRole('button', { name: /^(Выбрать|Выбрано)$/ }).click();
  await panel.getByRole('combobox', { name: 'Характеристика Эволюции', exact: true }).selectOption('strength');
  await expect.poll(() => guardIsActive(page)).toBe(false);
  const release = held ? await lockWriter(page) : null;
  let dialogs = 0;
  const dismiss = async (dialog: any) => { expect(dialog.type()).toBe('beforeunload'); dialogs += 1; await dialog.dismiss(); };
  page.on('dialog', dismiss);
  try {
    await panel.getByRole('button', { name: 'Эволюция', exact: true }).click();
    await expect(entry).toContainText('Активна: Водный разведчик');
    // Real browser reload, not a dispatched DOM event: cancel its native warning.
    await page.evaluate(() => { (window as any).__guardOriginalDocument = 'same-document'; });
    await page.reload({ timeout: 1500 }).catch(error => {
      // Chromium can leave Playwright waiting for navigation after the user
      // cancels beforeunload. Require the actual dialog and same live document.
      expect(String(error)).toMatch(/ERR_ABORTED|net::|Timeout 1500ms/);
    });
    expect(dialogs).toBe(1);
    expect(await page.evaluate(() => (window as any).__guardOriginalDocument)).toBe('same-document');
    await expect(entry).toContainText('Активна: Водный разведчик');
    if (held) {
      expect((await stored(page)).characters.entities[hero.id].hope.value).toBe(3);
      expect(await guardIsActive(page)).toBe(true);
    }
  } finally { if (release) await release(); }
  await expect.poll(async () => (await stored(page)).characters.entities[hero.id].activeBeastform?.name).toBe('Водный разведчик');
  await expect.poll(async () => (await stored(page)).characters.entities[hero.id].hope.value).toBe(0);
  await expect.poll(() => guardIsActive(page)).toBe(false);
  await page.screenshot({ path: info.outputPath(`saved-before-reload-${held}.png`) });
  await page.reload(); expect(dialogs).toBe(1);
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click();
  await expect(entry).toContainText('Активна: Водный разведчик');
  await info.attach('committed-state', { body: JSON.stringify(await stored(page)), contentType: 'application/json' });
});

for (const width of [1280, 400]) test(`two app tabs retain the newer committed value and show an explicit conflict for the dirty tab at ${width}`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: 720 });
  await openGmGame(page);
  const destination = createPopulatedGameDocument(); destination.files['data/game.json'].name = 'Guard destination';
  await importGameDocument(page, destination, 'guard-destination.dhgame');
  await importGameDocument(page, createPopulatedGameDocument(), 'guard-conflict.dhgame');
  const other = await context.newPage(); await openGmGame(other);
  const fear = (p: Page, value: number) => p.getByRole('group', { name: 'Страх', exact: true }).getByRole('button', { name: `Страх ${value} из 12`, exact: true });
  await expect.poll(() => guardIsActive(page)).toBe(false); await expect.poll(() => guardIsActive(other)).toBe(false);
  if (width < 640) await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Сцена', exact: true }).click();
  const release = await lockWriter(page);
  try {
    await fear(other, 9).click();
    expect(await guardIsActive(other)).toBe(true); // Queue the other tab first behind the held real lock.
    await fear(page, 2).click();
  } finally { await release(); }
  await expect.poll(async () => (await stored(page)).game.fear).toBe(9);
  await expect(page.getByRole('alert').filter({ hasText: 'Мир изменён в другой вкладке' })).toBeVisible();
  await expect(fear(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(fear(page, 3)).toHaveAttribute('aria-pressed', 'false');
  expect(await guardIsActive(page)).toBe(true);
  await expect.poll(() => guardIsActive(other)).toBe(false);
  await page.screenshot({ path: info.outputPath('dirty-tab-conflict.png') });
  expect((await stored(page)).game.fear).toBe(9);
  await info.attach('newer-committed-state', { body: JSON.stringify(await stored(page)), contentType: 'application/json' });
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры', exact: true }).click();
  await library.getByRole('button', { name: 'Открыть', exact: true }).first().click();
  const conflict = 'Мир изменён в другой вкладке. Ваши изменения ещё не сохранены; оставьте эту вкладку открытой.';
  await expect(library.getByText(conflict, { exact: true })).toBeVisible();
  expect((await stored(page)).game.fear).toBe(9);
  await library.getByRole('button', { name: 'Новый мир', exact: true }).click();
  await expect(library.getByText(conflict, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('conflict-blocks-world-transition.png') });
  // The error must remain visible without covering the dialog's close action.
  await expect(library.getByRole('alert').filter({ hasText: 'Изменения не сохранены' })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`notification-before-close-${width}.png`) });
  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Изменения не сохранены' })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`notification-after-close-${width}.png`) });
  await expect(fear(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect((await stored(page)).game.fear).toBe(9);
  expect(await guardIsActive(page)).toBe(true);
  await other.close();
});
