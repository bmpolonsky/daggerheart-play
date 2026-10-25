import { expect, test, type Page } from '@playwright/test';
import type { FeedEntry } from '../../src/domain/rules/types';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { createIsolatedDeterministicP2PRelay, openSharedGmGame, openSharedPlayerGame } from './game-route-helpers';

const actorId = 'e2e-character-cadsuane';
const restEntryId = 'background-rest-entry';
const heal = 'Залечить все Раны';
const prepare = 'Подготовка';

async function showSheet(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  return page.getByLabel('Персонаж игрока');
}
async function showChat(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: /Чат/ }).click();
  else if (!await page.getByLabel('Чат игры').isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
}
async function snapshotState(page: Page) {
  return page.evaluate(async ({ actorId, restEntryId }) => {
    const project: any = await new Promise((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('documents', 'readonly');
        const read = tx.objectStore('documents').get('current-game');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result);
        tx.oncomplete = () => db.close();
      };
    });
    const world = project?.worlds?.[project?.activeWorldId] ?? project;
    const state = world?.games?.[world?.activeGameId]?.state;
    const actor = state?.characters?.entities?.[actorId];
    const rest = state?.feed?.find((entry: any) => entry.id === restEntryId)?.rest;
    return { hope: actor?.hope.value, wounds: actor?.hp.marked, fear: state?.game.fear,
      restStatus: rest?.status,
      results: rest?.participants?.[0]?.choices?.map((choice: any) => ({ label: choice.label, status: choice.status, applied: choice.result?.appliedAmount })) };
  }, { actorId, restEntryId });
}

// This is a modeled visibility/snapshot-loss regression using the existing
// mocked application transport. It is NOT native RTC or physical OS suspension.
test('mocked transport: mobile foreground restores latest resources and completed rest without replaying recovery', async ({ browser }) => {
  test.setTimeout(90_000);
  const relay = await createIsolatedDeterministicP2PRelay(browser, ['background-gm', 'background-player']);
  const [gm, player] = relay.clients.map(client => client.page);
  await player.setViewportSize({ width: 390, height: 844 });
  const roomId = `BG${Date.now().toString().slice(-7)}`;
  try {
    await openSharedGmGame(gm, roomId);
    const game = createPopulatedGameDocument();
    game.files['data/game.json'].fear = 0;
    const character = game.files['data/characters.json'].entities[actorId];
    character.hp.marked = 2;
    character.hope.value = 2;
    const stamp = new Date().toISOString();
    const rest: FeedEntry = { id: restEntryId, type: 'rest', createdAt: stamp, visibility: 'public', publication: 'public', authorName: 'Мастер QA',
      title: 'Возврат после фона — QA', body: '', rest: { id: 'background-rest', restType: 'long', status: 'collecting', requestedAt: stamp,
        participants: [{ actorId, actorName: filledCharacterName, ready: true, choices: [
          { id: 'background-heal', label: heal, count: 1, status: 'selected' },
          { id: 'background-prepare', label: prepare, count: 1, status: 'selected' }
        ] }], availableMoves: [heal, prepare], maxChoicesPerParticipant: 2 } };
    game.files['data/feed.json'] = [rest];
    await importGameDocument(gm, game, 'synthetic-background-recovery.dhgame');
    await openSharedPlayerGame(player, roomId);
    const picker = player.getByRole('region', { name: 'Выбор игрока' });
    await expect(picker).toBeVisible({ timeout: 15_000 });
    await picker.getByRole('button', { name: `Игрок 1 ${filledCharacterName}` }).click();
    const playerSheet = await showSheet(player);
    await expect(playerSheet).toContainText(filledCharacterName);
    await expect(playerSheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(2);
    await expect(playerSheet.getByRole('button', { name: 'Раны 2 из 5', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Intercept only snapshot delivery to this isolated player. Control/ACK
    // traffic still uses the existing fixture; helpers and application source
    // are untouched. Retain a synthetic snapshot only inside the test page.
    await player.evaluate(({ actorId, restEntryId }) => {
      const host = window as any;
      const receive = host.__DAGGERHEART_E2E_RELAY_RECEIVE__;
      if (typeof receive !== 'function') throw new Error('Isolated relay receiver missing');
      const background = host.__E2E_BACKGROUND_RECOVERY__ = { hidden: true, dropped: 0, delivered: 0, lastSnapshot: null, summary: null as { hope?: number; wounds?: number; restStatus?: string } | null };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => background.hidden ? 'hidden' : 'visible' });
      host.__DAGGERHEART_E2E_RELAY_RECEIVE__ = (message: any) => {
        const envelope = message.envelope;
        const isSnapshot = message.type === 'envelope' && envelope?.sender?.role === 'gm' && envelope.payload?.kind === 'snapshot';
        if (background.hidden && isSnapshot) {
          background.dropped++;
          background.lastSnapshot = structuredClone(message);
          const state = envelope.payload.value;
          background.summary = { hope: state.characters?.entities?.[actorId]?.hope.value,
            wounds: state.characters?.entities?.[actorId]?.hp.marked,
            restStatus: state.feed?.find((entry: any) => entry.id === restEntryId)?.rest.status };
          return;
        }
        receive(message);
        if (isSnapshot) background.delivered++;
      };
      document.dispatchEvent(new Event('visibilitychange'));
    }, { actorId, restEntryId });

    await gm.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
    const gmSheet = gm.getByLabel('Персонаж игрока');
    await gmSheet.getByRole('button', { name: 'Надежда 4 из 6', exact: true }).click();
    await showChat(gm);
    const restCard = gm.locator('.feed-rest-card');
    await restCard.locator('.feed-rest-move').filter({ hasText: heal }).getByRole('button', { name: 'Применить', exact: true }).click();
    await restCard.locator('.feed-rest-move').filter({ hasText: prepare }).getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(gmSheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(5);
    await restCard.getByRole('button', { name: 'Получить страх и завершить', exact: true }).click();
    await expect(restCard.getByRole('button', { name: 'Получить страх и завершить', exact: true })).toHaveCount(0);
    // A subsequent wound/hope adjustment must survive reconnection. Replaying
    // the completed recovery would incorrectly heal it or grant Hope again.
    await gmSheet.getByRole('button', { name: 'Раны 1 из 5', exact: true }).click();
    await gmSheet.getByRole('button', { name: 'Надежда 4 из 6', exact: true }).click();
    await expect.poll(() => player.evaluate(() => (window as any).__E2E_BACKGROUND_RECOVERY__.summary), { timeout: 15_000 })
      .toEqual({ hope: 4, wounds: 1, restStatus: 'resolved' });
    expect(await player.evaluate(() => (window as any).__E2E_BACKGROUND_RECOVERY__.dropped)).toBeGreaterThan(0);
    // Prove the player really missed canonical changes before the resume event.
    await expect(playerSheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(2);
    await expect(playerSheet.getByRole('button', { name: 'Раны 2 из 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => snapshotState(gm)).toMatchObject({ hope: 4, wounds: 1, restStatus: 'resolved', results: [
      { label: heal, status: 'resolved', applied: 2 }, { label: prepare, status: 'resolved', applied: 1 }
    ] });
    const expected = await snapshotState(gm);
    expect(expected.fear).toBeGreaterThan(0);

    await player.evaluate(() => {
      (window as any).__E2E_BACKGROUND_RECOVERY__.hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      dispatchEvent(new Event('online'));
      dispatchEvent(new Event('pageshow'));
    });
    await expect(playerSheet.getByRole('group', { name: 'Надежда', exact: true }).locator('[aria-pressed="true"]')).toHaveCount(4, { timeout: 15_000 });
    await expect(playerSheet.getByRole('button', { name: 'Раны 1 из 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await showChat(player);
    const playerRest = player.locator('.player-activity-event--rest');
    await expect(playerRest.getByText('Завершён', { exact: true })).toBeVisible();
    await expect(playerRest.getByText(/Очищены все раны: 2/)).toBeVisible();
    await expect(playerRest.getByText(/Получено Надежды: 1/)).toBeVisible();
    await expect(playerRest.getByRole('button', { name: 'Применить', exact: true })).toHaveCount(0);
    await expect.poll(() => snapshotState(player)).toEqual(expected);

    // New envelope/sync IDs intentionally bypass transport dedupe, exercising
    // snapshot hydration of the completed rest twice rather than a duplicate
    // being trivially discarded. No finish/application is re-executed.
    const deliveredBeforeRepeat = await player.evaluate(() => (window as any).__E2E_BACKGROUND_RECOVERY__.delivered);
    await player.evaluate(() => {
      const host = window as any;
      for (let index = 0; index < 2; index++) {
        const message = structuredClone(host.__E2E_BACKGROUND_RECOVERY__.lastSnapshot);
        message.envelope.id = `background-repeat-envelope-${index}`;
        message.envelope.payload.id = `background-repeat-snapshot-${index}`;
        host.__DAGGERHEART_E2E_RELAY_RECEIVE__(message);
        document.dispatchEvent(new Event('visibilitychange'));
        dispatchEvent(new Event('online'));
      }
    });
    // Observe an actual fresh GM reply beyond the two manually repeated
    // snapshots before asserting the final persisted resources remain stable.
    await expect.poll(() => player.evaluate(() => (window as any).__E2E_BACKGROUND_RECOVERY__.delivered), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(deliveredBeforeRepeat + 3);
    await expect.poll(() => snapshotState(player)).toEqual(expected);
    await expect.poll(() => snapshotState(gm)).toEqual(expected);
    await expect(restCard.getByRole('button', { name: 'Получить страх и завершить', exact: true })).toHaveCount(0);
  } finally { await relay.close(); }
});
