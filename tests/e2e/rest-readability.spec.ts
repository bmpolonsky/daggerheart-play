import { expect, test, type Locator } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { FeedEntry } from '../../src/domain/rules/types';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
const phase = process.env.CONTROL_POLISH_PHASE ?? 'after';
const output = process.env.CONTROL_POLISH_OUTPUT ?? '/tmp/control-polish';
async function paint(label: Locator) {
  return label.evaluate(el => {
    const rgba = (s: string): number[] => { const n = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [n[0], n[1], n[2], n[3] ?? 1]; };
    let bg = [7, 9, 12]; const chain: Element[] = []; for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
    let opacity = 1;
    for (const e of chain) { const style = getComputedStyle(e); opacity *= Number(style.opacity); const c = rgba(style.backgroundColor); bg = bg.map((x, i) => c[i] * c[3] + x * (1 - c[3])); }
    const c = rgba(getComputedStyle(el).color); const fg = bg.map((x, i) => c[i] * c[3] + x * (1 - c[3]));
    const lum = (c: number[]) => c.map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
    const a = lum(fg), b = lum(bg); return { color: getComputedStyle(el).color, opacity, background: bg, contrastAtFullOpacity: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
}
for (const width of [1440, 390]) test(`completed rest and disabled selection remain readable ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const document = createPopulatedGameDocument(); const stamp = '2026-10-27T09:00:00.000Z';
  const event: FeedEntry = { id: 'readable-rest', type: 'rest', createdAt: stamp, visibility: 'public', publication: 'public', authorName: 'Мастер', title: 'Продолжительный отдых', body: '',
    rest: { id: 'readable-rest', restType: 'long', status: 'resolved', requestedAt: stamp, maxChoicesPerParticipant: 2,
      availableMoves: ['Залечить все Раны', 'Снять весь Стресс'], participants: [{ actorId: 'e2e-character-cadsuane', actorName: filledCharacterName, ready: true, choices: [
        { id: 'hp', label: 'Залечить все Раны', count: 1, status: 'resolved', result: { appliedAmount: 1, note: 'Очищены все раны: 1.' } },
        { id: 'stress', label: 'Снять весь Стресс', count: 1, status: 'resolved', result: { appliedAmount: 1, note: 'Очищен весь стресс: 1.' } }
      ] }], fearPlan: { restType: 'long', pcCount: 1, die: 2, modifier: 1, total: 3, formula: '1d4 + 1' } } };
  document.files['data/feed.json'] = [event]; await openGmGame(page); await importGameDocument(page, document, 'readable-rest.dhgame');
  if (!await page.getByLabel('Чат игры', { exact: true }).isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
  const card = page.locator('.player-activity-event--rest'); await expect(card).toBeVisible();
  await expect(card).toContainText('Исцелено ран: 1.'); await expect(card).toContainText('Снято Стресса: 1.');
  await mkdir(`${output}/${phase}`, { recursive: true }); await card.screenshot({ path: `${output}/${phase}/rest-completed-${width}.png` });
  const label = card.getByText('Залечить все Раны', { exact: true }); const completed = await paint(label);
  if (phase === 'after') { await expect(card.getByRole('button', { name: 'Залечить все Раны', exact: true })).toHaveCount(0); expect(completed.opacity).toBe(1); expect(completed.contrastAtFullOpacity).toBeGreaterThanOrEqual(4.5); }
  // A full active selection is disabled too, but must retain legible selected labels.
  const pending = structuredClone(event); pending.id = 'pending-rest'; pending.title = 'Выбранные ходы'; pending.rest!.id = 'pending-rest'; pending.rest!.status = 'collecting'; delete pending.rest!.fearPlan;
  pending.rest!.participants[0].choices.forEach(choice => { choice.status = 'selected'; delete choice.result; });
  document.files['data/feed.json'] = [pending]; await importGameDocument(page, document, 'pending-rest.dhgame');
  const selected = page.locator('.player-activity-event--rest'); const disabled = selected.getByRole('button', { name: 'Залечить все Раны', exact: true });
  await expect(disabled).toBeDisabled(); const selection = await paint(disabled); await selected.screenshot({ path: `${output}/${phase}/rest-selection-${width}.png` });
  if (phase === 'after') { expect(selection.opacity).toBe(1); expect(selection.contrastAtFullOpacity).toBeGreaterThanOrEqual(4.5); await expect(selected.getByRole('button', { name: 'Применить', exact: true })).toHaveCount(2); }
  await writeFile(`${output}/${phase}/rest-${width}.json`, JSON.stringify({ phase, width, completed, selection, caveat: 'Contrast uses computed color/alpha backgrounds. Before opacity0.48 is recorded separately; actual before text contrast is lower. Actual PNGs are visually inspected.' }, null, 2));
});
