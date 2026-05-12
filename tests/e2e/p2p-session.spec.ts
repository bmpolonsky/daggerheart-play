import { expect, test, type Browser, type Page } from '@playwright/test';

async function openSharedSettings(page: Page, route: '/gm' | '/player/test-room'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route);
  await openCurrentSettings(page);
}

async function openCurrentSettings(page: Page): Promise<void> {
  await page.locator('.mini-dice-launcher__tools').click();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByText(/Подключение (игроков|к мастеру)/)).toBeVisible();
}

function sessionMeta(page: Page, label: string) {
  return page.locator('.player-tools-sync__meta div').filter({ hasText: label }).locator('dd');
}

async function createLobbyInvite(page: Page, roomId: string): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByLabel('Код комнаты').first().fill(roomId);
  await page.getByRole('button', { name: 'Создать сессию' }).click();
  const invite = page.getByLabel('Ссылка приглашения');
  await expect(invite).toHaveValue(new RegExp(`/join/${roomId}$`));
  return invite.inputValue();
}

async function newSharedPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return context.newPage();
}

test.describe('P2P session workflow', () => {
  test('settings keep file import/export without manual JSON fallback', async ({ browser }) => {
    const gm = await newSharedPage(browser);
    const player = await newSharedPage(browser);

    await openSharedSettings(gm, '/gm');
    await expect(gm.getByRole('button', { name: 'Экспорт игры' })).toBeVisible();
    await expect(gm.getByRole('button', { name: 'Импорт игры' })).toBeVisible();
    await expect(gm.getByText('Ручной JSON-архив')).toHaveCount(0);

    await openSharedSettings(player, '/player/test-room');
    await expect(player.getByText('Ручной JSON-архив')).toHaveCount(0);
  });

  test('creates a Trystero room, joins as player and syncs GM approval', async ({ browser }) => {
    test.skip(process.env.RUN_P2P_E2E !== '1', 'Real WebRTC relay smoke is opt-in to keep default e2e deterministic.');
    test.setTimeout(60_000);

    const roomId = `dh-e2e-${Date.now().toString(36)}`;
    const gm = await newSharedPage(browser);
    const player = await newSharedPage(browser);

    const inviteLink = await createLobbyInvite(gm, roomId);
    await gm.getByRole('button', { name: 'Открыть игру' }).click();
    await openCurrentSettings(gm);
    await player.goto(inviteLink);
    const seatButton = player.getByRole('button', { name: /Игрок 1/ });
    await expect(seatButton).toBeVisible({ timeout: 15_000 });
    await seatButton.click();
    await player.getByRole('button', { name: 'Войти за игрока' }).click();
    await openCurrentSettings(player);
    await expect(sessionMeta(player, 'Роль')).toHaveText('player');

    await expect(sessionMeta(gm, 'Peers')).toHaveText('1', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await gm.reload();
    await openCurrentSettings(gm);
    await expect(sessionMeta(gm, 'Роль')).toHaveText('gm', { timeout: 15_000 });
    await expect(sessionMeta(gm, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await player.reload();
    await openCurrentSettings(player);
    await expect(sessionMeta(player, 'Роль')).toHaveText('player', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await player.locator('.player-tools-modal').getByTitle('Закрыть').click();
    const playerChat = `сообщение игрока ${Date.now().toString(36)}`;
    await player.getByLabel('Сообщение игрока').fill(playerChat);
    await player.locator('.player-chat-composer').getByRole('button').click();
    await expect(gm.getByText(playerChat)).toBeVisible({ timeout: 15_000 });

    await player.locator('.mini-dice-launcher__tools').click();
    await player.getByRole('button', { name: 'Настройки' }).click();
    await expect(player.getByText('Заявка мастеру')).toHaveCount(0);
  });
});
