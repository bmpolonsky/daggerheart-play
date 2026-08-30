import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, filledCharacterResources } from './filled-game-helpers';
import {
  createIsolatedDeterministicP2PRelay,
  openSharedGmGame,
  openSharedPlayerGame,
  type IsolatedDeterministicP2PRelay
} from './game-route-helpers';
import type { Character } from '../../src/domain/rules/types';
import { backfillAutomaticUsageTrackers } from '../../src/domain/rules/usageTrackers';
import { openGameLibrary } from './tools-helpers';

const fixtureName = 'e2e-character-player-workflows.dhgame';

interface JoinedTable {
  relay: IsolatedDeterministicP2PRelay;
  gm: Page;
  player: Page;
}

async function openJoinedFilledTable(
  browser: Browser,
  suffix: string,
  viewport = { width: 1440, height: 900 },
  configureCharacter?: (character: Character) => void
): Promise<JoinedTable> {
  const relay = await createIsolatedDeterministicP2PRelay(
    browser,
    [`e2e-gm-${suffix}`, `e2e-player-${suffix}`],
    { viewport }
  );
  const [gm, player] = relay.clients.map((client) => client.page);
  const roomId = `${suffix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)}${Date.now().toString().slice(-5)}`;

  await openSharedGmGame(gm, roomId);
  await importCharacterWorkflowFixture(gm, configureCharacter);
  await openSharedPlayerGame(player, roomId);

  const seatPicker = player.getByRole('region', { name: 'Выбор игрока' });
  await expect(seatPicker).toBeVisible({ timeout: 15_000 });
  await seatPicker.getByRole('button', { name: `Игрок 1 ${filledCharacterName}` }).click();
  await expect(player.getByLabel('Персонаж игрока')).toContainText(filledCharacterName, { timeout: 15_000 });

  return { relay, gm, player };
}

async function importCharacterWorkflowFixture(gm: Page, configureCharacter?: (character: Character) => void): Promise<void> {
  const document = createPopulatedGameDocument();
  const character = document.files['data/characters.json'].entities['e2e-character-cadsuane'];
  if (!character) throw new Error('Filled-game fixture lost its primary character.');
  // This makes the adventure recall path observable instead of merely asserting
  // that a zero-cost card can move between zones.
  character.domainCards[5] = { ...character.domainCards[5], recallCost: '1 Stress' };
  // A card-owned token pool is already a usage counter and must not prompt for
  // a second generic tracker next to it.
  character.domainCards[2] = {
    ...character.domainCards[2],
    text: `${character.domainCards[2].text} Можно хранить до 3 жетонов.`,
    // Old saves may contain a stale persisted maximum even though the card text
    // now resolves to a larger token pool.
    tokens: { value: 0, max: 1 }
  };
  character.domainCards[0] = {
    ...character.domainCards[0],
    imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="112"%3E%3Crect width="80" height="112" fill="%23c69b52"/%3E%3C/svg%3E'
  };
  configureCharacter?.(character);

  await openGameLibrary(gm);
  const workspace = gm.getByRole('dialog', { name: 'Библиотека игры' });
  await workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Настройки' }).click();
  await workspace.getByLabel('Разделы настроек').getByRole('button', { name: 'Миры' }).click();
  await workspace.locator('input[type="file"][accept*=".dhgame"]').setInputFiles({
    name: fixtureName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document))
  });
  await expect(workspace.getByText(`Игра импортирована: ${fixtureName}`)).toBeVisible({ timeout: 15_000 });
  await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();
}

async function openCardSection(player: Page): Promise<Locator> {
  const sheet = player.getByLabel('Персонаж игрока');
  await player.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты' }).click();
  const zones = sheet.locator('.player-domain-card-zones');
  await expect(zones).toBeVisible();
  return zones;
}

function cardRow(zone: Locator, name: string): Locator {
  return zone.locator('.dh-list-item').filter({ hasText: name });
}

async function chooseRichOption(page: Page, label: string, index = 0): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  const picker = page.getByRole('dialog', { name: `Выбор: ${label}` });
  const options = picker.getByRole('option');
  expect(await options.count()).toBeGreaterThan(index);
  await options.nth(index).click();
  await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
}

async function markedStress(player: Page): Promise<number> {
  return player.getByRole('group', { name: 'Стресс', exact: true }).getByRole('button').evaluateAll((buttons) => (
    buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').length
  ));
}

async function expectRuleTooltip(page: Page, term: Locator, expected: string): Promise<void> {
  await term.hover();
  const tooltipId = await term.getAttribute('aria-describedby');
  expect(tooltipId).toBeTruthy();
  await expect(page.locator(`[id="${tooltipId}"] > span`)).toHaveText(expected);
}

async function openGmCharacterEditor(gm: Page): Promise<Locator> {
  await openGameLibrary(gm);
  const workspace = gm.getByRole('dialog', { name: 'Библиотека игры' });
  await workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи' }).click();
  await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
  const editor = workspace.getByLabel('Редактор персонажа');
  await expect(editor).toBeVisible();
  const headingBox = await editor.locator('.character-editor-heading h2').boundingBox();
  const tabsBox = await editor.getByLabel('Разделы листа персонажа').boundingBox();
  expect(headingBox).not.toBeNull();
  expect(tabsBox).not.toBeNull();
  expect((tabsBox?.y ?? 0) - (headingBox?.y ?? 0)).toBeLessThan(220);
  return editor;
}

test.describe('filled-game player character workflows', () => {
  test.describe.configure({ timeout: 120_000 });

  test('keeps connected off-scene players in the people list and focuses a raised hand from the dock', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'hand');
    try {
      const heroes = gm.getByLabel('Инструменты сцены').getByLabel('Герои');
      await heroes.getByRole('button', { name: new RegExp(`Убрать ${filledCharacterName} со сцены`) }).click();
      await expect(heroes.locator('.player-roster__item').filter({ hasText: filledCharacterName })).toHaveCount(0);
      await expect(player.getByLabel('Персонаж игрока')).toContainText(filledCharacterName);

      const players = gm.getByLabel('Инструменты сцены').getByLabel('Игроки');
      await expect(players).toContainText('Игрок 1');
      await expect(players).toContainText(filledCharacterName);
      await player.getByRole('button', { name: 'Поднять руку' }).click();

      const dockRequest = gm.getByRole('button', { name: 'Открыть участников: поднятых рук 1' });
      await expect(dockRequest).toBeVisible({ timeout: 15_000 });
      await gm.getByRole('button', { name: 'Свернуть игроков' }).click();
      await gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' }).click();
      await dockRequest.click();

      await expect(gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Участники' })).toHaveAttribute('aria-pressed', 'true');
      const focusedPlayer = gm.locator('[data-focused-player="true"]');
      await expect(focusedPlayer).toBeVisible();
      await expect(focusedPlayer).toBeFocused();
      await expect(focusedPlayer).toContainText('Игрок 1');
      const sceneTools = gm.getByLabel('Инструменты сцены');
      await expect(sceneTools).not.toContainText('Игрок не подключен');
      await expect(sceneTools.getByRole('button', { name: /Микрофон/ })).toHaveCount(0);
    } finally {
      await relay.close();
    }
  });

  test('moves all seven cards between Hand and Vault with replacement and recall cost', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'cards');
    try {
      const zones = await openCardSection(player);
      const hand = zones.getByRole('region', { name: 'Рука карт доменов' });
      const vault = zones.getByRole('region', { name: 'Хранилище карт доменов' });

      await expect(hand.locator('.dh-list-item')).toHaveCount(5);
      await expect(vault.locator('.dh-list-item')).toHaveCount(2);
      await expect(hand).toContainText('5/5');

      const previewRow = cardRow(hand, 'Заклинание 1');
      await expect(previewRow.locator('.player-domain-card-thumb')).toBeVisible();
      const previewHitTarget = previewRow;
      // The thumbnail starts after the row's 12px padding and is deliberately
      // pointer-transparent, so this is a real click through the image into
      // the row-wide hit target. Relative coordinates stay correct if WebKit
      // completes a late layout pass between asserting and clicking.
      await previewHitTarget.click({ position: { x: 30, y: 30 } });
      const materialPreview = player.getByRole('complementary', { name: 'Предпросмотр', exact: true });
      await expect(materialPreview.locator('.feed-domain-card').filter({ hasText: 'Заклинание 1' })).toBeVisible();
      await expect(player.getByLabel('Чат игры').locator('.feed-domain-card')).toHaveCount(0);
      const previewBox = await materialPreview.boundingBox();
      expect(previewBox).not.toBeNull();
      expect(Math.abs((previewBox?.y ?? 0) + (previewBox?.height ?? 0) / 2 - 450)).toBeLessThan(2);
      expect(previewBox?.height ?? 900).toBeLessThan(900 * 0.8);
      await previewHitTarget.click({ position: { x: 3, y: 3 } });
      await expect(materialPreview.locator('.feed-domain-card').filter({ hasText: 'Заклинание 1' })).toBeVisible();
      await materialPreview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();
      await expect(materialPreview).toHaveCount(0);

      await cardRow(hand, 'Заклинание 1').click();
      await materialPreview.getByRole('button', { name: 'В Хранилище' }).click();
      await expect(hand.locator('.dh-list-item')).toHaveCount(4);
      await expect(vault.locator('.dh-list-item')).toHaveCount(3);

      await materialPreview.getByRole('button', { name: 'В Руку' }).click();
      await expect(player.getByRole('dialog', { name: 'Вернуть в Руку: Заклинание 1' })).toHaveCount(0);
      await expect(cardRow(hand, 'Заклинание 1')).toBeVisible();
      await materialPreview.getByRole('button', { name: 'В Хранилище' }).click();

      const stressBeforeAdventureRecall = await markedStress(player);
      await cardRow(vault, 'Заклинание 6').click();
      await materialPreview.getByRole('button', { name: 'В Руку' }).click();
      const adventureRecall = player.getByRole('dialog', { name: 'Вернуть в Руку: Заклинание 6' });
      await expect(adventureRecall.getByText('Цена возврата: 1 Стресс.')).toBeVisible();
      await expect(adventureRecall.getByLabel('Во время отдыха — без Стресса')).not.toBeChecked();
      await adventureRecall.getByRole('button', { name: 'Вернуть в Руку' }).click();
      await expect(cardRow(hand, 'Заклинание 6')).toBeVisible();
      await expect.poll(() => markedStress(player)).toBe(stressBeforeAdventureRecall + 1);

      await materialPreview.getByRole('button', { name: 'В Хранилище' }).click();
      await materialPreview.getByRole('button', { name: 'В Руку' }).click();
      const restRecall = player.getByRole('dialog', { name: 'Вернуть в Руку: Заклинание 6' });
      await restRecall.getByLabel('Во время отдыха — без Стресса').check();
      await expect(restRecall.getByText(/Цена возврата/)).toHaveCount(0);
      await restRecall.getByRole('button', { name: 'Вернуть в Руку' }).click();
      await expect.poll(() => markedStress(player)).toBe(stressBeforeAdventureRecall + 1);

      await cardRow(vault, 'Заклинание 1').click();
      await materialPreview.getByRole('button', { name: 'В Руку' }).click();
      const replacementRecall = player.getByRole('dialog', { name: 'Вернуть в Руку: Заклинание 1' });
      await expect(replacementRecall.getByLabel('Во время отдыха — без Стресса')).toHaveCount(0);
      await expect(replacementRecall.getByText(/Цена возврата/)).toHaveCount(0);
      await expect(replacementRecall.getByLabel('Заменить карту в Руке')).toBeVisible();
      await expect(replacementRecall.getByRole('button', { name: 'Вернуть в Руку' })).toBeDisabled();
      await replacementRecall.getByRole('button', { name: 'Заменить карту в Руке', exact: true }).click();
      const recallPicker = player.getByRole('dialog', { name: 'Выбор: Заменить карту в Руке' });
      await recallPicker.getByRole('option', { name: /Заклинание 2/ }).click();
      await recallPicker.getByRole('button', { name: 'Выбрать', exact: true }).click();
      await replacementRecall.getByRole('button', { name: 'Вернуть в Руку' }).click();

      await expect(hand.locator('.dh-list-item')).toHaveCount(5);
      await expect(vault.locator('.dh-list-item')).toHaveCount(2);
      await expect(cardRow(hand, 'Заклинание 1')).toBeVisible();
      await expect(cardRow(vault, 'Заклинание 2')).toBeVisible();
      await expect.poll(() => markedStress(player)).toBe(stressBeforeAdventureRecall + 1);

      const permanentCandidate = cardRow(vault, 'Заклинание 2');
      await expect(permanentCandidate.getByRole('button', { name: 'Навсегда' })).toHaveCount(0);
      await permanentCandidate.click();
      await materialPreview.getByLabel('Другие действия карты Заклинание 2').click();
      await player.getByRole('menu', { name: 'Другие действия карты Заклинание 2' }).getByRole('menuitem', { name: 'Убрать навсегда' }).click();
      const permanentDialog = player.getByRole('dialog', { name: 'Навсегда убрать «Заклинание 2»?' });
      await expect(permanentDialog).toContainText('обычным действием вернуть её больше нельзя');
      await permanentDialog.getByRole('button', { name: 'Убрать навсегда' }).click();
      await expect(permanentCandidate).toContainText('Навсегда — вернуть нельзя');
      await expect(permanentCandidate.getByRole('button', { name: 'В Руку' })).toHaveCount(0);

      const gmEditor = await openGmCharacterEditor(gm);
      await gmEditor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение' }).click();
      await expect(cardRow(gmEditor, 'Заклинание 1')).toContainText('Рука', { timeout: 15_000 });
      await expect(cardRow(gmEditor, 'Заклинание 2')).toContainText('Хранилище');
    } finally {
      await relay.close();
    }
  });

  test('shows, spends, edits and rest-resets automatic card trackers', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'track', undefined, (character) => {
      character.domainCards[3] = {
        ...character.domainCards[3],
        text: 'Один раз до следующего отдыха откройте проход. Один раз до следующего продолжительного отдыха откройте врата.'
      };
      character.usageTrackers = backfillAutomaticUsageTrackers(character);
    });
    try {
      const zones = await openCardSection(player);
      const hand = zones.getByRole('region', { name: 'Рука карт доменов' });
      const tokenCard = cardRow(hand, 'Заклинание 3');
      await tokenCard.click();
      const preview = player.getByRole('complementary', { name: 'Предпросмотр', exact: true });
      const tokenTrack = preview.getByRole('group', { name: 'Надежда карты Заклинание 3' });
      await expect(tokenTrack).toBeVisible();
      await expect(tokenCard.getByTitle('Настроить трекер для «Заклинание 3»')).toHaveCount(0);

      const trackedCard = cardRow(hand, 'Заклинание 4');
      await trackedCard.click();
      await expectRuleTooltip(
        player,
        preview.locator('[aria-describedby]').filter({ hasText: 'Один раз до следующего отдыха' }),
        'Распознано: Использований: 1 до следующего отдыха'
      );
      await expect(preview.getByLabel('До отдыха: 0 из 1')).toBeVisible();
      let tracker = preview.getByLabel('До продолжительного отдыха: 0 из 1');
      await expect(tracker).toBeVisible();
      await expect(tracker).toContainText('0/1');
      await tracker.getByRole('button', { name: 'До продолжительного отдыха 1 из 1' }).click();
      tracker = preview.getByLabel('До продолжительного отдыха: 1 из 1');
      await expect(tracker).toBeVisible();
      await expect(cardRow(hand, 'Заклинание 4').getByText('1/1', { exact: true })).toHaveCount(0);

      await tracker.getByRole('button', { name: 'Настроить трекер Заклинание 4' }).click();
      let dialog = player.getByRole('dialog', { name: 'Трекер: Заклинание 4' });
      await dialog.getByLabel('Название трекера').fill('До долгого отдыха');
      await dialog.getByLabel('Количество использований').fill('2');
      await dialog.getByRole('button', { name: 'Сохранить' }).click();
      tracker = preview.getByLabel('До долгого отдыха: 1 из 2');
      await tracker.getByRole('button', { name: 'До долгого отдыха 2 из 2' }).click();
      tracker = preview.getByLabel('До долгого отдыха: 2 из 2');
      await expect(tracker).toBeVisible();

      await tracker.getByRole('button', { name: 'Настроить трекер Заклинание 4' }).click();
      dialog = player.getByRole('dialog', { name: 'Трекер: Заклинание 4' });
      await dialog.getByRole('button', { name: 'Сбросить' }).click();
      await dialog.getByRole('button', { name: 'Сохранить' }).click();
      tracker = preview.getByLabel('До долгого отдыха: 0 из 2');
      await expect(tracker).toBeVisible();

      await tracker.getByRole('button', { name: 'Настроить трекер Заклинание 4' }).click();
      dialog = player.getByRole('dialog', { name: 'Трекер: Заклинание 4' });
      await dialog.getByLabel('Количество использований').fill('20');
      await dialog.getByRole('button', { name: 'Сохранить' }).click();
      tracker = preview.getByLabel('До долгого отдыха: 0 из 20');
      await tracker.getByRole('button', { name: 'Увеличить До долгого отдыха' }).click();
      await expect(preview.getByLabel('До долгого отдыха: 1 из 20')).toBeVisible();

      await gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Действия' }).click();
      await gm.getByRole('button', { name: 'Продолжительный отдых', exact: true }).click();
      const chronicle = gm.getByLabel('Чат игры');
      await chronicle.getByRole('button', { name: 'Получить страх и завершить' }).click();
      await expect.poll(async () => (
        await preview.getByLabel('До долгого отдыха: 0 из 2').count()
      ), { timeout: 15_000 }).toBe(1);
    } finally {
      await relay.close();
    }
  });

  test('opens previews over the current sheet on mobile instead of switching to chat', async ({ browser }) => {
    const { relay, player } = await openJoinedFilledTable(browser, 'preview-mobile', { width: 390, height: 844 }, (character) => {
      character.sheetCards.push(
        { id: 'feature-class', kind: 'classFeature', name: 'Знание школы', text: 'Помните забытые заклинания.' },
        { id: 'feature-ancestry', kind: 'ancestryFeature', name: 'Наследие', text: 'Храните память рода.' },
        { id: 'feature-other', kind: 'custom', name: 'Личная клятва', text: 'Не оставляйте союзников.' }
      );
      character.inventory.push({ id: 'consumable-tonic', name: 'Малое зелье выносливости', kind: 'consumable', quantity: 1, uses: { current: 2, max: 2 }, text: 'Снимите 1 Стресс.' });
    });
    try {
      await player.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();
      const zones = await openCardSection(player);
      await cardRow(zones.getByRole('region', { name: 'Рука карт доменов' }), 'Заклинание 1').locator('.player-domain-card-thumb').click();

      const preview = player.getByRole('dialog', { name: 'Предпросмотр' });
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('Заклинание 1');
      await expect(player.locator('[data-vtt-root]')).toHaveClass(/player-view--mobile-sheet/);
      await expect(player.getByLabel('Чат игры').locator('.feed-domain-card')).toHaveCount(0);
      const box = await preview.boundingBox();
      expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
      await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();
      await expect(preview).toHaveCount(0);

      await player.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Свойства' }).click();
      const sheet = player.getByLabel('Персонаж игрока');
      await expect(sheet.getByRole('region', { name: 'Свойства: Класс' })).toContainText('Знание школы');
      await expect(sheet.getByRole('region', { name: 'Свойства: Родословная' })).toContainText('Наследие');
      await expect(sheet.getByRole('region', { name: 'Свойства: Остальное' })).toContainText('Личная клятва');
      const featureHeights = await sheet.locator('.player-sheet-feature-group .dh-list-item').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      expect(featureHeights.every((height) => height <= 48)).toBe(true);
      await sheet.getByRole('region', { name: 'Свойства: Класс' }).getByRole('button', { name: 'Знание школы' }).click();
      await expect(preview.getByTitle('Настроить трекер для «Знание школы»')).toBeVisible();
      await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();

      await player.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Инвентарь' }).click();
      await player.getByLabel('Персонаж игрока').getByRole('button', { name: /Деньги/ }).click();
      await expect(preview).toContainText('Деньги');
      await expect(preview.getByLabel('Редактировать деньги')).toBeVisible();
      await expect(player.getByLabel('Чат игры').getByLabel('Редактировать деньги')).toHaveCount(0);
      await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();
      await player.getByLabel('Персонаж игрока').getByRole('button', { name: 'Малое зелье выносливости' }).click();
      await expect(preview.getByRole('button', { name: 'Использовать' })).toBeVisible();
      const uses = preview.getByRole('group', { name: 'Осталось' });
      await expect(uses.getByRole('button')).toHaveCount(2);
      await expect(preview.getByTitle('Настроить трекер для «Малое зелье выносливости»')).toHaveCount(0);
      await preview.getByRole('button', { name: 'Использовать' }).click();
      await expect(uses.getByRole('button', { name: 'Осталось 2 из 2' })).toHaveAttribute('aria-pressed', 'false');
      await expect(player.getByLabel('Персонаж игрока').locator('.dh-list-item').filter({ hasText: 'Малое зелье выносливости' })).toContainText('1/2');

      await preview.getByRole('button', { name: 'Закрыть предпросмотр' }).click();
      await player.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Оружие' }).click();
      await sheet.locator('#player-sheet-actions .dh-list-item').first().click();
      const roll = player.getByRole('dialog', { name: 'Подтверждение броска' });
      await expect(roll).toBeVisible();
      const rollActionBox = await roll.getByRole('button', { name: 'Бросить действие' }).boundingBox();
      expect(rollActionBox?.y).toBeLessThan(420);
    } finally {
      await relay.close();
    }
  });

  test('changes several domain-card tokens from the GM sheet without publishing the card', async ({ browser }) => {
    const { relay, gm } = await openJoinedFilledTable(browser, 'tokens');
    try {
      await gm.getByLabel('Участники сцены').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
      const zones = await openCardSection(gm);
      const hand = zones.getByRole('region', { name: 'Рука карт доменов' });
      const tokenCard = cardRow(hand, 'Заклинание 3');
      await tokenCard.click();
      const preview = gm.getByRole('complementary', { name: 'Предпросмотр', exact: true });
      const tokenTrack = preview.getByRole('group', { name: 'Надежда карты Заклинание 3' });

      await tokenTrack.getByRole('button', { name: 'Надежда карты Заклинание 3 3 из 3' }).click();
      await expect(tokenTrack.getByRole('button', { name: 'Надежда карты Заклинание 3 1 из 3' })).toHaveAttribute('aria-pressed', 'true');
      await expect(tokenTrack.getByRole('button', { name: 'Надежда карты Заклинание 3 2 из 3' })).toHaveAttribute('aria-pressed', 'true');
      await expect(tokenTrack.getByRole('button', { name: 'Надежда карты Заклинание 3 3 из 3' })).toHaveAttribute('aria-pressed', 'true');
      await expect(gm.getByLabel('Чат игры').locator('.feed-domain-card')).toHaveCount(0);
      await gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Участники' }).click();
      await gm.getByLabel('Участники сцены').getByRole('button', { name: /Алая Слизь/ }).first().click();
      await expect(preview).toHaveCount(0);
    } finally {
      await relay.close();
    }
  });

  test('keeps trusted player editing explicit, synchronized, auditable, undoable, and usable on mobile', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'edit');
    try {
      await gm.getByLabel('Участники сцены').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
      const gmSheet = gm.getByLabel('Персонаж игрока');
      await expect(gmSheet.getByRole('button', { name: 'К ростеру' })).toHaveCount(0);
      const gmContext = gm.getByLabel('Контекст мастера');
      await expect(gmContext.getByRole('button', { name: new RegExp(`Лист: ${filledCharacterName}`) })).toHaveAttribute('aria-pressed', 'true');
      await gm.getByRole('button', { name: 'Редактировать', exact: true }).click();
      const directGmEditor = gm.getByRole('dialog', { name: 'Редактор персонажа' });
      await expect(directGmEditor).toBeVisible();
      await expect(directGmEditor).toContainText(filledCharacterName);
      await directGmEditor.getByRole('button', { name: 'Закрыть редактор персонажа' }).click();

      await player.getByLabel('Персонаж игрока').getByRole('button', { name: 'Редактировать' }).click();
      let dialog = player.getByRole('dialog', { name: 'Редактор моего персонажа' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Образ' }).click();
      await expect(dialog.getByLabel('Имя')).toHaveCount(0);
      await expect(dialog.getByLabel('Образ персонажа')).toContainText(filledCharacterName);
      await expect(dialog.getByText('Свободное редактирование обходит игровые ограничения')).toHaveCount(0);

      await dialog.getByRole('button', { name: 'Свободное редактирование' }).click();
      await expect(dialog.getByText('Свободное редактирование обходит игровые ограничения')).toContainText('Для повышения по правилам используйте «Новый уровень»');
      await expect(dialog.getByLabel('Имя')).toHaveValue(filledCharacterName);
      await dialog.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Заметки' }).click();
      const playerNote = 'Игрок дополнил историю в автономном P2P-профиле.';
      await dialog.getByRole('textbox', { name: 'Заметки персонажа' }).fill(playerNote);
      await dialog.getByRole('button', { name: 'Готово' }).click();
      await expect(dialog.getByRole('textbox', { name: 'Заметки персонажа' })).toHaveCount(0);
      await expect(dialog.getByText(playerNote)).toBeVisible();

      const gmEditor = await openGmCharacterEditor(gm);
      await gmEditor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'История' }).click();
      const history = gmEditor.getByLabel('История изменений персонажа');
      await expect(history).toContainText('Игрок 1 — игрок', { timeout: 15_000 });
      await expect(history).toContainText('Заметки');

      const latestChange = history.locator('ol').first().locator(':scope > li').first();
      await latestChange.locator('summary').click();
      await expect(latestChange).toContainText(playerNote);
      await latestChange.getByRole('button', { name: 'Отменить изменение' }).click();

      await dialog.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Заметки' }).click();
      await expect(dialog.getByText('Хранительница забытых историй.')).toBeVisible({ timeout: 15_000 });

      await player.getByRole('button', { name: 'Закрыть редактор персонажа' }).click();
      await player.setViewportSize({ width: 390, height: 844 });
      await player.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();
      await player.getByLabel('Персонаж игрока').getByRole('button', { name: 'Редактировать' }).click();
      dialog = player.getByRole('dialog', { name: 'Редактор моего персонажа' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      expect(box!.y + box!.height).toBeLessThanOrEqual(844);
      await dialog.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Образ' }).click();
      await expect(dialog.getByLabel('Имя')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Свободное редактирование' }).click();
      await expect(dialog.getByText('Свободное редактирование обходит игровые ограничения')).toBeVisible();
      await expect(dialog.getByLabel('Имя')).toBeVisible();
      await expect(player.locator('body')).toHaveJSProperty('scrollWidth', 390);
    } finally {
      await relay.close();
    }
  });

  test('keeps the ranger companion compact and uses the standard attack composer', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'pet', { width: 1440, height: 900 }, (character) => {
      character.className = 'Ranger';
      character.subclassName = 'Звериный союз';
      character.spellcastTrait = 'instinct';
      character.sheetCards.push({
        id: 'e2e-companion-feature',
        kind: 'subclassFeature',
        name: 'Компаньон',
        subclassTier: 'foundation',
        text: 'У вас есть животное-компаньон. Оно следует за вами и действует по вашей команде.'
      });
      character.companion = {
        name: 'Искра',
        imageUrl: '',
        evasion: 10,
        stress: { marked: 0, max: 3 },
        attackName: 'Когти',
        attackRange: 'Вплотную',
        attackFormula: '1d6',
        attackDamageType: 'physical',
        experiences: [
          { id: 'companion-exp-scout', name: 'Разведчица', modifier: 2 },
          { id: 'companion-exp-guard', name: 'Защитница', modifier: 2 }
        ],
        unavailableUntilLongRest: false,
        notes: ''
      };
    });
    try {
      const gmRoster = gm.getByLabel('Участники сцены');
      const gmRosterCompanion = gmRoster.locator('.player-roster__item--companion');
      await expect(gmRosterCompanion).toHaveCount(0);
      await gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' }).click();
      const preparedCompanion = gm.getByRole('region', { name: 'Подготовлено' }).locator('.player-prepared__companion').filter({ hasText: 'Искра' });
      await expect(preparedCompanion).toContainText('Спутник');
      await expect(preparedCompanion.getByRole('button', { name: 'Добавить Искра на сцену' })).toBeVisible();
      await gm.getByLabel('Контекст мастера').getByRole('button', { name: 'Участники' }).click();

      const playerSheet = player.getByLabel('Персонаж игрока');
      const companion = playerSheet.getByLabel('Компаньон следопыта');
      await expect(companion).toBeVisible();
      await expect(companion).toContainText('Искра');
      await expect(companion).toContainText('Уклонение 10');
      await expect(companion).not.toContainText('Не на сцене');
      await expect(companion).not.toContainText('Опыт компаньона');
      await expect(companion).not.toContainText('Успех с Надеждой');
      await expect(companion.getByRole('button', { name: 'Когти' })).toBeVisible();
      const companionRuleTerm = companion.getByRole('button', { name: 'Компаньон', exact: true });
      await expectRuleTooltip(
        player,
        companionRuleTerm,
        'Сделайте Бросок Заклинания, чтобы связаться со своим компаньоном и приказать ему совершить действие. Потратьте Надежду, чтобы добавить подходящий Опыт Компаньона к броску. При успехе с Надеждой, если ваше следующее действие опирается на успех компаньона, вы получаете Преимущество на этот бросок.'
      );
      await expectRuleTooltip(
        player,
        companion.getByRole('button', { name: 'Стресс', exact: true }),
        'Стресс отражает вашу способность выдерживать давление опасных ситуаций и умственное напряжение. Каждый класс начинает с 6 ячейками Стресса.'
      );
      await expect(companion.locator('.player-companion-panel__stress')).toContainText('0/3');
      const identityBox = await companion.locator('.player-companion-panel__identity').boundingBox();
      const stressBox = await companion.locator('.player-companion-panel__stress').boundingBox();
      const attackBox = await companion.getByRole('button', { name: 'Когти' }).boundingBox();
      expect(identityBox).not.toBeNull();
      expect(stressBox).not.toBeNull();
      expect(attackBox).not.toBeNull();
      expect(Math.abs(stressBox!.y - identityBox!.y)).toBeLessThan(identityBox!.height);
      expect(attackBox!.y).toBeGreaterThan(identityBox!.y + identityBox!.height - 2);

      await companion.getByRole('button', { name: 'Когти' }).click();
      const roll = player.getByLabel('Подтверждение броска');
      await expect(roll).toContainText('Когти');
      await expect(roll.locator('.dh-draggable-surface')).toHaveCount(0);
      const rollBox = await roll.boundingBox();
      const sheetBox = await playerSheet.boundingBox();
      expect(rollBox).not.toBeNull();
      expect(sheetBox).not.toBeNull();
      expect(rollBox!.x + rollBox!.width).toBeLessThanOrEqual(sheetBox!.x + 1);
      await expect(roll.getByLabel('Разведчица +2')).toBeVisible();
      await expect(roll.getByLabel('Защитница +2')).toBeVisible();
      await expect(roll.getByRole('button', { name: 'Бросить действие' })).toBeVisible();
      await expect(roll.getByRole('button', { name: 'Бросить урон' })).toBeVisible();
      await roll.getByRole('button', { name: 'Закрыть', exact: true }).click();

      await gm.getByLabel('Участники сцены').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
      const gmCompanion = gm.getByLabel('Персонаж игрока').getByLabel('Компаньон следопыта');
      await expect(gmCompanion.getByRole('button', { name: 'Редактировать компаньона Искра' })).toBeVisible();
      await expect(gmCompanion.getByRole('button', { name: 'Добавить Искра на сцену' })).toBeVisible();

      await gmCompanion.getByRole('button', { name: 'Редактировать компаньона Искра' }).click();
      const editor = gm.getByRole('dialog', { name: 'Редактирование компаньона Искра' });
      await expect(editor.getByLabel('Имя')).toHaveValue('Искра');
      await editor.getByLabel('Имя').fill('Искра Лесная');
      await editor.getByRole('button', { name: 'Сохранить' }).click();
      await expect(gmCompanion).toContainText('Искра Лесная');

      await gmCompanion.getByRole('button', { name: 'Добавить Искра Лесная на сцену' }).click();
      await expect(gm.getByLabel('Игровая сцена').getByRole('button', { name: 'Искра Лесная' })).toBeVisible();
      await expect(player.getByLabel('Игровая сцена').getByRole('button', { name: 'Искра Лесная' })).toBeVisible({ timeout: 15_000 });
      await expect(gmCompanion.getByRole('button', { name: 'Убрать Искра Лесная со сцены' })).toBeVisible();

      await companionRuleTerm.click();
      await expect(player).toHaveURL(/\/#\/library\/compendium\/rules\/ranger-companion$/);
      const workspace = player.getByRole('dialog', { name: 'Библиотека игры' });
      const detail = workspace.getByLabel('Полная запись компендиума');
      await expect(detail.getByRole('heading', { name: 'Компаньон Следопыта', exact: true })).toBeVisible();
      await expect(detail.getByRole('heading', { name: 'Работа с компаньоном', exact: true })).toBeVisible();
      await expect(detail).not.toContainText('#####');
      await expect(detail).not.toContainText('{#');
    } finally {
      await relay.close();
    }
  });

  test('opens contextual rule help from an undecorated interface term', async ({ browser }) => {
    const { relay, player } = await openJoinedFilledTable(browser, 'help', { width: 1440, height: 900 }, (character) => {
      character.conditions.push({
        id: 'e2e-vulnerable',
        name: 'vulnerable',
        notes: ''
      }, {
        id: 'e2e-hidden',
        name: 'hidden',
        notes: ''
      });
    });
    try {
      const sheet = player.getByLabel('Персонаж игрока');
      for (const [label, expected] of [
        ['Мастерство', 'Ваше Мастерство определяет, сколько Костей Урона вы бросаете при успешной атаке оружием, а также другие свойства, использующие Мастерство.'],
        ['НАДЕЖДА', 'Надежда — это валюта, используемая игроками для обозначения того, как складывается судьба персонажей в ходе игры.'],
        ['Раны', 'Раны — это абстрактное отражение физической стойкости персонажа и его способности выдерживать удары клинком и магией.'],
        ['Стресс', 'Стресс отражает вашу способность выдерживать давление опасных ситуаций и умственное напряжение. Каждый класс начинает с 6 ячейками Стресса.'],
        ['Легкий', 'Легкий урон - это любой урон, меньший, чем ваш порог Ощутимого урона; вы отмечаете 1 Рану.'],
        ['Ощутимый', 'Ощутимый урон равен или превышает ваш порог Ощутимого урона, но ниже порога Тяжелого урона; вы получаете 2 Раны.'],
        ['Тяжелый', 'Тяжелый урон равен или превышает ваш порог Тяжелого урона; вы отмечаете 3 Раны.'],
        ['Уклонение', 'Уклонение вашего персонажа определяет, насколько сложно противникам попасть в вас.'],
        ['Броня', 'Когда ваш персонаж получает урон, вы можете отменить часть или весь урон, отметив доступную Ячейку Брони рядом с большим щитом Брони на листе персонажа, а затем снизив тяжесть урона на один порог: с Тяжёлого до Ощутимого, с Ощутимого до Лёгкого, с Лёгкого до нулевого. Каждый раз, когда ваш персонаж получает урон, вы можете отметить только 1 Ячейку Брони,...'],
        ['Состояния', 'Некоторые свойства накладывают состояние на вашего персонажа (или противника). Это эффекты, которые дают определенные преимущества или недостатки цели, на которую они наложены.']
      ] as const) {
        await expectRuleTooltip(player, sheet.getByRole('button', { name: label, exact: true }), expected);
      }

      for (const [label, expected] of [
        ['Уязвим', 'Когда существо становится Уязвимым, игроки и Мастер должны совместно описать, как это произошло. Пока вы Уязвимы, все броски, направленные на вас, имеют преимущество.'],
        ['Скрыт', 'Пока вы Скрыты, все броски против вас имеют помеху. После того, как противник переместился в место, откуда он может вас увидеть, вы переместились в его поле зрения или совершили атаку, вы больше не Скрыт.']
      ] as const) {
        await expectRuleTooltip(player, sheet.getByRole('button', { name: label, exact: true }), expected);
      }
      await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();
      const restrainedMenuItem = sheet.getByRole('menuitem', { name: 'Обездвижен', exact: true });
      await expectRuleTooltip(
        player,
        restrainedMenuItem.locator('[aria-describedby]'),
        'Когда вы получаете состояние Обездвижен, вы не можете двигаться, пока это состояние не будет снято, но вы всё ещё можете совершать действия с вашей текущей позиции.'
      );
      await sheet.getByRole('button', { name: 'Добавить состояние', exact: true }).click();

      await player.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Характеристики' }).click();
      const heading = sheet.locator('#player-sheet-traits h3');
      await expect(heading).toContainText('Характеристики');
      await expect(heading).toContainText('опыт');
      const headingParts = await Promise.all([
        heading.getByRole('button', { name: 'Характеристики', exact: true }).boundingBox(),
        heading.locator('.player-sheet-heading-terms > span').boundingBox(),
        heading.getByRole('button', { name: 'опыт', exact: true }).boundingBox()
      ]);
      expect(headingParts.every(Boolean)).toBe(true);
      expect(headingParts[1]!.x - (headingParts[0]!.x + headingParts[0]!.width)).toBeGreaterThan(1);
      expect(headingParts[2]!.x - (headingParts[1]!.x + headingParts[1]!.width)).toBeGreaterThan(1);

      await expectRuleTooltip(
        player,
        heading.getByRole('button', { name: 'Характеристики', exact: true }),
        'Эти значения отражают ваши природные или приобретенные способности в каждой из шести основных характеристик: Проворность, Сила, Искусность, Инстинкт, Влияние и Знание.'
      );
      await expectRuleTooltip(
        player,
        heading.getByRole('button', { name: 'опыт', exact: true }),
        'Когда один из Опытов вашего персонажа подходит к текущей ситуации, вы можете использовать этот Опыт, чтобы продемонстрировать его мастерство. Перед тем, как совершить действие или бросок реакции, вы можете потратить Надежду, чтобы добавить модификатор Опыта к результату броска. Иногда несколько Опытов вашего персонажа подходят к ситуации (например, если в...'
      );

      for (const [label, expected] of [
        ['Проворность', 'Пробежать, Прыгнуть, Маневрировать Высокая Проворность означает, что вы быстры, ловки на пересеченной местности и быстро реагируете на опасность. Вы совершаете бросок Проворности, чтобы взобраться по веревке, спринтом укрыться или перепрыгнуть с крыши на крышу.'],
        ['Сила', 'Поднять, Крушить, Схватить Высокая Сила означает, что вы лучше справляетесь с задачами, требующими физической силы и выносливости. Вы совершаете бросок Силы, чтобы выбить дверь, поднять тяжелые предметы или удержать позицию против наступающего противника.'],
        ['Искусность', 'Взломать, Скрыться, Смастерить Высокая Искусность означает, что вы умеете выполнять задачи, требующие точности, скрытности или предельного контроля. Вы совершаете бросок Искусности, чтобы использовать точные инструменты, ускользнуть от внимания или нанести точный удар.'],
        ['Инстинкт', 'Увидеть, Чувствовать, Ориентироваться Высокий Инстинкт означает, что вы обладаете острым чувством окружающей обстановки и природной интуицией. Вы совершаете бросок Инстинкта, чтобы почувствовать опасность, заметить детали в окружающем мире или выследить неуловимого врага.'],
        ['Влияние', 'Очаровать, Выступить, Обмануть Высокий уровень Влияния означает, что у вас сильная личность и вы легко ладите с людьми. Вы совершаете бросок Влияния, чтобы отстоять свою точку зрения, запугать противника или привлечь внимание толпы.'],
        ['Знание', 'Вспоминать, Анализировать, Понимать Высокий показатель Знания означает, что вы обладаете информацией, недоступной другим, и умеете применять свой ум для дедукции и умозаключений. Вы совершаете бросок Знания, чтобы интерпретировать факты, ясно видеть закономерности или вспомнить важную информацию.']
      ] as const) {
        const traitCard = sheet.locator('.player-trait-grid').getByRole('button', { name: new RegExp(label) });
        await expectRuleTooltip(player, traitCard.locator('[aria-describedby]'), expected);
      }

      const agilityCard = sheet.locator('.player-trait-grid').getByRole('button', { name: /Проворность/ });
      const cardRuleTerm = agilityCard.locator('[aria-describedby]');
      await cardRuleTerm.hover();
      const cardTooltipId = await cardRuleTerm.getAttribute('aria-describedby');
      const cardTooltip = player.locator(`[id="${cardTooltipId}"]`);
      await expect(cardTooltip).not.toContainText('Нажмите, чтобы открыть статью');
      await agilityCard.click();

      const roll = player.getByLabel('Подтверждение броска');
      const agilityTerm = roll.getByRole('button', { name: 'Проворность', exact: true });
      await expect(agilityTerm).toBeVisible();
      await expect(agilityTerm).toHaveCSS('text-decoration-line', 'none');
      await expectRuleTooltip(
        player,
        agilityTerm,
        'Пробежать, Прыгнуть, Маневрировать Высокая Проворность означает, что вы быстры, ловки на пересеченной местности и быстро реагируете на опасность. Вы совершаете бросок Проворности, чтобы взобраться по веревке, спринтом укрыться или перепрыгнуть с крыши на крышу.'
      );
      await expectRuleTooltip(
        player,
        roll.getByRole('button', { name: 'Опыт', exact: true }),
        'Когда один из Опытов вашего персонажа подходит к текущей ситуации, вы можете использовать этот Опыт, чтобы продемонстрировать его мастерство. Перед тем, как совершить действие или бросок реакции, вы можете потратить Надежду, чтобы добавить модификатор Опыта к результату броска. Иногда несколько Опытов вашего персонажа подходят к ситуации (например, если в...'
      );

      await agilityTerm.click();
      await expect(player).toHaveURL(/\/#\/library\/compendium\/rules\/character-traits$/);
      const workspace = player.getByRole('dialog', { name: 'Библиотека игры' });
      await expect(workspace).toBeVisible();
      await expect(workspace.getByRole('heading', { name: 'Характеристики персонажа', exact: true })).toBeVisible();
      await expect(workspace.getByRole('heading', { name: 'Проворность', exact: true })).toBeVisible();
      await expect(workspace).toContainText('быстры');
    } finally {
      await relay.close();
    }
  });

  test('lets the player complete a strict level-up that the GM can audit and undo', async ({ browser }) => {
    const { relay, gm, player } = await openJoinedFilledTable(browser, 'level');
    try {
      await player.getByLabel('Персонаж игрока').getByRole('button', { name: 'Редактировать' }).click();
      const playerEditor = player.getByRole('dialog', { name: 'Редактор моего персонажа' });
      await expect(playerEditor).toBeVisible();
      await playerEditor.getByRole('button', { name: 'Новый уровень' }).click();

      const levelUp = player.getByRole('dialog', { name: 'Повышение уровня' });
      await expect(levelUp).toBeVisible();
      // A player gets the same strict rules wizard as the GM, without the
      // freeform bypass that would let them invent extra advancements.
      await expect(levelUp.locator('summary').filter({ hasText: 'Свободный режим мастера' })).toHaveCount(0);
      await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Ран' }).click();
      await levelUp.getByRole('button', { name: 'Добавить: Добавить ячейку Стресса' }).click();
      await expect(levelUp.getByText('2 из 2 очков')).toBeVisible();

      const levelUpExperience = 'Победитель алой слизи';
      await levelUp.getByRole('button', { name: 'Дальше' }).click();
      await levelUp.getByLabel('Новый Опыт (+2)').fill(levelUpExperience);

      await levelUp.getByRole('button', { name: 'Дальше' }).click();
      await chooseRichOption(player, 'Обязательная карта домена');
      await expect(levelUp.getByText(/Рука заполнена/)).toBeVisible();
      const handReplacement = levelUp.getByRole('button', { name: /^В Руку:/ });
      await handReplacement.click();
      const handReplacementPicker = player.getByRole('dialog', { name: /Выбор: В Руку:/ });
      await handReplacementPicker.getByRole('option').filter({ hasText: 'Заклинание 1' }).click();
      await handReplacementPicker.getByRole('button', { name: 'Выбрать', exact: true }).click();

      await levelUp.getByRole('button', { name: 'Дальше' }).click();
      await expect(levelUp.getByText('Всё готово к повышению.')).toBeVisible();
      await expect(levelUp.getByText(/Рука вместо «Заклинание 1»/)).toBeVisible();
      await levelUp.getByRole('button', { name: 'Применить повышение' }).click();
      await expect(levelUp).toHaveCount(0);
      await expect(playerEditor.getByText(/уровень 2/i)).toBeVisible();

      const gmEditor = await openGmCharacterEditor(gm);
      await gmEditor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'История' }).click();
      const history = gmEditor.getByLabel('История изменений персонажа');
      await expect(history).toContainText('Игрок 1 — игрок', { timeout: 15_000 });
      const latestChange = history.locator('ol').first().locator(':scope > li').first();
      await latestChange.locator('summary').click();
      await expect(latestChange).toContainText('Уровень');
      await expect(latestChange).toContainText('1 → 2');
      await expect(latestChange).toContainText('Раны');
      await expect(latestChange).toContainText('Стресс');
      await expect(latestChange).toContainText('Опыты');
      await expect(latestChange).toContainText('Победитель алой сли');
      await expect(latestChange).toContainText('Карты доменов');
      await expect(latestChange).toContainText('Добавлено:');
      await expect(latestChange).not.toContainText('[{"id"');
      await expect(latestChange).not.toContainText('"text"');
      const domainCardChange = latestChange.locator('ul').first().locator(':scope > li').filter({ hasText: 'Карты доменов' });
      await expect(domainCardChange).toHaveCount(1);
      const domainCardLabelBox = await domainCardChange.locator('strong').boundingBox();
      const domainCardValueBox = await domainCardChange.locator('span').boundingBox();
      expect(domainCardLabelBox).not.toBeNull();
      expect(domainCardValueBox).not.toBeNull();
      expect(domainCardValueBox!.x - domainCardLabelBox!.x).toBeLessThanOrEqual(200);

      await latestChange.getByRole('button', { name: 'Отменить изменение' }).click();
      await expect(playerEditor.getByText(/уровень 1/i)).toBeVisible({ timeout: 15_000 });
      await playerEditor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Ресурсы' }).click();
      await playerEditor.getByRole('button', { name: 'Свободное редактирование' }).click();
      await expect(playerEditor.getByLabel('Макс. Ран')).toHaveValue(String(filledCharacterResources.hp.max));
      await expect(playerEditor.getByLabel('Макс. Стресса')).toHaveValue(String(filledCharacterResources.stress.max));
    } finally {
      await relay.close();
    }
  });
});
