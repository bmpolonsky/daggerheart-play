import { expect, test, type Browser, type Page } from '@playwright/test';

async function openSharedSettings(page: Page, route: '/gm' | '/player/test-room', section: 'Подключение' | 'Диагностика' | 'Игры проекта'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route);
  await openCurrentSettings(page, section);
}

async function openCurrentSettings(page: Page, section: 'Подключение' | 'Диагностика' | 'Игры проекта' = 'Подключение'): Promise<void> {
  await page.locator('.mini-dice-launcher__tools').click();
  const modal = page.locator('.player-tools-modal');
  await modal.getByRole('button', { name: 'Настройки' }).click();
  await modal.getByRole('button', { name: section }).click();
  if (section === 'Подключение') {
    await expect(page.getByText(/Подключение (игроков|к мастеру)/)).toBeVisible();
  } else {
    await expect(modal.locator('.player-tools-modal__body').getByText(section)).toBeVisible();
  }
}

function sessionMeta(page: Page, label: string) {
  return page.locator('.player-tools-sync__meta div').filter({ hasText: label }).locator('dd');
}

async function createLobbyInvite(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const roomId = await page.getByLabel('Код комнаты').first().inputValue();
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

    await openSharedSettings(gm, '/gm', 'Игры проекта');
    const gmModal = gm.locator('.player-tools-modal');
    await expect(gmModal.getByRole('button', { name: 'Экспорт' })).toBeVisible();
    await expect(gmModal.getByRole('button', { name: 'Импорт' })).toBeVisible();
    await expect(gm.getByText('Ручной JSON-архив')).toHaveCount(0);

    await openSharedSettings(player, '/player/test-room', 'Подключение');
    await expect(player.getByText('Ручной JSON-архив')).toHaveCount(0);
  });

  test('creates a Trystero room, joins as player and syncs GM approval', async ({ browser }) => {
    test.skip(process.env.RUN_P2P_E2E !== '1', 'Real WebRTC relay smoke is opt-in to keep default e2e deterministic.');
    test.setTimeout(60_000);

    const gm = await newSharedPage(browser);
    const player = await newSharedPage(browser);

    const inviteLink = await createLobbyInvite(gm);
    await gm.getByRole('button', { name: 'Открыть игру' }).click();
    await openCurrentSettings(gm, 'Диагностика');
    await player.goto(inviteLink);
    const seatButton = player.getByRole('button', { name: /Игрок 1/ });
    await expect(seatButton).toBeVisible({ timeout: 15_000 });
    await seatButton.click();
    await player.getByRole('button', { name: 'Войти за игрока' }).click();
    await openCurrentSettings(player, 'Диагностика');
    await expect(sessionMeta(player, 'Роль')).toHaveText('player');

    await expect(sessionMeta(gm, 'Peers')).toHaveText('1', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await gm.reload();
    await openCurrentSettings(gm, 'Диагностика');
    await expect(sessionMeta(gm, 'Роль')).toHaveText('gm', { timeout: 15_000 });
    await expect(sessionMeta(gm, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await player.reload();
    await openCurrentSettings(player, 'Диагностика');
    await expect(sessionMeta(player, 'Роль')).toHaveText('player', { timeout: 15_000 });
    await expect(sessionMeta(player, 'Peers')).toHaveText('1', { timeout: 15_000 });

    await player.locator('.player-tools-modal').getByTitle('Закрыть').click();
    const playerChat = `сообщение игрока ${Date.now().toString(36)}`;
    await player.getByLabel('Сообщение игрока').fill(playerChat);
    await player.locator('.player-chat-composer').getByRole('button').click();
    await expect(gm.getByText(playerChat)).toBeVisible({ timeout: 15_000 });

    await openCurrentSettings(player, 'Подключение');
    await expect(player.getByText('Заявка мастеру')).toHaveCount(0);
  });
});
