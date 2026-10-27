import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { FeedEntry } from '../../src/domain/rules/types';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

for (const width of [1440, 390]) {
  test(`rest copy separates applied recovery from dice and selection at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const document = createPopulatedGameDocument();
    const stamp = '2026-10-27T09:00:00.000Z';
    const event: FeedEntry = {
      id: 'rest-copy', type: 'rest', createdAt: stamp, visibility: 'public', publication: 'public',
      authorName: 'Мастер', title: 'Продолжительный отдых', body: '',
      rest: { id: 'rest-copy', restType: 'long', status: 'resolved', requestedAt: stamp,
        maxChoicesPerParticipant: 2, availableMoves: ['Залечить все Раны', 'Снять весь Стресс'],
        participants: [{ actorId: 'e2e-character-cadsuane', actorName: filledCharacterName, ready: true, choices: [
          { id: 'hp', label: 'Залечить все Раны', count: 1, status: 'resolved', result: { appliedAmount: 1, note: 'Очищены все раны: 1.' } },
          { id: 'stress', label: 'Снять весь Стресс', count: 1, status: 'resolved', result: { appliedAmount: 1, note: 'Очищен весь стресс: 1.' } }
        ] }], fearPlan: { restType: 'long', pcCount: 1, die: 2, modifier: 1, total: 3, formula: '1d4 + 1' }
      }
    };
    document.files['data/feed.json'] = [event];
    await openGmGame(page);
    await importGameDocument(page, document, 'rest-copy.dhgame');
    if (!await page.getByLabel('Чат игры').isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
    const card = page.locator('.player-activity-event--rest');
    await expect(card).toBeVisible();
    if (!process.env.REST_COPY_BEFORE) {
      await expect(card).toContainText('Исцелено ран: 1.');
      await expect(card).toContainText('Снято Стресса: 1.');
      await expect(card).not.toContainText('С результатом:');
      await expect(card).not.toContainText('Подтверждено');
      await expect(card).not.toContainText('×1');
      await expect(card).not.toContainText('Бросок:');
    }
    if (process.env.REST_COPY_SCREENSHOTS) {
      await mkdir(process.env.REST_COPY_SCREENSHOTS, { recursive: true });
      await card.screenshot({ path: `${process.env.REST_COPY_SCREENSHOTS}/rest-${width}.png` });
    }
  });
}
