import { expect, type Page } from '@playwright/test';

export async function installDeterministicP2PTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noopSubscription = () => () => undefined;
    (window as typeof window & { __DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__?: () => unknown }).__DAGGERHEART_E2E_P2P_TRANSPORT_FACTORY__ = () => ({
      id: 'e2e-local',
      label: 'E2E local transport',
      peerId: 'e2e-browser-peer',
      connect: async (roomId: string) => window.sessionStorage.setItem('e2e-p2p-connected-room', roomId),
      disconnect: async () => undefined,
      send: async () => undefined,
      subscribe: noopSubscription,
      onPeerJoin: noopSubscription,
      onPeerLeave: noopSubscription,
      onError: noopSubscription,
      onDiagnosticsChange: noopSubscription,
      onRouteSwitch: noopSubscription,
      getRouteDiagnostics: () => [],
      getPeerDiagnostics: () => []
    });
  });
}

export async function openGmGame(page: Page): Promise<void> {
  await installDeterministicP2PTransport(page);
  await page.goto('/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
}

export async function openPlayerGame(page: Page, roomId = 'TEST-ROOM'): Promise<void> {
  await installDeterministicP2PTransport(page);
  await page.addInitScript((activeRoomId) => {
    window.localStorage.setItem('daggerheart-play', JSON.stringify({
      version: 1,
      p2p: {
        activeSession: {
          version: 1,
          role: 'player',
          roomId: activeRoomId,
          participantName: 'Игрок',
          updatedAt: new Date().toISOString()
        }
      }
    }));
  }, roomId);
  await page.goto('/game');
  await expect(page.locator('[data-vtt-root]')).toBeVisible({ timeout: 15_000 });
}
