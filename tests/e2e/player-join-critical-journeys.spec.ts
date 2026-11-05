import { expect, test } from '@playwright/test';
import { createIsolatedDeterministicP2PRelay, installDeterministicP2PTransport, openSharedGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

for (const width of [1440, 390]) {
  test(`received empty player roster is not loading and a new seat appears at ${width}px`, async ({ browser }, info) => {
    test.setTimeout(60_000);
    const relay = await createIsolatedDeterministicP2PRelay(browser, ['empty-roster-gm', 'empty-roster-player'], { viewport: { width, height: 844 } });
    const [gm, player] = relay.clients.map(client => client.page);
    try {
      await openSharedGmGame(gm, 'EMPTY-ROSTER');
      await player.goto('/#/join/EMPTY-ROSTER');
      const lobby = player.getByLabel('Лобби игрока');
      await expect(lobby.getByText('Данные игры получены.', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(lobby.getByText('Места игроков пока не созданы', { exact: true })).toBeVisible();
      await expect(lobby.getByText('Получаем список игроков', { exact: true })).toHaveCount(0);
      await expect(lobby.getByRole('button', { name: 'Войти в игру', exact: true })).toHaveCount(0);
      // The decorative scene is intentionally scaled beyond the clipped lobby. Check the actual roster content.
      expect(await lobby.getByLabel('Игроки комнаты').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await player.screenshot({ path: info.outputPath('empty-roster.png') });
      const library = await openGameLibrary(gm);
      await library.getByRole('button', { name: 'Настройки', exact: true }).click();
      await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Игроки', exact: true }).click();
      await library.getByRole('button', { name: 'Добавить игрока', exact: true }).click();
      await expect(lobby.getByRole('button', { name: /Игрок 1.*Персонаж не назначен/ })).toBeVisible();
      await expect(lobby.getByText('Места игроков пока не созданы', { exact: true })).toHaveCount(0);
      await lobby.getByRole('button', { name: 'Войти в игру', exact: true }).click();
      await expect(player.locator('[data-vtt-root]')).toBeVisible();
    } finally { await relay.close(); }
  });
}


test('before a snapshot the player lobby remains waiting rather than claiming an empty roster', async ({ page }) => {
  await installDeterministicP2PTransport(page);
  await page.goto('/#/join/WAITING-SNAPSHOT');
  const lobby = page.getByLabel('Лобби игрока');
  await expect(lobby.getByText('Получаем список игроков', { exact: true })).toBeVisible();
  await expect(lobby.getByText('Места игроков пока не созданы', { exact: true })).toHaveCount(0);
  await expect(lobby.getByText('Данные игры получены.', { exact: true })).toHaveCount(0);
  await expect(lobby.getByText('Подключение установлено, но данные игры ещё не получены. Попросите мастера проверить сетевую игру.', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(lobby.getByText('Получаем список игроков', { exact: true })).toBeVisible();
  await expect(lobby.getByRole('button', { name: 'Войти в игру', exact: true })).toHaveCount(0);
});
