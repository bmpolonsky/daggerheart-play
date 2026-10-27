import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { FeedEntry } from '../../src/domain/rules/types';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';
const actorId = 'e2e-character-cadsuane';
const label = process.env.QUALITY_LABEL ?? 'current';
const output = `${process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab'}/${label}`;
function fixture(kind: 'rest' | 'deathMove' | 'teamwork') {
  const document = createPopulatedGameDocument();
  const hero = document.files['data/characters.json'].entities[actorId];
  hero.level = 1; hero.hp = { marked: kind === 'deathMove' ? 6 : 1, max: 6 }; hero.scars = []; hero.sheetCards = []; hero.domainCards = [];
  document.files['data/game.json'].autoApplyRollConsequences = false;
  document.files['data/roll-log.json'] = [];
  const stamp = '2026-10-27T09:00:00.000Z';
  const common = { id: 'paired-event', createdAt: stamp, visibility: 'public' as const, publication: 'public' as const, authorName: 'Мастер QA', title: 'Связанное событие QA', body: '' };
  const event: FeedEntry = kind === 'rest' ? { ...common, type: 'rest', rest: { id: 'paired-rest', restType: 'short', status: 'collecting', requestedAt: stamp,
    participants: [{ actorId, actorName: filledCharacterName, ready: true, choices: [{ id: 'paired-heal', label: 'Исцелить HP: 1d4 + ранг', count: 1, status: 'selected' }] }],
    availableMoves: ['Исцелить HP: 1d4 + ранг'], maxChoicesPerParticipant: 2 } }
    : kind === 'deathMove' ? { ...common, type: 'deathMove', deathMove: { id: 'paired-death', status: 'pending', requestedAt: stamp, actor: { actorId, actorName: filledCharacterName, actorType: 'character' } } }
    : { ...common, type: 'teamwork', teamwork: { id: 'paired-teamwork', kind: 'groupAction', status: 'collecting', requestedAt: stamp, difficulty: 12,
      participants: [{ actorId, actorName: filledCharacterName, role: 'leader' }], availableActors: [{ actorId, actorName: filledCharacterName }] } };
  document.files['data/feed.json'] = [event];
  return document;
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('daggerheart-play-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const library: any = await new Promise((resolve, reject) => { const r = db.transaction('documents').objectStore('documents').get('current-game'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
    const world = library?.worlds?.[library.activeWorldId]; const data = world?.games?.[world.activeGameId]?.state;
    return { rolls: data?.rollLog?.length ?? 0, hp: data?.characters?.entities?.['e2e-character-cadsuane']?.hp?.marked, event: data?.feed?.find((entry: any) => entry.id === 'paired-event') };
  });
}
for (const kind of ['rest', 'deathMove', 'teamwork'] as const) test(`quality events A/B: ${kind} user roll preparation and application`, async ({ page, baseURL }) => {
  await mkdir(output, { recursive: true }); await installQualityClickCounter(page); await installDeterministicP2PTransport(page);
  await page.goto(`${baseURL}#/game`); await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await importGameDocument(page, await sharedQualityDocument(fixture(kind)), `paired-${kind}.dhgame`);
  if (!await page.getByLabel('Чат игры').isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
  const card = page.locator(kind === 'rest' ? '.feed-rest-card' : kind === 'deathMove' ? '.feed-death-move-card' : '.feed-teamwork-card');
  await expect(card).toBeVisible(); const observations: any[] = [];
  async function capture(step: string) { await page.screenshot({ path: `${output}/event-${kind}-${step}.png` }); observations.push({ step, state: await state(page), role: await qualityViewRole(page), pointerClicks: await qualityClickCount(page), trayCount: await page.getByRole('region', { name: 'Подготовка броска', exact: true }).count(), dialogs: await page.getByRole('dialog').allTextContents() }); }
  await capture('01-before');
  await card.getByRole('button', { name: kind === 'rest' ? 'Бросить' : kind === 'deathMove' ? 'Избежать смерти' : 'Бросок действия', exact: true }).click();
  await capture('02-requested');
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  if (label !== 'release') { await expect(tray).toBeVisible(); expect((await state(page)).rolls).toBe(0); await tray.getByRole('button', { name: 'Бросить', exact: true }).click(); }
  await expect.poll(async () => (await state(page)).rolls).toBe(1);
  await capture('03-applied');
  await writeFile(`${output}/event-${kind}.json`, JSON.stringify({ label, kind, observations }, null, 2));
});
