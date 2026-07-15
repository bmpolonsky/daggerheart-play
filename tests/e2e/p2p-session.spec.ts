import { expect, test, type Browser, type Page } from '@playwright/test';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { installDeterministicP2PTransport, openGmGame, openPlayerGame } from './game-route-helpers';
import { expectInsideBounds, expectInsideViewport, expectNoOverlap, expectTopLayerAtPoint, rect } from './layout-helpers';

async function openSharedSettings(page: Page, role: 'gm' | 'player', section: 'Подключение' | 'Диагностика' | 'Игры проекта'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (role === 'gm') {
    await openGmGame(page);
  } else {
    await openPlayerGame(page);
  }
  await openCurrentSettings(page, section);
}

async function openCurrentSettings(page: Page, section: 'Подключение' | 'Диагностика' | 'Игры проекта' = 'Подключение'): Promise<void> {
  const modal = page.getByRole('dialog', { name: 'Рабочее пространство' });
  if (!(await modal.isVisible())) {
    await page.getByRole('button', { name: 'Инструменты' }).click();
  }
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Настройки' }).click();
  const sectionButton = modal.getByLabel('Разделы настроек').getByRole('button', { name: section });
  await sectionButton.click();
  await expect(sectionButton).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.getByLabel('Содержимое рабочего пространства')).toBeVisible();
}

function sessionMeta(page: Page, label: string) {
  return page.locator(`dd[aria-label="${label}"]`);
}

async function createLobbyInvite(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const gmLobby = page.getByLabel('Создать сессию мастера');
  await gmLobby.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(gmLobby.getByLabel('Имя игрока')).toHaveValue('Игрок 1');
  const roomId = await gmLobby.getByRole('textbox', { name: /^Код комнаты/ }).inputValue();
  const invite = gmLobby.getByRole('textbox', { name: /^Ссылка приглашения/ });
  await expect(invite).toHaveValue(new RegExp(`/join/${roomId}$`));
  return invite.inputValue();
}

async function newSharedPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return context.newPage();
}

const diagnosticStrategies = ['supabase', 'nostr', 'mqtt', 'torrent'] as const;

function connectedDiagnosticsFixture(peerIds: string[]): P2PSessionState {
  const activeStrategies = ['supabase', 'mqtt', 'nostr', 'torrent'] as const;
  return {
    connected: true,
    status: 'connected',
    role: 'gm',
    roomId: 'E2ETEST',
    peerId: 'peer-local-gm',
    peers: peerIds,
    lastSnapshotAt: '2026-07-14T10:00:00.000Z',
    lastRequestAt: null,
    message: 'Подключено.',
    routes: diagnosticStrategies.map((strategy) => ({
      strategy,
      status: 'ready',
      activePeers: peerIds,
      lastSeenAt: Date.parse('2026-07-14T10:00:00.000Z'),
      rttMs: 20
    })),
    routePeers: peerIds.map((peerId, peerIndex) => {
      const activeStrategy = activeStrategies[peerIndex % activeStrategies.length];
      return {
        peerId,
        activeStrategy,
        routes: diagnosticStrategies.map((strategy, strategyIndex) => ({
          strategy,
          status: strategy === activeStrategy ? 'active' as const : peerIndex === 1 && strategyIndex === 0 ? 'lost' as const : 'available' as const,
          physicalPeerId: `${peerId}-${strategy}-physical-route`,
          lastSeenAt: Date.parse('2026-07-14T10:00:00.000Z') - strategyIndex * 1000,
          rttMs: 18 + peerIndex * 10 + strategyIndex
        }))
      };
    })
  };
}

async function seedConnectedDiagnostics(page: Page, peerIds: string[]): Promise<void> {
  await page.addInitScript((fixture) => {
    (window as typeof window & { __DAGGERHEART_E2E_P2P_DIAGNOSTICS__?: P2PSessionState }).__DAGGERHEART_E2E_P2P_DIAGNOSTICS__ = fixture;
  }, connectedDiagnosticsFixture(peerIds));
}

test.describe('P2P session workflow', () => {
  test('mobile diagnostics live in Chronicle and portal above every active VTT layer', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openGmGame(page);

    const root = page.locator('.player-view--gm');
    const layerTabs = page.getByLabel('Слой интерфейса');
    const chronicleTab = layerTabs.getByRole('button', { name: /Хроника\. Соединение:/ });
    const chronicle = page.getByLabel('Хроника игры');
    await expect(chronicleTab.locator('.player-connection-status-dot')).toBeVisible();
    await chronicleTab.click();
    await expect(root).toHaveClass(/player-view--mobile-feed/);
    await expect(chronicle).toBeVisible();
    await page.getByLabel('Сообщение игрока').fill('Заполненная хроника для проверки заголовка');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await expect(chronicle.getByRole('button', { name: 'Очистить хронику' })).toBeVisible();

    const chronicleHeader = chronicle.locator('.player-chronicle-header');
    const headerTitle = chronicleHeader.locator('.player-chronicle-header__title');
    const diagnosticTrigger = chronicleHeader.getByRole('button', { name: /Открыть диагностику соединения/ });
    await expect(diagnosticTrigger).toBeVisible();
    await expect(diagnosticTrigger).toHaveCSS('position', 'static');
    await expectInsideBounds(chronicleHeader, diagnosticTrigger);
    await expectNoOverlap(headerTitle, diagnosticTrigger);
    await expect(page.locator('.p2p-health-indicator')).toHaveCount(1);
    await expect(chronicleHeader.locator('.p2p-health-indicator')).toHaveCount(1);

    await diagnosticTrigger.click();
    const dialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    const panel = dialog.locator('.p2p-health-dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.parentElement === document.body)).toBe(true);

    const panelBox = await rect(panel);
    expect(panelBox.height).toBeLessThan(620);
    await expectInsideViewport(page, panel);
    const tabsBox = await rect(layerTabs);
    const chronicleBox = await rect(chronicle);
    await expectTopLayerAtPoint(page, dialog, panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
    await expectTopLayerAtPoint(page, dialog, tabsBox.x + tabsBox.width / 2, tabsBox.y + tabsBox.height / 2);
    await expectTopLayerAtPoint(page, dialog, chronicleBox.x + 8, chronicleBox.y + chronicleBox.height / 2);

    const close = dialog.getByRole('button', { name: 'Закрыть' });
    await expect(close).toBeFocused();
    const focusable = dialog.locator('button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    await focusable.last().focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(diagnosticTrigger).toBeFocused();

    await diagnosticTrigger.click();
    const backdropDialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    await backdropDialog.click({ position: { x: 2, y: 2 } });
    await expect(backdropDialog).toHaveCount(0);
    await expect(diagnosticTrigger).toBeFocused();

    await diagnosticTrigger.click();
    const closeDialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    await closeDialog.getByRole('button', { name: 'Закрыть' }).click();
    await expect(closeDialog).toHaveCount(0);
    await expect(diagnosticTrigger).toBeFocused();
    await layerTabs.getByRole('button', { name: 'Сцена' }).click();
    await expect(root).toHaveClass(/player-view--mobile-scene/);
    await expect(page.getByRole('button', { name: /Открыть диагностику соединения/ })).toHaveCount(0);
    await expect(chronicleTab.locator('.player-connection-status-dot')).toBeVisible();
    await layerTabs.getByRole('button', { name: 'Лист' }).click();
    await expect(root).toHaveClass(/player-view--mobile-sheet/);
    await expect(page.getByRole('button', { name: /Открыть диагностику соединения/ })).toHaveCount(0);
    await expect(chronicleTab.locator('.player-connection-status-dot')).toBeVisible();
  });

  test('diagnostics render one card per connected peer and keep each peer routes scoped', async ({ page }) => {
    await seedConnectedDiagnostics(page, ['peer-alpha', 'peer-beta']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    await page.getByRole('button', { name: /Открыть диагностику соединения/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    const cards = dialog.locator('.player-tools-peer-card');
    await expect(cards).toHaveCount(2);
    await expect(dialog.locator('dd[aria-label="Логических peer"]')).toHaveText('2');

    const alphaCard = cards.nth(0);
    const betaCard = cards.nth(1);
    await expect(alphaCard.getByRole('heading')).toHaveText('Игрок peer-alpha');
    await expect(betaCard.getByRole('heading')).toHaveText('Игрок peer-beta');
    await expect(alphaCard.locator('.player-tools-peer-route')).toHaveCount(4);
    await expect(betaCard.locator('.player-tools-peer-route')).toHaveCount(4);
    await expect(alphaCard.locator('summary[aria-label="Supabase: активен"]')).toHaveCount(1);
    await expect(betaCard.locator('summary[aria-label="MQTT: активен"]')).toHaveCount(1);
    await expect(betaCard.locator('summary[aria-label="Supabase: потерян"]')).toHaveCount(1);

    await alphaCard.locator('summary[aria-label="Supabase: активен"]').click();
    await expect(alphaCard.locator('details[open] .player-tools-peer-route__details')).toContainText('peer-alpha-supabase-physical-route');
    await expect(betaCard).not.toContainText('peer-alpha-supabase-physical-route');
  });

  test('connected diagnostics stay usable at 320x568 with scroll and expanded details', async ({ page }) => {
    await seedConnectedDiagnostics(page, ['peer-alpha', 'peer-beta', 'peer-gamma', 'peer-delta']);
    await page.setViewportSize({ width: 320, height: 568 });
    await openGmGame(page);
    await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Хроника' }).click();
    await page.getByLabel('Хроника игры').getByRole('button', { name: /Открыть диагностику соединения/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    const panel = dialog.locator('.p2p-health-dialog');
    const diagnostics = dialog.locator('.player-tools-diagnostics');
    await expectInsideViewport(page, panel);
    expect(await diagnostics.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    const lastRoute = dialog.locator('.player-tools-peer-card').last().locator('.player-tools-peer-route').last();
    await lastRoute.locator('summary').click();
    await lastRoute.scrollIntoViewIfNeeded();
    await expect(lastRoute.locator('.player-tools-peer-route__details')).toBeVisible();
    await expectInsideViewport(page, lastRoute);
    await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeVisible();
  });

  test('connection health opens a compact peer-centric diagnostic', async ({ page }) => {
    await seedConnectedDiagnostics(page, []);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);

    await page.getByRole('button', { name: /Открыть диагностику соединения/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Диагностика соединения' });
    const panel = dialog.locator('.p2p-health-dialog');

    await expect(dialog).toBeVisible();
    expect((await rect(panel)).width).toBeLessThanOrEqual(760);
    await expect(dialog.locator('table')).toHaveCount(0);
    await expect(dialog.locator('.player-tools-peer-card')).toHaveCount(1);
    const routes = dialog.locator('.player-tools-peer-route');
    await expect(routes).toHaveCount(4);
    const firstRouteBox = await rect(routes.nth(0));
    const secondRouteBox = await rect(routes.nth(1));
    expect(Math.abs(firstRouteBox.x - secondRouteBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(firstRouteBox.width - secondRouteBox.width)).toBeLessThanOrEqual(1);
    expect(secondRouteBox.y).toBeGreaterThanOrEqual(firstRouteBox.y + firstRouteBox.height - 1);
    await expect(dialog.locator('.player-tools-diagnostics')).toHaveCSS('overflow-y', 'auto');
    const firstRoute = routes.first();
    await expect(firstRoute.locator('summary')).toHaveAttribute('aria-label', 'Supabase: готов');
    await firstRoute.locator('summary').click();
    await expect(firstRoute.locator('.player-tools-peer-route__details')).toBeVisible();
    await expect(firstRoute.locator('.player-tools-peer-route__details')).toContainText('Статус:');
    await expect(firstRoute.locator('.player-tools-peer-route__details')).toHaveCSS('overflow-wrap', 'anywhere');
  });

  test('settings keep file import/export without manual JSON fallback', async ({ browser }) => {
    test.setTimeout(90_000);
    const gm = await newSharedPage(browser);

    await openSharedSettings(gm, 'gm', 'Игры проекта');
    const gmModal = gm.getByRole('dialog', { name: 'Рабочее пространство' });
    await expect(gmModal.getByRole('button', { name: 'Экспорт' })).toBeVisible();
    await expect(gmModal.getByRole('button', { name: 'Импорт' })).toBeVisible();
    await expect(gm.getByText('Ручной JSON-архив')).toHaveCount(0);
    await gm.context().close();

    const player = await newSharedPage(browser);
    await openSharedSettings(player, 'player', 'Подключение');
    await expect(player.getByText('Ручной JSON-архив')).toHaveCount(0);
    await player.context().close();
  });

  test('automatic GM and player bootstrap use the configured transport without external relays', async ({ browser }) => {
    const gm = await newSharedPage(browser);
    await openSharedSettings(gm, 'gm', 'Диагностика');
    await expect(sessionMeta(gm, 'Роль')).toHaveText('gm');
    await expect(sessionMeta(gm, 'Статус')).toHaveText('Ожидает игроков');
    await expect(sessionMeta(gm, 'ID подключения')).toHaveText('e2e-browser-peer');
    await expect.poll(() => gm.evaluate(() => window.sessionStorage.getItem('e2e-p2p-connected-room'))).toMatch(/^[A-Z0-9]{6}$/);
    await gm.context().close();

    const player = await newSharedPage(browser);
    await openSharedSettings(player, 'player', 'Диагностика');
    await expect(sessionMeta(player, 'Роль')).toHaveText('player');
    await expect(sessionMeta(player, 'ID подключения')).toHaveText('e2e-browser-peer');
    await expect.poll(() => player.evaluate(() => window.sessionStorage.getItem('e2e-p2p-connected-room'))).toContain('TEST-ROOM');
    await player.context().close();
  });

  test('entering the GM game does not announce routine invite creation', async ({ page }) => {
    await installDeterministicP2PTransport(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Открыть игру' }).click();
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
    await expect(page.getByText('Готовим ссылку...')).toHaveCount(0);
    await expect(page.getByText('Ссылка готова. Игрок подключится автоматически.')).toHaveCount(0);
  });

  test('@live-p2p creates a Trystero room, joins a configured seat, and syncs chat after reload', async ({ browser, browserName }) => {
    test.skip(process.env.RUN_P2P_E2E !== '1', 'Real WebRTC relay smoke is opt-in to keep default e2e deterministic.');
    test.skip(browserName !== 'chromium', 'The external relay smoke runs once in Chromium; WebKit P2P UI is covered with deterministic fixtures.');
    test.setTimeout(150_000);

    const gm = await newSharedPage(browser);
    const player = await newSharedPage(browser);

    const inviteLink = await createLobbyInvite(gm);
    await gm.getByRole('button', { name: 'Открыть игру' }).click();
    const copyInvite = gm.getByRole('button', { name: 'Копировать приглашение' });
    await expect(copyInvite).toBeEnabled();
    await copyInvite.click();
    await expect(gm.getByRole('button', { name: 'Ссылка скопирована' })).toBeVisible();
    await openCurrentSettings(gm, 'Диагностика');
    await player.goto(inviteLink);
    await expect(player.getByText('Список получен от мастера.')).toBeVisible({ timeout: 30_000 });
    const seatButton = player.getByRole('button', { name: /Игрок 1/ });
    await expect(seatButton).toBeVisible();
    await seatButton.click();
    await player.getByRole('button', { name: 'Войти за игрока' }).click();
    await openCurrentSettings(player, 'Диагностика');
    await expect(sessionMeta(player, 'Роль')).toHaveText('player');

    await expect(sessionMeta(gm, 'Логических peer')).toHaveText('1', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Логических peer')).toHaveText('1', { timeout: 15_000 });

    await gm.getByRole('dialog', { name: 'Рабочее пространство' }).getByRole('button', { name: 'Закрыть' }).click();
    await gm.reload();
    await openCurrentSettings(gm, 'Диагностика');
    await expect(sessionMeta(gm, 'Роль')).toHaveText('gm', { timeout: 15_000 });
    await expect(sessionMeta(gm, 'Логических peer')).toHaveText('1', { timeout: 15_000 });

    await player.getByRole('dialog', { name: 'Рабочее пространство' }).getByRole('button', { name: 'Закрыть' }).click();
    await player.reload();
    await openCurrentSettings(player, 'Диагностика');
    await expect(sessionMeta(player, 'Роль')).toHaveText('player', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Логических peer')).toHaveText('1', { timeout: 15_000 });

    await player.getByRole('dialog', { name: 'Рабочее пространство' }).getByRole('button', { name: 'Закрыть' }).click();
    await expect(player.getByLabel('Хроника игры')).toBeVisible();
    const playerChat = 'сообщение игрока из live P2P smoke';
    await player.getByLabel('Сообщение игрока').fill(playerChat);
    await player.getByRole('button', { name: 'Отправить сообщение' }).click();
    await expect(gm.getByText(playerChat)).toBeVisible({ timeout: 15_000 });

    await openCurrentSettings(player, 'Подключение');
    await expect(player.getByText('Заявка мастеру')).toHaveCount(0);
  });
});
