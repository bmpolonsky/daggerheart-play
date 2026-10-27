import { expect, test, type Page, type Locator } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

// Synthetic UI export:3PC,2tokens,3feed entries,2rolls; no NPC or external assets.
const archive = resolve('tests/fixtures/synthetic-qa-world.dhworld');
const previousPlayerSession = {
  version: 1, role: 'player', roomId: 'SYNTHETIC-PREVIOUS-PLAYER', participantName: 'Synthetic player',
  participantId: 'synthetic-seat', transportPeerId: 'synthetic-peer', updatedAt: '2026-10-27T06:00:00Z'
};

async function storedSummary(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value: any = await new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get('current-game');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const world = value?.worlds?.[value.activeWorldId];
    const state = world?.games?.[world.activeGameId]?.state;
    return {
      worldId: value?.activeWorldId ?? null,
      gameId: world?.activeGameId ?? null,
      worldCount: Object.keys(value?.worlds ?? {}).length,
      characterCount: state?.characters?.order?.length ?? 0,
      selectedCharacterId: state?.characters?.selectedId ?? null,
      npcCount: Object.keys(state?.encounter?.adversaries ?? {}).length,
      tokenCount: Object.values(state?.sceneTable?.scenes ?? {}).reduce((count: number, scene: any) => count + scene.tokens.length, 0),
      feedBodies: (state?.feed ?? []).map((entry: any) => entry.body),
      rollCount: state?.rollLog?.length ?? 0
    };
  });
}

async function seedPreviousPlayer(page: Page) {
  await installDeterministicP2PTransport(page);
  await page.addInitScript((savedSession) => {
    if (localStorage.getItem('synthetic-previous-player-seeded')) return;
    const app = JSON.parse(localStorage.getItem('daggerheart-play') || '{"version":1}');
    app.p2p = { ...app.p2p, activeSession: savedSession };
    localStorage.setItem('daggerheart-play', JSON.stringify(app));
    localStorage.setItem('synthetic-previous-player-seeded', 'yes');
  }, previousPlayerSession);
}

async function worldsInSettings(page: Page) {
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры', exact: true }).click();
  return library;
}

async function importWorld(page: Page, panel: Locator) {
  const previousId = (await storedSummary(page)).worldId;
  await panel.locator('input[type="file"][accept*=".dhworld"]').setInputFiles(archive);
  await expect.poll(async () => (await storedSummary(page)).worldId).not.toBe(previousId);
  await expect(panel.getByText('Мир импортирован: synthetic-qa-world.dhworld', { exact: true })).toBeVisible();
  const summary = await storedSummary(page);
  expect(summary.characterCount).toBe(3);
  expect(summary.npcCount).toBe(0);
  expect(summary.tokenCount).toBe(2);
  expect(summary.feedBodies).toHaveLength(3);
  expect(summary.rollCount).toBe(2);
  return summary;
}

async function addNpcTokenAndChat(page: Page, messageText: string) {
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Справочник', exact: true }).click();
  await library.getByLabel('Коллекции справочника').getByRole('button', { name: 'Противники', exact: true }).click();
  await library.getByRole('searchbox', { name: 'Поиск по справочнику', exact: true }).fill('Бандит');
  await library.locator('.player-library-card').filter({ hasText: 'Бандит' }).first().click();
  await library.getByRole('button', { name: 'Подготовить', exact: true }).click();
  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  await page.getByRole('button', { name: 'Подготовлено', exact: true }).click();
  await page.getByRole('button', { name: /^Добавить Бандит.*на сцену$/ }).click();
  const message = page.getByRole('textbox', { name: 'Сообщение в чат', exact: true });
  await message.fill(messageText);
  await message.press('Enter');
  await expect(page.getByText(messageText, { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedSummary(page)).feedBodies.includes(messageText)).toBe(true);
  await expect.poll(async () => (await storedSummary(page)).tokenCount).toBe(3);
  expect((await storedSummary(page)).npcCount).toBeGreaterThan(0);
}

for (const entry of ['settings', 'lobby'] as const) {
  test(`previous player enters GM, repeats world import via ${entry}, and retains NPC/token/chat on reload`, async ({ page }, testInfo) => {
    await seedPreviousPlayer(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Мастер', exact: true }).click();
    let panel: Locator;
    if (entry === 'settings') {
      await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
      await expect(page.locator('[data-vtt-root]')).toBeVisible();
      panel = await worldsInSettings(page);
    } else {
      await page.getByRole('button', { name: 'Сменить', exact: true }).click();
      panel = page.getByRole('dialog', { name: 'Игры', exact: true });
      await panel.getByRole('button', { name: 'Новый мир', exact: true }).click();
      await panel.getByRole('button', { name: 'Действия с миром Новый мир', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Переименовать', exact: true }).click();
      const rename = page.getByRole('dialog', { name: 'Переименовать мир', exact: true });
      await rename.getByRole('textbox', { name: 'Название мира', exact: true }).fill('До импорта — synthetic');
      await rename.getByRole('button', { name: 'Сохранить', exact: true }).click();
    }
    const first = await importWorld(page, panel);
    const second = await importWorld(page, panel);
    expect(second.worldCount).toBe(first.worldCount + 1);
    if (entry === 'settings') {
      await panel.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
    } else {
      await panel.getByRole('button', { name: 'Действия с миром До импорта — synthetic', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Удалить с устройства', exact: true }).click();
      await page.getByRole('dialog', { name: /Удалить мир/ }).getByRole('button', { name: 'Удалить', exact: true }).click();
      await expect.poll(async () => (await storedSummary(page)).worldCount).toBe(second.worldCount - 1);
      await panel.getByRole('button', { name: 'Закрыть миры', exact: true }).click();
      await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
    }
    await expect(page.locator('[data-vtt-root]')).toHaveClass(/player-view--gm/);
    await addNpcTokenAndChat(page, `Reload retains ${entry} synthetic chat`);
    const before = await storedSummary(page);
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.reload();
      await expect(page.locator('[data-vtt-root]')).toHaveClass(/player-view--gm/);
      await expect(page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: 'QA — Серафим', exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Игровая сцена', exact: true }).getByRole('button', { name: /^Бандит/ })).toBeVisible();
      await expect(page.getByText(`Reload retains ${entry} synthetic chat`, { exact: true })).toBeVisible();
      expect(await storedSummary(page)).toEqual(before);
    }
    // The fix honors workspace intent without deleting the prior player identity.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('daggerheart-play')!).p2p.activeSession)).toEqual(previousPlayerSession);
    await writeFile(testInfo.outputPath('retained-world-summary.json'), JSON.stringify(before, null, 2));
    await page.screenshot({ path: testInfo.outputPath('gm-world-after-reload.png') });
  });
}

test('actual player reload never hydrates or overwrites the saved local GM world', async ({ page }) => {
  await installDeterministicP2PTransport(page);
  await page.goto('/#/game');
  const panel = await worldsInSettings(page);
  await importWorld(page, panel);
  await panel.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  const before = await storedSummary(page);
  await page.evaluate(() => {
    const app = JSON.parse(localStorage.getItem('daggerheart-play')!);
    app.p2p = { ...app.p2p, activeSession: { version: 1, role: 'player', roomId: 'SYNTHETIC-REMOTE-ROOM', participantName: 'Synthetic player', updatedAt: '2026-10-27T06:00:00Z' } };
    localStorage.setItem('daggerheart-play', JSON.stringify(app));
    sessionStorage.setItem('daggerheart-play', JSON.stringify({ version: 1, p2p: { workspaceRole: 'player' } }));
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.reload();
    await expect(page.locator('[data-vtt-root]')).toHaveClass(/player-view--player/);
    await expect(page.getByRole('button', { name: 'QA — Серафим', exact: true })).toHaveCount(0);
    await expect(page.getByText('Продолжительный отдых', { exact: true })).toHaveCount(0);
    expect(await storedSummary(page)).toEqual(before);
  }
});
