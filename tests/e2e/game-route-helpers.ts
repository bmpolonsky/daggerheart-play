import type { Page } from '@playwright/test';

export async function openGmGame(page: Page): Promise<void> {
  await page.goto('/game');
}

export async function openPlayerGame(page: Page, roomId = 'TEST-ROOM'): Promise<void> {
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
}
