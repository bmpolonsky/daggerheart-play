import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

test('explicit Master entry overrides stale player identity, survives reload, and invitations still join as player', async ({ page }) => {
  await installDeterministicP2PTransport(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('workspace-role-seeded')) return;
    sessionStorage.setItem('workspace-role-seeded', 'yes');
    localStorage.setItem('daggerheart-play', JSON.stringify({
      version: 1,
      p2p: {
        connectionMode: 'p2p',
        activeSession: { version: 1, role: 'player', roomId: 'STALE-PLAYER', participantName: 'Old player', participantId: 'old-seat', updatedAt: new Date().toISOString() }
      }
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Мастер', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  const root = page.locator('[data-vtt-root]');
  await expect(root).toHaveClass(/player-view--gm/);
  expect(await page.evaluate(() => sessionStorage.getItem('e2e-p2p-connected-room'))).toBeNull();
  const savedIdentity = () => page.evaluate(() => JSON.parse(localStorage.getItem('daggerheart-play') || '{}').p2p.activeSession);
  expect((await savedIdentity()).roomId).toBe('STALE-PLAYER');
  await page.reload();
  await expect(root).toHaveClass(/player-view--gm/);
  expect(await page.evaluate(() => sessionStorage.getItem('e2e-p2p-connected-room'))).toBeNull();
  // Opening an explicit invitation must override the tab's GM intent even before a snapshot arrives.
  await page.goto('/#/join/EXPLICIT-PLAYER');
  await expect(page.getByLabel('Лобби игрока')).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('e2e-p2p-connected-room'))).toBe('EXPLICIT-PLAYER');
  await page.goto('/#/game');
  await expect(root).toHaveClass(/player-view--player/);
  await page.reload();
  await expect(root).toHaveClass(/player-view--player/);
  // Hash navigation retains the live service, so Master must leave an active player transport.
  await page.evaluate(() => { window.location.hash = ''; });
  await page.getByRole('button', { name: 'Мастер', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть игру', exact: true }).click();
  await expect(root).toHaveClass(/player-view--gm/);
});
