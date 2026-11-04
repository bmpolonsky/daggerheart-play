import { expect, test, type Page, type Locator } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { readStoredGameState } from './persistence-helpers';

const before = process.env.TAG_TEAM_BEFORE === '1';
const firstId = 'e2e-character-cadsuane', secondId = 'e2e-character-ran';
async function chat(page: Page) {
  await expect(page.locator('[data-vtt-root]')).toBeVisible();
  const layers = page.getByLabel('Слой интерфейса');
  await expect.poll(async () => await layers.isVisible() || await page.getByLabel('Чат игры').isVisible() || await page.getByRole('button', { name: /^Открыть чат/ }).isVisible()).toBe(true);
  if (await layers.isVisible()) await layers.getByRole('button', { name: /^Чат/ }).click();
  else if (!await page.getByLabel('Чат игры').isVisible()) await page.getByRole('button', { name: /^Открыть чат/ }).click();
}
async function start(page: Page, width: number) {
  await page.setViewportSize({ width: 1440, height: 900 }); await openGmGame(page);
  const document = createPopulatedGameDocument();
  document.files['data/game.json'].autoApplyRollConsequences = true; document.files['data/game.json'].fear = 0;
  for (const id of [firstId, secondId]) {
    const actor = document.files['data/characters.json'].entities[id];
    actor.hope = { value: 3, max: 6 }; actor.stress = { marked: 2, max: 6 }; actor.experiences = []; actor.sheetCards = []; actor.domainCards = [];
    actor.traits = { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 };
  }
  await importGameDocument(page, document, 'tag-team-shared.dhgame');
  await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Действия', exact: true }).click();
  await page.getByRole('button', { name: 'Командный бросок', exact: true }).click();
  const card = page.locator('.feed-teamwork-card'); await expect(card).toBeVisible();
  const picker = card.getByLabel('Выбор участников');
  await picker.getByRole('button', { name: filledCharacterName, exact: true }).click();
  await picker.getByRole('button', { name: 'Ран', exact: true }).click();
  await page.setViewportSize({ width, height: 757 }); await chat(page);
  return card;
}
async function candidate(page: Page, card: Locator, name: string, values: [number, number]) {
  const row = card.locator('.feed-rest-participant').filter({ has: page.getByText(name, { exact: true }) });
  await row.getByRole('button', { name: 'Бросок действия', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  const replace = tray.getByRole('button', { name: 'Заменить подготовленный бросок', exact: true });
  if (await replace.isVisible()) await replace.click();
  // Controlled RNG only in this isolated synthetic browser; all preparation,
  // rolling and persistence still use the real UI and production services.
  await page.evaluate(dice => { const original = Math.random; let index = 0; Math.random = () => index < dice.length ? (dice[index++] - 0.5) / 12 : original(); }, values);
  await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
  await expect(row.locator('.feed-teamwork-card__result')).toContainText('13');
  await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
}
async function state(page: Page) {
  const s = await readStoredGameState(page);
  return { hopes: [firstId, secondId].map(id => s.characters.entities[id].hope.value), fear: s.game.fear,
    teamwork: s.feed.find(entry => entry.type === 'teamwork') };
}
for (const width of [1180, 525]) for (const chosen of ['hope', 'fear'] as const) {
  test(`real GM Tag Team chooses ${chosen} once at ${width}`, async ({ page }, info) => {
    const card = await start(page, width);
    if (!before) await expect(card).toContainText('Вручную: инициатор, 3 Надежды');
    await candidate(page, card, filledCharacterName, [10, 3]);
    if (!before) {
      await expect(card.getByRole('button', { name: 'Завершить командный бросок', exact: true })).toHaveCount(0);
      await expect(card.getByRole('button', { name: /^Выбрать результат/ })).toHaveCount(0);
      await expect(card).toContainText('Ожидается бросок второго участника');
    }
    await candidate(page, card, 'Ран', [3, 10]);
    await expect.poll(async () => (await state(page)).hopes).toEqual(before ? [4, 3] : [3, 3]);
    await expect.poll(async () => (await state(page)).fear).toBe(before ? 1 : 0);
    await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`candidates-${chosen}-${width}.png`) });
    if (before) { await card.getByRole('button', { name: 'Завершить командный бросок', exact: true }).click(); return; }
    await expect(card.getByRole('button', { name: /^Выбрать результат/ })).toHaveCount(2);
    await card.getByRole('button', { name: `Выбрать результат ${chosen === 'hope' ? filledCharacterName : 'Ран'} для команды`, exact: true }).click();
    await expect(card.getByLabel('Общий результат команды')).toContainText(chosen === 'hope' ? '+1 Надежды каждому' : '+2 Страха мастеру');
    await expect.poll(async () => (await state(page)).hopes).toEqual(chosen === 'hope' ? [4, 4] : [3, 3]);
    await expect.poll(async () => (await state(page)).fear).toBe(chosen === 'hope' ? 0 : 2);
    await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`chosen-${chosen}-${width}.png`) });
    const selected = await state(page); await info.attach('shared-result', { body: JSON.stringify(selected), contentType: 'application/json' });
    await page.reload(); await chat(page); await expect(card.getByLabel('Общий результат команды')).toBeVisible();
    expect(await state(page)).toEqual(selected); await expect(card.getByRole('button', { name: /^Выбрать результат/ })).toHaveCount(0);
  });
}

test('GM can cancel an unchosen Tag Team without applying candidate consequences', async ({ page }) => {
  const card = await start(page, 525); await candidate(page, card, filledCharacterName, [10, 3]);
  await card.getByRole('button', { name: 'Отменить командный бросок', exact: true }).click();
  await expect.poll(async () => { const s = await state(page); return s.teamwork?.type === 'teamwork' ? s.teamwork.teamwork.status : ''; }).toBe('cancelled');
  await expect(card.getByRole('button', { name: 'Бросок действия', exact: true })).toHaveCount(0);
  expect((await state(page)).hopes).toEqual([3, 3]);
});

async function setAutomaticConsequences(page: Page, enabled: boolean) {
  const library = await openGameLibrary(page);
  await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки', exact: true }).click();
  await library.getByLabel('Разделы настроек').getByRole('button', { name: 'Игра', exact: true }).click();
  await library.getByRole('checkbox', { name: /Применять последствия бросков автоматически/ }).setChecked(enabled);
  await library.getByRole('button', { name: 'Закрыть библиотеку', exact: true }).click();
  await expect.poll(async () => (await readStoredGameState(page)).game.autoApplyRollConsequences).toBe(enabled);
}

test('auto-off choice records a manual outcome and does not auto-apply when the setting is enabled later', async ({ page }) => {
  const card = await start(page, 525);
  await candidate(page, card, filledCharacterName, [10, 3]); await candidate(page, card, 'Ран', [3, 10]);
  await setAutomaticConsequences(page, false);
  await card.getByRole('button', { name: `Выбрать результат ${filledCharacterName} для команды`, exact: true }).click();
  await expect(card.getByLabel('Общий результат команды')).toContainText('Последствия — вручную');
  await expect.poll(async () => (await state(page)).hopes).toEqual([3, 3]);
  await setAutomaticConsequences(page, true);
  expect((await state(page)).hopes).toEqual([3, 3]);
  await page.reload(); await chat(page); await expect(card.getByLabel('Общий результат команды')).toContainText('Последствия — вручную');
  expect((await state(page)).hopes).toEqual([3, 3]); expect((await state(page)).fear).toBe(0);
});

test('legacy resolved Tag Team stays historical after import and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 757 }); await openGmGame(page);
  const document = createPopulatedGameDocument(); document.files['data/game.json'].fear = 1;
  document.files['data/characters.json'].entities[firstId].hope.value = 4;
  document.files['data/characters.json'].entities[secondId].hope.value = 3;
  document.files['data/feed.json'] = [{ id: 'legacy-team', type: 'teamwork', createdAt: '2026-10-28T10:00:00Z', visibility: 'public', authorName: 'QA', title: 'Командный бросок', body: '',
    teamwork: { id: 'legacy-request', kind: 'tagTeam', status: 'resolved', requestedAt: '2026-10-28T10:00:00Z', difficulty: 12, availableActors: [],
      participants: [firstId, secondId].map((actorId, index) => ({ actorId, actorName: document.files['data/characters.json'].entities[actorId].name, role: 'partner',
        result: { rollId: `legacy-${index}`, rollType: 'action', total: 13, difficulty: 12, success: true, note: 'Исторический личный результат' } })) } }];
  await importGameDocument(page, document, 'legacy-tag-team.dhgame'); await chat(page);
  const card = page.locator('.feed-teamwork-card'); await expect(card).toContainText('Исторический личный результат');
  await expect(card.getByRole('button', { name: /^Выбрать результат/ })).toHaveCount(0);
  await page.reload(); await chat(page); expect((await state(page)).hopes).toEqual([4, 3]); expect((await state(page)).fear).toBe(1);
  const saved = (await state(page)).teamwork;
  expect(saved?.type === 'teamwork' && saved.teamwork.sharedResult).toBeUndefined();
});
