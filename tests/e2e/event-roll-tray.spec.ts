import { openUnifiedFormulaEditor } from './unified-formula-helpers';
import { expect, test, type Page } from '@playwright/test';
import type { FeedEntry, PersistedState } from '../../src/domain/rules/types';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';

const actorId = 'e2e-character-cadsuane';
const entryId = 'qa-bound-event';
const choiceId = 'qa-rest-heal';
const stamp = '2026-10-25T12:00:00.000Z';
const heal = 'Исцелить HP: 1d4 + ранг';

function fixture(kind: 'rest' | 'deathMove' | 'teamwork') {
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities[actorId];
  character.level = 1;
  character.hp = { marked: kind === 'deathMove' ? 6 : 1, max: 6 };
  character.scars = [];
  character.sheetCards = [];
  character.domainCards = [];
  document.files['data/game.json'].autoApplyRollConsequences = false;
  document.files['data/roll-log.json'] = [];
  const common = { id: entryId, createdAt: stamp, visibility: 'public' as const, publication: 'public' as const, authorName: 'Мастер QA', title: 'Связанное событие QA', body: '' };
  const event: FeedEntry = kind === 'rest' ? {
    ...common, type: 'rest', rest: { id: 'qa-rest', restType: 'short', status: 'collecting', requestedAt: stamp,
      participants: [{ actorId, actorName: filledCharacterName, ready: true, choices: [{ id: choiceId, label: heal, count: 1, status: 'selected' }] }],
      availableMoves: [heal], maxChoicesPerParticipant: 2 }
  } : kind === 'deathMove' ? {
    ...common, type: 'deathMove', deathMove: { id: 'qa-death', status: 'pending', requestedAt: stamp,
      actor: { actorId, actorName: filledCharacterName, actorType: 'character' } }
  } : {
    ...common, type: 'teamwork', teamwork: { id: 'qa-teamwork', kind: 'groupAction', status: 'collecting', requestedAt: stamp,
      difficulty: 12, participants: [{ actorId, actorName: filledCharacterName, role: 'leader' }],
      availableActors: [{ actorId, actorName: filledCharacterName }] }
  };
  document.files['data/feed.json'] = [event];
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
function eventState(state: PersistedState | null) { return state?.feed.find((entry) => entry.id === entryId); }
function manualDiceCount(state: PersistedState | null) { return state?.rollLog.filter((roll) => roll.type === 'manual' && 'formula' in roll).length ?? 0; }

async function openEvent(page: Page, kind: 'rest' | 'deathMove' | 'teamwork') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  await importGameDocument(page, fixture(kind), `event-${kind}.dhgame`);
  const activity = page.getByLabel('Чат игры');
  if (!await activity.isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
  const card = page.locator(kind === 'rest' ? '.feed-rest-card' : kind === 'deathMove' ? '.feed-death-move-card' : '.feed-teamwork-card');
  await expect(card).toBeVisible();
  return card;
}

test('rest roll is prepared without RNG, then one tray submit applies the same roll once', async ({ page }) => {
  const card = await openEvent(page, 'rest');
  await card.getByRole('button', { name: 'Бросить', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray).toHaveCount(1);
  await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('1d4+1');
  await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toBeDisabled();
  await expect.poll(async () => manualDiceCount(await storedState(page))).toBe(0);
  await expect.poll(async () => (await storedState(page))?.characters.entities[actorId].hp.marked).toBe(1);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => {
    const state = await storedState(page);
    const event = eventState(state);
    const choice = event?.type === 'rest' ? event.rest.participants[0].choices[0] : null;
    const roll = state?.rollLog.find((roll) => roll.type === 'manual' && 'formula' in roll);
    return { count: manualDiceCount(state), status: choice?.status, applied: choice?.result?.appliedAmount,
      sameId: Boolean(choice?.result?.rollId && choice.result.rollId === roll?.id), hp: state?.characters.entities[actorId].hp.marked };
  }).toEqual({ count: 1, status: 'resolved', applied: 1, sameId: true, hp: 0 });
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await expect.poll(async () => manualDiceCount(await storedState(page))).toBe(1);
});

test('closing rest after preparation disables submit and does not roll or heal the pending move', async ({ page }) => {
  const card = await openEvent(page, 'rest');
  await card.getByRole('button', { name: 'Бросить', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray).toBeVisible();
  await card.getByRole('button', { name: 'Получить страх и завершить', exact: true }).click();
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await expect.poll(async () => {
    const state = await storedState(page);
    const event = eventState(state);
    return { status: event?.type === 'rest' ? event.rest.status : null, dice: manualDiceCount(state), hp: state?.characters.entities[actorId].hp.marked };
  }).toEqual({ status: 'resolved', dice: 0, hp: 1 });
});

test('death fixed-pool incompatibility blocks event application until the original pool is restored', async ({ page }) => {
  const card = await openEvent(page, 'deathMove');
  await card.getByRole('button', { name: 'Избежать смерти', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await openUnifiedFormulaEditor(tray);
  const formula = tray.getByLabel('Формула броска', { exact: true });
  await expect(formula).toHaveValue('1d12');
  await formula.fill('1d20');
  await formula.blur();
  await expect(tray.getByText(/требует 1d12 без модификаторов/)).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
  await expect.poll(async () => manualDiceCount(await storedState(page))).toBe(0);
  await formula.fill('1d12');
  await formula.blur();
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeEnabled();
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => {
    const state = await storedState(page);
    const event = eventState(state);
    const roll = state?.rollLog.find((roll) => roll.type === 'manual' && 'formula' in roll);
    return { dice: manualDiceCount(state), status: event?.type === 'deathMove' ? event.deathMove.status : null,
      sameId: event?.type === 'deathMove' && Boolean(event.deathMove.rollId && event.deathMove.rollId === roll?.id) };
  }).toEqual({ dice: 1, status: 'resolved', sameId: true });
});

test('teamwork participant prepares a typed tray and records its one actual roll id', async ({ page }) => {
  const card = await openEvent(page, 'teamwork');
  await card.getByRole('button', { name: 'Бросок действия', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray).toBeVisible();
  await expect.poll(async () => (await storedState(page))?.rollLog.length).toBe(0);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect.poll(async () => {
    const state = await storedState(page);
    const event = eventState(state);
    const rolls = state?.rollLog.filter((roll) => roll.type === 'action');
    const result = event?.type === 'teamwork' ? event.teamwork.participants[0].result : null;
    return { count: rolls?.length, sameId: Boolean(result?.rollId && result.rollId === rolls?.[0]?.id), type: result?.rollType };
  }).toEqual({ count: 1, sameId: true, type: 'action' });
  await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
});
