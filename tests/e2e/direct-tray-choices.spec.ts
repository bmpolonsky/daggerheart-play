import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createExperience } from '../../src/domain/rules/factories';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { createIsolatedDeterministicP2PRelay, openGmGame, openSharedGmGame, openSharedPlayerGame } from './game-route-helpers';
import { expectInsideViewport } from './layout-helpers';
import { openUnifiedFormulaEditor } from './unified-formula-helpers';

const actorId = 'e2e-character-cadsuane';
const output = '/home/codex/outputs/dh-tray-ux-20261027/browser';
function fixture() {
  const document = createPopulatedGameDocument();
  const actor = document.files['data/characters.json'].entities[actorId];
  actor.spellcastTrait = 'instinct'; actor.traits.instinct = 2; actor.traits.strength = 3;
  actor.hope.value = 3;
  actor.experiences = [{ ...createExperience('Опыт QA', 2), id: 'qa-xp' }];
  const other = document.files['data/characters.json'].entities[document.files['data/characters.json'].order[1]];
  other.name = 'QA — Очень длинное имя второго персонажа для проверки выбора';
  document.files['data/game.json'].autoApplyRollConsequences = false;
  return document;
}
async function openTray(page: Page) {
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: 'Сцена', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть панель костей', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
  await expect(tray).toBeVisible();
  return tray;
}
async function snapshot(page: Page, tray: Locator, name: string) {
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/${name}.png` });
  await writeFile(`${output}/${name}.json`, JSON.stringify({ viewport: page.viewportSize(),
    bounds: await tray.boundingBox(), text: await tray.innerText(), accessibility: await tray.ariaSnapshot(),
    activeControl: await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') })),
    nativeSelectPopup: 'Screenshot captures actual browser output; OS popup pixels may be outside browser capture.'
  }, null, 2));
}
async function savedState(page: Page): Promise<any> {
  return page.evaluate(async () => {
    const stored: any = await new Promise((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-game');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('documents', 'readonly');
        const read = transaction.objectStore('documents').get('current-game');
        read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error);
        transaction.oncomplete = () => db.close();
      };
    });
    const world = stored?.worlds?.[stored.activeWorldId] ?? stored;
    const state = world?.games?.[world.activeGameId]?.state;
    return state ? { ...state, __qaStorage: { worldId: stored.activeWorldId, gameId: world.activeGameId } } : undefined;
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`direct actor/trait choices preserve N-dice MAX, costs and reset at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page); await importGameDocument(page, fixture(), 'direct-tray.dhgame');
    await page.setViewportSize(viewport);
    const tray = await openTray(page);
    const actor = tray.getByRole('combobox', { name: 'Исполнитель броска', exact: true });
    await expect(actor).toBeVisible();
    await actor.selectOption('gm');
    await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('1d20');
    await expect(tray.getByRole('button', { name: 'Выбрать исполнителя броска', exact: true })).toHaveCount(0);
    await actor.click(); await snapshot(page, tray, `${viewport.width}-actor-open`); await page.keyboard.press('Escape');
    const longOption = actor.getByRole('option', { name: /^QA — Очень длинное/ });
    await actor.selectOption(await longOption.getAttribute('value') ?? '');
    await expectInsideViewport(page, actor);
    await snapshot(page, tray, `${viewport.width}-long-actor`);
    await actor.selectOption(`character:${actorId}`);
    await expect(tray.getByRole('button', { name: 'Убрать кость Надежды', exact: true })).toBeVisible();
    const trait = tray.getByRole('combobox', { name: 'Характеристика броска', exact: true });
    await trait.click(); await snapshot(page, tray, `${viewport.width}-trait-open`); await page.keyboard.press('Escape');
    await trait.selectOption('strength');
    await expect(tray.getByLabel('Итоговая формула', { exact: true })).toHaveText('2d12+3');
    const traitBox = (await trait.boundingBox())!;
    expect(traitBox.width).toBeLessThanOrEqual(165);
    for (const count of [1, 2, 3]) {
      await tray.getByRole('button', { name: /^Преим\./ }).click();
      await expect(tray.getByRole('button', { name: 'Убрать преимущество', exact: true })).toContainText(count > 1 ? `${count}×d6` : 'd6');
      await expect(tray).not.toContainText('Костей:');
    }
    await snapshot(page, tray, `${viewport.width}-three-advantage`);
    await tray.getByRole('button', { name: 'Помеха', exact: true }).click();
    await expect(tray.getByRole('button', { name: 'Преим. 2', exact: true })).toBeVisible();
    await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
    await tray.getByRole('button', { name: 'Опыт', exact: true }).click();
    await tray.getByRole('checkbox', { name: 'Опыт QA +2', exact: true }).check();
    await tray.getByRole('button', { name: 'Сделать бросок приватным', exact: true }).click();
    await expect(tray.getByRole('button', { name: 'Сделать бросок публичным', exact: true })).toHaveText('Приватный бросок');
    const formula = await openUnifiedFormulaEditor(tray);
    await formula.fill('2d12+1d6+2d6+9'); await formula.blur();
    await expect(tray.getByLabel('Модификатор', { exact: true })).toHaveValue('4');
    await tray.getByLabel('Модификатор', { exact: true }).fill('2');
    await expect(formula).toHaveValue('2d12+1d6+7+2d6');
    const submit = tray.getByRole('button', { name: 'Бросить', exact: true });
    await expectInsideViewport(page, submit);
    await submit.click({ trial: true });
    await snapshot(page, tray, `${viewport.width}-ready`);
    await submit.click();
    await expect.poll(async () => (await savedState(page))?.rollLog.length).toBe(1);
    const state = await savedState(page); const roll = state.rollLog[0];
    expect(roll.type).toBe('action'); expect(roll.actorId).toBe(actorId);
    expect(roll.advantageRolls).toHaveLength(2); expect(roll.disadvantageRolls).toHaveLength(0);
    expect(roll.extraDiceTerms[0].rolls).toHaveLength(1);
    expect(roll.total).toBe(roll.hopeDie + roll.fearDie + Math.max(...roll.advantageRolls) + roll.extraDiceTerms[0].rolls[0] + 7);
    expect(state.characters.entities[actorId].hope.value).toBe(2); expect(state.game.fear).toBe(0);
    expect(roll.publication).toBe('private');
    await writeFile(`${output}/${viewport.width}-result.json`, JSON.stringify({ roll, hope: 2, fear: state.game.fear,
      prepared: { actorId, trait: 'strength', advantageCount: 2, disadvantageCount: 0, extraDice: [{ count: 1, sides: 6 }], experienceIds: ['qa-xp'], manualModifier: 2, publication: 'private' } }, null, 2));
    await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
    await openTray(page);
    await expect(tray.getByRole('combobox', { name: 'Исполнитель броска' })).toHaveValue(`character:${actorId}`);
    await expect(tray.getByLabel('Итоговая формула')).toContainText('2d6');
    await tray.getByRole('button', { name: 'Сбросить набор', exact: true }).click();
    await tray.getByRole('button', { name: 'Добавить d6', exact: true }).click();
    await expect(tray.getByLabel('Итоговая формула')).toHaveText('1d6');
    await submit.click();
    await expect.poll(async () => (await savedState(page))?.rollLog.length).toBe(2);
    const repeated = await savedState(page);
    expect(repeated.characters.entities[actorId].hope.value).toBe(2);
    await snapshot(page, tray, `${viewport.width}-reset-repeat`);
    const retained = { storage: repeated.__qaStorage, rollIds: repeated.rollLog.map((entry: any) => entry.id),
      actorIds: repeated.characters.order, selectedCharacterId: repeated.ui.selectedCharacterId, hope: 2, fear: repeated.game.fear };
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-vtt-root]')).toBeVisible();
    await expect.poll(async () => {
      const restored = await savedState(page);
      return restored ? { storage: restored.__qaStorage, rollIds: restored.rollLog.map((entry: any) => entry.id),
        actorIds: restored.characters.order, selectedCharacterId: restored.ui.selectedCharacterId,
        hope: restored.characters.entities[actorId].hope.value, fear: restored.game.fear } : null;
    }).toEqual(retained);
    await writeFile(`${output}/${viewport.width}-reload-retained.json`, JSON.stringify(retained, null, 2));
  });
}

test('one available actor is a readable name instead of a redundant select', async ({ page }) => {
  await openGmGame(page); const tray = await openTray(page);
  await expect(tray.getByRole('combobox', { name: 'Исполнитель броска' })).toHaveCount(0);
  await expect(tray.getByLabel('Исполнитель броска', { exact: true })).toHaveText('Мастер');
  await snapshot(page, tray, 'one-gm-actor');
});

test('isolated player has one readable actor and sends full N-dice count through the existing request', async ({ browser }) => {
  test.setTimeout(60_000);
  const relay = await createIsolatedDeterministicP2PRelay(browser, ['direct-gm', 'direct-player']);
  const [gm, player] = relay.clients.map((client) => client.page);
  try {
    const room = `DIRECT${Date.now()}`;
    await openSharedGmGame(gm, room); await importGameDocument(gm, fixture(), 'direct-player.dhgame');
    await openSharedPlayerGame(player, room);
    await player.getByRole('region', { name: 'Выбор игрока' }).getByRole('button', { name: `Игрок 1 ${filledCharacterName}` }).click();
    const tray = await openTray(player);
    await expect(tray.getByRole('combobox', { name: 'Исполнитель броска' })).toHaveCount(0);
    await expect(tray.getByLabel('Исполнитель броска', { exact: true })).toHaveText(filledCharacterName);
    for (let index = 0; index < 3; index++) await tray.getByRole('button', { name: /^Преим\./ }).click();
    await snapshot(player, tray, 'one-player-actor-three-dice');
    await tray.getByRole('button', { name: 'Бросить', exact: true }).click();
    await expect.poll(async () => (await savedState(gm))?.rollLog[0]?.advantageRolls?.length).toBe(3);
    const state = await savedState(gm);
    await writeFile(`${output}/player-wire-result.json`, JSON.stringify({ roll: state.rollLog[0], messages: relay.messages.filter((message: any) => JSON.stringify(message).includes('advantageCount')).map((message: any) => message) }, null, 2));
  } finally { await relay.close(); }
});
