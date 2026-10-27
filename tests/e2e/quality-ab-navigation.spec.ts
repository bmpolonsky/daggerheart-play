import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
test.beforeEach(async ({ page }) => { await installQualityClickCounter(page); });
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { createIsolatedDeterministicP2PRelay, installDeterministicP2PTransport } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

// Paired observational probes, deliberately not a release gate. A completed probe
// records observed differences; it does not label old or current UX acceptable.
const label = (process.env.QUALITY_LABEL ?? 'current').replace(/[^a-zA-Z0-9_-]/g, '_');
const directory = join((process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab'), label);
const actorId = 'e2e-character-cadsuane';

type Report = { probe: string; label: string; transport: string; observations: Array<Record<string, unknown>>; differences: Record<string, unknown> };

function baseUrl(info: TestInfo) {
  const url = new URL(String(info.project.use.baseURL ?? 'http://127.0.0.1:4184/'));
  url.hash = ''; url.search = '';
  return url.href;
}
async function openLocalGame(page: Page, info: TestInfo) {
  await installDeterministicP2PTransport(page);
  await page.goto(`${baseUrl(info)}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
}
// The shared room helpers use root-relative /#/game, which intentionally does
// not work for a deployment under /daggerheart-play/. Keep identical session
// fixture semantics, but resolve this probe's route against its actual baseURL.
async function openQualityRoom(page: Page, info: TestInfo, roomId: string, role: 'gm' | 'player') {
  await page.addInitScript(({ roomId, role }) => {
    if (sessionStorage.getItem('e2e-active-session-seeded')) return;
    sessionStorage.setItem('e2e-active-session-seeded', role);
    localStorage.setItem('daggerheart-play', JSON.stringify({ version: 1, p2p: {
      connectionMode: 'p2p', ...(role === 'gm' ? { inviteDraft: { roomId } } : {}),
      activeSession: { version: 1, role, roomId, participantName: role === 'gm' ? 'Мастер' : 'Игрок', updatedAt: new Date().toISOString() }
    } }));
  }, { roomId, role });
  await page.goto(`${baseUrl(info)}#/game`);
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
  if (role !== 'gm') return;
  const networkButton = page.getByRole('button', { name: /Сетевая игра:/ });
  if (!await networkButton.isVisible()) await page.getByLabel('Слой интерфейса').getByRole('button', { name: /Чат/ }).click();
  await networkButton.click();
  const dialog = page.getByRole('dialog', { name: 'Сетевая игра' });
  const open = dialog.getByRole('button', { name: 'Запустить сетевую игру' });
  if (await open.isVisible()) await open.click();
  await expect(dialog.getByRole('textbox', { name: 'Ссылка приглашения' })).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
}
async function showChat(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: /^Чат/ }).click();
  else if (!await page.getByLabel('Чат игры').isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
  await expect(page.locator('.player-activity-list')).toBeVisible();
}
async function metrics(page: Page) {
  return page.locator('.player-activity-list').evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight,
    viewport: element.clientHeight, bottomGap: element.scrollHeight - element.clientHeight - element.scrollTop }));
}
async function observe(page: Page, report: Report, stage: string, extra: Record<string, unknown> = {}) {
  await mkdir(directory, { recursive: true });
  const screenshot = join(directory, `${report.probe}-${stage}.png`);
  await page.screenshot({ path: screenshot });
  const state = await page.evaluate(() => ({ url: location.href, hash: location.hash, historyLength: history.length,
    previewCount: document.querySelectorAll('[aria-label="Предпросмотр"]').length,
    navigationIndex: (window as Window & { navigation?: { currentEntry?: { index?: number } } }).navigation?.currentEntry?.index ?? null,
    libraryOpen: Array.from(document.querySelectorAll('[role="dialog"]')).some(element => element.getAttribute('aria-label') === 'Библиотека игры'),
    documentScroll: scrollY, viewport: { width: innerWidth, height: innerHeight } }));
  report.observations.push({ stage, screenshot, pointerClicks: await qualityClickCount(page), role: await qualityViewRole(page), ...state, ...extra });
  await writeFile(join(directory, `${report.probe}.json`), JSON.stringify(report, null, 2));
}
async function openCard(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Лист', exact: true }).click();
  await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
  await page.getByLabel('Персонаж игрока').getByRole('button', { name: 'Заклинание 1', exact: true }).click();
  await expect(page.getByLabel('Предпросмотр', { exact: true })).toBeVisible();
}
function historyFixture(prefix: string) {
  const document = createPopulatedGameDocument();
  document.files['data/game.json'].id = `quality-history-${prefix}`;
  document.files['data/game.json'].name = `История ${prefix}`;
  document.files['data/feed.json'] = Array.from({ length: 22 }, (_, index) => ({
    id: `${prefix}-history-${index}`, type: 'message' as const,
    createdAt: new Date(Date.UTC(2026, 9, 27, 10, index)).toISOString(), visibility: 'public' as const, publication: 'public' as const,
    authorName: 'Мастер QA', title: 'Мастер QA', body: `Мир ${prefix}, событие ${index}: ${'синтетическая история '.repeat(16)}`
  })).reverse();
  return document;
}

test('quality A/B: chat initial position, deliberate reading and world switch', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const report: Report = { probe: 'navigation-chat-world-switch', label, transport: 'local game; deterministic fixture installed, no network room', observations: [], differences: {} };
  await openLocalGame(page, info);
  await importGameDocument(page, await sharedQualityDocument(historyFixture('A'), 'history-A'), 'quality-history-A.dhgame');
  await showChat(page);
  await expect(page.locator('.player-activity-event--message')).toHaveCount(22);
  await observe(page, report, '01-initial-A', { chat: await metrics(page) });
  // A real wheel gesture, rather than setting scrollTop, expresses deliberate reading.
  await page.locator('.player-activity-list').hover();
  await page.mouse.wheel(0, -10000);
  await expect.poll(async () => (await metrics(page)).top).toBeLessThan(10);
  await page.getByLabel('Сообщение игрока').fill('QA новое сообщение при чтении мира A');
  await page.getByLabel('Сообщение игрока').press('Enter');
  await expect(page.locator('.player-activity-event--message')).toHaveCount(23);
  await observe(page, report, '02-reading-A-with-new-message', { chat: await metrics(page),
    unreadButton: await page.getByRole('button', { name: /^Новые события:/ }).allTextContents() });
  // Importing a second game is an ordinary UI world switch, preserving the app shell.
  await importGameDocument(page, await sharedQualityDocument(historyFixture('B'), 'history-B'), 'quality-history-B.dhgame');
  await showChat(page);
  await expect(page.locator('.player-activity-event--message')).toHaveCount(22);
  await expect(page.locator('.player-activity-list')).toContainText('Мир B');
  const afterSwitch = await metrics(page);
  report.differences = { newGameStartsAtLatest: afterSwitch.bottomGap <= 64,
    staleUnreadButton: await page.getByRole('button', { name: /^Новые события:/ }).allTextContents() };
  await observe(page, report, '03-switched-B', { chat: afterSwitch });
  if (process.env.QUALITY_EXPECT_FIXED) {
    expect(report.differences.newGameStartsAtLatest).toBe(true);
    expect(report.differences.staleUnreadButton).toEqual([]);
  }
});

for (const width of [1188, 390]) {
  test(`quality A/B: real Library history, preview Back and Forward while open at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const report: Report = { probe: `navigation-preview-${width}`, label, transport: 'local synthetic game; no network room', observations: [], differences: {} };
    await openLocalGame(page, info);
    await importGameDocument(page, await sharedQualityDocument(createPopulatedGameDocument()), 'quality-preview.dhgame');
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
    await openCard(page);
    await observe(page, report, '01-preview-before-back');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Предпросмотр"]') || location.hash !== '#/game');
    await observe(page, report, '02-first-back');
    report.differences.firstBackKeepsGameAndClosesPreview = new URL(page.url()).hash === '#/game'
      && await page.getByLabel('Предпросмотр', { exact: true }).count() === 0;
    // Find the prior actual game entry, leaving a real Library entry in Forward.
    const visibleLibrary = page.getByRole('dialog', { name: 'Библиотека игры' });
    if (await visibleLibrary.isVisible()) await visibleLibrary.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
    if (await page.getByLabel('Предпросмотр', { exact: true }).count()) {
      await page.getByRole('button', { name: 'Закрыть предпросмотр', exact: true }).click();
    }
    for (let index = 0; index < 8; index++) {
      await page.goBack();
      if (new URL(page.url()).hash === '#/game' && await page.locator('[data-vtt-root]').count()) break;
      if (!new URL(page.url()).hash.startsWith('#/library')) break;
    }
    if (new URL(page.url()).hash !== '#/game' || !await page.locator('[data-vtt-root]').count()) {
      report.differences.forwardProbe = 'unsupported: no previous game entry reached through this version UI history';
      await observe(page, report, '03-forward-probe-unavailable');
      if (process.env.QUALITY_EXPECT_FIXED) throw new Error('Forward history scenario could not be exercised');
      return;
    }
    await openCard(page);
    await observe(page, report, '03-preview-with-forward-history');
    await page.goForward();
    await page.waitForFunction(() => !document.querySelector('[aria-label="Предпросмотр"]') || location.hash !== '#/game');
    report.differences.forwardAllowedNavigation = new URL(page.url()).hash.startsWith('#/library');
    await observe(page, report, '04-forward-while-preview-open');
    if (process.env.QUALITY_EXPECT_FIXED) {
      expect(report.differences.firstBackKeepsGameAndClosesPreview).toBe(true);
      expect(report.differences.forwardAllowedNavigation).toBe(true);
    }
  });
}

test('quality A/B: long mobile lobby scroll ownership and enter-game offset', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const report: Report = { probe: 'navigation-mobile-lobby', label, transport: 'local lobby; deterministic fixture installed, no network room', observations: [], differences: {} };
  await installDeterministicP2PTransport(page);
  await page.goto(baseUrl(info));
  await page.getByRole('button', { name: 'Мастер', exact: true }).click();
  for (let index = 0; index < 10; index++) await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const layout = await page.evaluate(() => {
    const lobby = document.querySelector<HTMLElement>('.role-entry')!;
    return { documentHeight: document.documentElement.scrollHeight, viewport: innerHeight, lobbyHeight: lobby.clientHeight,
      lobbyScrollHeight: lobby.scrollHeight, lobbyOverflow: getComputedStyle(lobby).overflowY,
      documentOverflow: getComputedStyle(document.documentElement).overflowY,
      entryScrollOptIn: document.documentElement.classList.contains('dh-mobile-entry-scroll') };
  });
  await observe(page, report, '01-long-lobby', { layout });
  await page.mouse.move(220, 480);
  await page.mouse.wheel(0, 500);
  await observe(page, report, '02-wheel-lobby', { lobbyScroll: await page.locator('.role-entry').evaluate(element => element.scrollTop) });
  await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  report.differences = { gameBounds: await page.locator('[data-vtt-root]').boundingBox(), documentScroll: await page.evaluate(() => scrollY) };
  await observe(page, report, '03-entered-game');
});

// This is an application transport fixture, NOT native RTC or a real backgrounded phone.
// The probe observes current and old player UIs after an ordinary resource ACK path.
test('quality A/B: modeled player resource synchronization and post-ACK mobile density', async ({ browser }, info) => {
  test.setTimeout(90_000);
  const report: Report = { probe: 'navigation-player-sync', label, transport: 'MOCKED application relay; two isolated browser contexts; NOT native RTC', observations: [], differences: {} };
  const relay = await createIsolatedDeterministicP2PRelay(browser, ['quality-nav-gm', 'quality-nav-player']);
  const [gm, player] = relay.clients.map(client => client.page);
  const room = `QANAV${Date.now().toString().slice(-7)}`;
  try {
    await player.setViewportSize({ width: 390, height: 844 });
    await openQualityRoom(gm, info, room, 'gm');
    await importGameDocument(gm, await sharedQualityDocument(createPopulatedGameDocument()), 'quality-player-sync.dhgame');
    await openQualityRoom(player, info, room, 'player');
    const picker = player.getByRole('region', { name: 'Выбор игрока' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: `Игрок 1 ${filledCharacterName}` }).click();
    await player.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист', exact: true }).click();
    const playerSheet = player.getByLabel('Персонаж игрока');
    await expect(playerSheet).toContainText(filledCharacterName);
    await playerSheet.getByRole('button', { name: 'Раны 2 из 5', exact: true }).click();
    await gm.getByRole('button', { name: filledCharacterName, exact: true }).first().click();
    await expect(gm.getByLabel('Персонаж игрока').getByRole('button', { name: 'Раны 2 из 5', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    const sync = player.getByLabel('Синхронизация персонажа');
    report.differences.resourceReachedGm = true;
    report.differences.syncStatusSupported = await sync.count() > 0;
    if (await sync.count()) {
      await expect(sync).toContainText('Подтверждено мастером', { timeout: 15_000 });
      report.differences.syncText = await sync.innerText();
    } else report.differences.syncText = 'unsupported: this build has no character sync status UI';
    await observe(player, report, '01-player-sheet-after-update');
    await player.getByLabel('Слой интерфейса').getByRole('button', { name: 'Сцена', exact: true }).click();
    await observe(player, report, '02-player-scene-after-update');
    await showChat(player);
    await observe(player, report, '03-player-chat-after-update');
  } finally { await relay.close(); }
});
