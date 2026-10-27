import { expect, test, type Page } from '@playwright/test';
import { createCharacter } from '../../src/domain/rules/factories';
import type { PersistedState } from '../../src/domain/rules/types';
import { createTokenState } from '../../src/domain/tabletop/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

const participantId = 'e2e-character-cadsuane';

function sceneRestFixture() {
  const document = createPopulatedGameDocument();
  const characters = document.files['data/characters.json'];
  const participant = characters.entities[participantId];
  participant.level = 2;
  participant.hp.marked = 1;
  // Every character has a used long-rest counter so an accidental world reset
  // is observable even when the hidden characters have no scene tokens.
  for (let index = characters.order.length; index < 8; index += 1) {
    const character = createCharacter({ id: `rest-bench-${index}`, name: `Не участвует ${index}` });
    characters.entities[character.id] = character;
    characters.order.push(character.id);
  }
  for (const character of Object.values(characters.entities)) {
    character.sheetCards.push({ id: 'rest-test-feature', kind: 'custom', name: 'Тест отдыха', text: 'Ручной счётчик для проверки сброса.' });
    character.usageTrackers = [{ id: 'rest-test-counter', targetKind: 'feature', targetId: 'rest-test-feature', label: 'До отдыха', current: 1, max: 1, reset: 'long' }];
  }
  const table = document.files['data/scene-table.json'];
  const scene = table.scenes[table.activeSceneId];
  scene.tokens = [
    createTokenState({ kind: 'character', id: participantId }, { id: 'rest-pc-token-1', x: 300, y: 250 }),
    createTokenState({ kind: 'character', id: participantId }, { id: 'rest-pc-token-2', x: 500, y: 250 }),
    ...scene.tokens.filter((token) => token.actor.kind === 'adversary')
  ];
  document.files['data/game.json'].fear = 0;
  return document;
}

async function storedState(page: Page): Promise<PersistedState | null> {
  return page.evaluate(async () => {
    const project = await new Promise<any>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('documents', 'readonly');
        const read = transaction.objectStore('documents').get('current-game');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result);
        transaction.oncomplete = () => db.close();
      };
    });
    const world = project?.worlds?.[project?.activeWorldId] ?? project;
    return world?.games?.[world?.activeGameId]?.state ?? null;
  });
}

async function startRest(page: Page, title: 'Короткий отдых' | 'Продолжительный отдых') {
  await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
  const card = page.getByLabel('Чат игры').locator('.player-activity-event--rest').last();
  await expect(card).toBeVisible();
  await expect(card.locator('.feed-rest-participant')).toHaveCount(1);
  await expect(card.locator('.feed-rest-participant__header')).toContainText(filledCharacterName);
  // Starting a rest is immediate and never opens a participant-selection flow.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return card;
}

test('scene rest freezes one PC from eight world characters, deduplicates tokens, and resets only that PC', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  await importGameDocument(page, sceneRestFixture(), 'scene-rest-world-eight.dhgame');
  const card = await startRest(page, 'Продолжительный отдых');
  await expect.poll(async () => {
    const state = await storedState(page);
    return state?.feed.filter((entry) => entry.type === 'rest').at(-1)?.rest.participants.map((participant) => participant.actorId);
  }).toEqual([participantId]);

  // Remove both physical tokens after the rest started. The rest participant
  // must remain the original snapshot even when the scene no longer has a PC.
  const tokens = page.getByLabel('Игровая сцена').locator('.player-token--character');
  await expect(tokens).toHaveCount(2);
  await tokens.first().click();
  await page.keyboard.press('Delete');
  await expect(tokens).toHaveCount(1);
  await tokens.first().click();
  await page.keyboard.press('Delete');
  await expect(tokens).toHaveCount(0);
  await expect(card.locator('.feed-rest-participant')).toHaveCount(1);
  await card.getByRole('button', { name: 'Получить страх и завершить', exact: true }).click();

  await expect.poll(async () => {
    const state = await storedState(page);
    const rest = state?.feed.filter((entry) => entry.type === 'rest').at(-1)?.rest;
    return {
      status: rest?.status,
      ids: rest?.participants.map((participant) => participant.actorId),
      modifier: rest?.fearPlan?.modifier,
      pcCount: rest?.fearPlan?.pcCount,
      selectedCounter: state?.characters.entities[participantId]?.usageTrackers?.[0].current,
      otherCounters: state?.characters.order.filter((id) => id !== participantId).map((id) => state.characters.entities[id].usageTrackers?.[0].current)
    };
  }).toEqual({ status: 'resolved', ids: [participantId], modifier: 1, pcCount: 1, selectedCounter: 0, otherCounters: [1, 1, 1, 1, 1, 1, 1] });
  const beforeReload = (await storedState(page))!;
  const rest = beforeReload.feed.filter((entry) => entry.type === 'rest').at(-1)!;
  expect(rest.rest.fearPlan!.total).toBeGreaterThanOrEqual(2);
  expect(rest.rest.fearPlan!.total).toBeLessThanOrEqual(5);
  expect(beforeReload.game.fear).toBe(rest.rest.fearPlan!.total);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  expect((await storedState(page))?.game.fear).toBe(beforeReload.game.fear);
  await expect(page.getByRole('button', { name: 'Получить страх и завершить', exact: true })).toHaveCount(0);
});

test('rest recovery reports one healed wound when the recovery roll is six', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  await importGameDocument(page, sceneRestFixture(), 'scene-rest-actual-heal.dhgame');
  const card = await startRest(page, 'Короткий отдых');
  const move = card.locator('.feed-rest-move').filter({ hasText: 'Залечить Раны' });
  await move.getByRole('button', { name: 'Залечить Раны', exact: true }).click();
  await move.getByRole('button', { name: 'Бросить', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('1d4+2');
  // Scope deterministic RNG to the next recovery die only; IDs and all later
  // browser randomness retain their normal implementation.
  await page.evaluate(() => {
    const original = Math.random;
    Math.random = () => { Math.random = original; return 0.999; };
  });
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(move).toContainText('Бросок: 1d4+2 = 6. Исцелено ран: 1.');
  await expect.poll(async () => {
    const state = await storedState(page);
    const result = state?.feed.filter((entry) => entry.type === 'rest').at(-1)?.rest.participants[0].choices[0].result;
    return { total: result?.total, appliedAmount: result?.appliedAmount, marked: state?.characters.entities[participantId].hp.marked };
  }).toEqual({ total: 6, appliedAmount: 1, marked: 0 });
});

test('GM can finish with remaining moves and the closed card does not claim an unapplied heal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  await importGameDocument(page, sceneRestFixture(), 'scene-rest-unapplied-heal.dhgame');
  const card = await startRest(page, 'Короткий отдых');
  await card.getByRole('button', { name: 'Залечить Раны', exact: true }).click();
  await expect(card).toContainText('не выбрано ходов: 1; ожидают применения: 1');
  await expect(card).toContainText(`${filledCharacterName} —`);
  const finish = card.getByRole('button', { name: 'Получить страх и завершить', exact: true });
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(card).toContainText('Не применено: отдых завершён.');
  await expect(card).toContainText('не выбрано ходов: 1');
  await expect(card).not.toContainText('Исцелено ран:');
  await expect.poll(async () => {
    const state = await storedState(page);
    const rest = state?.feed.filter((entry) => entry.type === 'rest').at(-1)?.rest;
    return {
      status: rest?.status,
      choiceStatus: rest?.participants[0].choices[0].status,
      result: rest?.participants[0].choices[0].result ?? null,
      marked: state?.characters.entities[participantId].hp.marked
    };
  }).toEqual({ status: 'resolved', choiceStatus: 'selected', result: null, marked: 1 });
});
