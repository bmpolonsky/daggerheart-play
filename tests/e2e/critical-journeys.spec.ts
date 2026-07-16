import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';

async function openWorkspace(page: Page): Promise<Locator> {
  const workspace = page.getByRole('dialog', { name: 'Рабочее пространство' });
  await page.getByRole('button', { name: 'Инструменты' }).click();
  await expect(workspace).toBeVisible();
  return workspace;
}

async function selectWorkspaceTab(workspace: Locator, name: string): Promise<void> {
  const tab = workspace.getByLabel('Разделы рабочего пространства').getByRole('button', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
}

async function selectSettingsSection(workspace: Locator, name: string): Promise<void> {
  await selectWorkspaceTab(workspace, 'Настройки');
  const section = workspace.getByLabel('Разделы настроек').getByRole('button', { name, exact: true });
  await section.click();
  await expect(section).toHaveAttribute('aria-pressed', 'true');
}

async function reloadGamePage(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function waitForStoredMarker(page: Page, marker: string, present = true): Promise<void> {
  await expect.poll(async () => page.evaluate(async ({ marker, present }) => {
    const project = await new Promise<unknown>((resolve, reject) => {
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
    return JSON.stringify(project).includes(marker) === present;
  }, { marker, present })).toBe(true);
}

async function waitForLiveScene(page: Page, sceneName: string): Promise<void> {
  await expect.poll(async () => page.evaluate(async (expectedName) => {
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
    const active = project?.games?.[project?.activeGameId]?.state?.sceneTable;
    return active?.scenes?.[active.liveSceneId]?.name === expectedName;
  }, sceneName)).toBe(true);
}

async function waitForStoredCustomAdversary(page: Page, name: string, present: boolean): Promise<void> {
  await expect.poll(async () => page.evaluate(async ({ name, present }) => {
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
    const entries = project?.shared?.customContent?.adversaries ?? [];
    return entries.some((entry: { name?: string }) => entry.name === name) === present;
  }, { name, present })).toBe(true);
}

test.describe('critical persisted journeys', () => {
  test.describe.configure({ timeout: 120_000 });

  test('persists scene creation, editing, publishing and deletion across reloads', async ({ page }) => {
    await openGmGame(page);
    let workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Сцены');

    await workspace.getByRole('button', { name: 'Новая сцена' }).click();
    const editor = workspace.locator('.player-tools-scene-editor');
    await editor.getByLabel('Название').fill('Маяк во время шторма');
    await editor.getByLabel('Подзаголовок').fill('Колокол звучит сам по себе');

    const sceneList = workspace.getByLabel('Список сцен');
    await sceneList.getByRole('button').first().click();
    const positioningAction = editor.getByRole('button', { name: 'Сделать рабочей' });
    await expect(positioningAction).toBeVisible();
    await positioningAction.click();
    await expect(positioningAction).toHaveCount(0);
    await sceneList.getByRole('button', { name: /Маяк во время шторма/ }).click();
    await expect(positioningAction).toBeVisible();
    await positioningAction.click();
    await expect(positioningAction).toHaveCount(0);

    await editor.getByRole('button', { name: 'Показать игрокам' }).click();
    await expect(editor.getByText('Показана игрокам')).toBeVisible();
    await waitForLiveScene(page, 'Маяк во время шторма');

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Сцены');
    const restoredScene = workspace.getByRole('button', { name: /Маяк во время шторма/ });
    await expect(restoredScene).toBeVisible();
    await restoredScene.click();
    const restoredEditor = workspace.getByRole('region', { name: 'Редактор сцены Маяк во время шторма' });
    await expect(restoredEditor.getByText('Показана игрокам')).toBeVisible();
    await expect(restoredEditor.getByLabel('Подзаголовок')).toHaveValue('Колокол звучит сам по себе');

    await restoredEditor.getByRole('button', { name: 'Удалить сцену' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить сцену «Маяк во время шторма»?' });
    await expect(confirmation.getByRole('button', { name: 'Отмена' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Удалить' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: /Маяк во время шторма/ })).toHaveCount(0);
    await waitForStoredMarker(page, 'Колокол звучит сам по себе', false);

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Сцены');
    await expect(workspace.getByRole('button', { name: /Маяк во время шторма/ })).toHaveCount(0);
  });

  test('persists campaign notes and the complete handout lifecycle', async ({ page }) => {
    await openGmGame(page);
    let workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Заметки');
    await workspace.getByLabel('Заметки кампании').fill('Вернуть капитана в третьем акте.');

    await selectWorkspaceTab(workspace, 'Раздатка');
    await workspace.getByRole('button', { name: 'Новая раздатка' }).click();
    const editor = workspace.locator('.player-tools-handout-editor');
    await editor.getByLabel('Название').fill('Письмо из пепла');
    await editor.getByLabel('Текст').fill('Чернила проявляются только рядом с огнём.');
    await editor.getByRole('checkbox', { name: 'Доступна игрокам' }).check();
    await editor.getByRole('button', { name: 'Показать на столе' }).click();
    await expect(editor.getByRole('button', { name: 'Убрать со стола' })).toBeVisible();
    await waitForStoredMarker(page, 'Чернила проявляются только рядом с огнём.');

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Заметки');
    await expect(workspace.getByLabel('Заметки кампании')).toHaveValue('Вернуть капитана в третьем акте.');
    await selectWorkspaceTab(workspace, 'Раздатка');
    const restoredEditor = workspace.getByRole('region', { name: 'Редактор раздатки Письмо из пепла' });
    await expect(restoredEditor.getByLabel('Текст')).toHaveValue('Чернила проявляются только рядом с огнём.');
    await expect(restoredEditor.getByRole('checkbox', { name: 'Доступна игрокам' })).toBeChecked();
    await expect(restoredEditor.getByRole('button', { name: 'Убрать со стола' })).toBeVisible();

    await restoredEditor.getByRole('button', { name: 'Убрать со стола' }).click();
    await restoredEditor.getByRole('button', { name: 'Удалить раздатку Письмо из пепла' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить раздатку «Письмо из пепла»?' });
    await confirmation.getByRole('button', { name: 'Удалить' }).click();
    await expect(workspace.getByRole('button', { name: /Письмо из пепла/ })).toHaveCount(0);
    await waitForStoredMarker(page, 'Письмо из пепла', false);
    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Раздатка');
    await expect(workspace.getByRole('button', { name: /Письмо из пепла/ })).toHaveCount(0);
  });

  test('creates and edits a character, then restores it after reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGmGame(page);
    let workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Персонажи');
    await workspace.getByRole('button', { name: 'Создать героя' }).click();

    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    await builder.getByRole('button', { name: 'Быстрый старт' }).click();
    await builder.getByRole('button', { name: 'Личность' }).click();
    await builder.getByLabel('Имя').fill('Эхо Северного ветра');
    await builder.getByRole('button', { name: 'Итог' }).click();
    await builder.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(builder).toHaveCount(0);

    const roster = workspace.getByLabel('Ростер персонажей');
    await roster.getByRole('button', { name: /Эхо Северного ветра/ }).click();
    const editor = workspace.getByLabel('Редактор персонажа');
    await editor.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Образ', exact: true }).click();
    const nameField = editor.getByLabel('Имя');
    await nameField.fill('Эхо из Белой башни');
    await expect(nameField).toHaveValue('Эхо из Белой башни');
    await waitForStoredMarker(page, 'Эхо из Белой башни');
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Заметки' }).click();
    await editor.getByRole('textbox', { name: 'Заметки персонажа' }).fill('Помнит дорогу, которой больше нет.');
    await waitForStoredMarker(page, 'Помнит дорогу, которой больше нет.');

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Персонажи');
    const restoredRoster = workspace.getByLabel('Ростер персонажей');
    const restoredCharacter = restoredRoster.getByRole('button', { name: /Эхо из Белой башни/ });
    await expect(restoredCharacter).toBeVisible();
    await restoredCharacter.click();
    const restoredEditor = workspace.getByLabel('Редактор персонажа');
    await restoredEditor.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await restoredEditor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Заметки' }).click();
    await expect(restoredEditor.getByRole('textbox', { name: 'Заметки персонажа' })).toHaveValue('Помнит дорогу, которой больше нет.');
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });

  test('exports a campaign and imports the archive back as a real round trip', async ({ page }) => {
    await openGmGame(page);
    let workspace = await openWorkspace(page);
    await selectSettingsSection(workspace, 'Игра');
    await workspace.getByLabel('Название игры').fill('Кампания для round-trip');
    await selectWorkspaceTab(workspace, 'Заметки');
    await workspace.getByLabel('Заметки кампании').fill('Контрольная строка из архива.');
    await selectSettingsSection(workspace, 'Игры проекта');

    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Экспорт' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.dhgame$/);
    const archivePath = await download.path();
    expect(archivePath).toBeTruthy();

    await selectSettingsSection(workspace, 'Игра');
    await workspace.getByLabel('Название игры').fill('Испорченная после экспорта');
    await selectWorkspaceTab(workspace, 'Заметки');
    await workspace.getByLabel('Заметки кампании').fill('Эта строка должна исчезнуть.');
    await selectSettingsSection(workspace, 'Игры проекта');
    await workspace.locator('input[type="file"][accept*=".dhgame"]').setInputFiles(archivePath!);
    await expect(workspace.getByText(/Игра импортирована:/)).toBeVisible();

    await selectSettingsSection(workspace, 'Игра');
    await expect(workspace.getByLabel('Название игры')).toHaveValue('Кампания для round-trip');
    await selectWorkspaceTab(workspace, 'Заметки');
    await expect(workspace.getByLabel('Заметки кампании')).toHaveValue('Контрольная строка из архива.');
  });

  test('switches between independent project games without mixing their data', async ({ page }) => {
    await openGmGame(page);
    const workspace = await openWorkspace(page);
    await selectSettingsSection(workspace, 'Игра');
    await workspace.getByLabel('Название игры').fill('Первая кампания');
    await selectWorkspaceTab(workspace, 'Заметки');
    await workspace.getByLabel('Заметки кампании').fill('Секрет первой кампании');
    await waitForStoredMarker(page, 'Секрет первой кампании');

    await selectSettingsSection(workspace, 'Игры проекта');
    await workspace.getByRole('button', { name: 'Новая', exact: true }).click();
    await expect(workspace.getByText('Новая игра создана.')).toBeVisible();
    await selectSettingsSection(workspace, 'Игра');
    await workspace.getByLabel('Название игры').fill('Вторая кампания');
    await selectWorkspaceTab(workspace, 'Заметки');
    await workspace.getByLabel('Заметки кампании').fill('Секрет второй кампании');
    await waitForStoredMarker(page, 'Секрет второй кампании');

    await selectSettingsSection(workspace, 'Игры проекта');
    const firstGame = workspace.locator('.player-tools-game-row').filter({ hasText: 'Первая кампания' });
    const secondGame = workspace.locator('.player-tools-game-row').filter({ hasText: 'Вторая кампания' });
    await expect(firstGame).toBeVisible();
    await expect(secondGame).toContainText('Текущая');
    await firstGame.getByRole('button', { name: 'Открыть' }).click();
    await expect(workspace.getByText('Игра открыта.')).toBeVisible();

    await selectSettingsSection(workspace, 'Игра');
    await expect(workspace.getByLabel('Название игры')).toHaveValue('Первая кампания');
    await selectWorkspaceTab(workspace, 'Заметки');
    await expect(workspace.getByLabel('Заметки кампании')).toHaveValue('Секрет первой кампании');

    await selectSettingsSection(workspace, 'Игры проекта');
    await secondGame.getByRole('button', { name: 'Удалить игру Вторая кампания' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить игру «Вторая кампания»?' });
    await confirmation.getByRole('button', { name: 'Удалить' }).click();
    await expect(workspace.getByText('Игра удалена.')).toBeVisible();
    await expect(workspace.locator('.player-tools-game-row').filter({ hasText: 'Вторая кампания' })).toHaveCount(0);
  });

  test('creates, restores, uses and deletes a homebrew adversary', async ({ page }) => {
    await openGmGame(page);
    const workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Справочник');
    const collections = workspace.getByLabel('Коллекции справочника');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await expect.poll(() => workspace.locator('.player-library-card').count()).toBeGreaterThan(0);
    await workspace.getByRole('button', { name: 'Создать' }).click();

    const customEditor = workspace.locator('.player-custom-compendium-section');
    await customEditor.getByLabel('Кратко').fill('Идёт на звон разбитых обещаний.');
    await customEditor.getByLabel('Сложность').fill('15');
    await customEditor.getByLabel('Название').fill('Стеклянный паломник');
    await expect(customEditor.getByLabel('Название')).toHaveValue('Стеклянный паломник');
    await expect(customEditor.getByLabel('Кратко')).toHaveValue('Идёт на звон разбитых обещаний.');
    await customEditor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(customEditor.getByText('Противник сохранен.')).toBeVisible();
    await waitForStoredCustomAdversary(page, 'Стеклянный паломник', true);
    await expect(customEditor.getByRole('button', { name: 'В бой' })).toBeVisible();
    await customEditor.getByRole('button', { name: 'В бой' }).click();
    await expect(customEditor.getByText('Противник добавлен в бой.')).toBeVisible();
    await selectWorkspaceTab(workspace, 'Бой');
    await expect(workspace.getByLabel('Состав боя').locator('.player-combat-entry').filter({ hasText: 'Стеклянный паломник' })).toHaveCount(1);

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Справочник');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Стеклянный паломник');
    const result = workspace.locator('.player-library-card').filter({ hasText: 'Стеклянный паломник' });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('Идёт на звон разбитых обещаний.');
    await result.click();
    const detail = workspace.getByLabel('Полная запись компендиума');
    await expect(detail).toContainText('Сложность: 15');
    await detail.getByRole('button', { name: 'Редактировать' }).click();
    const restoredEditor = workspace.locator('.player-custom-compendium-section');
    await expect(restoredEditor.getByLabel('Название')).toHaveValue('Стеклянный паломник');
    await restoredEditor.getByRole('button', { name: 'Удалить запись' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить противника «Стеклянный паломник»?' });
    await confirmation.getByRole('button', { name: 'Удалить' }).click();
    await expect(restoredEditor.getByText('Противник удален.')).toBeVisible();
    await waitForStoredCustomAdversary(page, 'Стеклянный паломник', false);
    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Справочник');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Стеклянный паломник');
    await expect(workspace.locator('.player-library-card').filter({ hasText: 'Стеклянный паломник' })).toHaveCount(0);
  });
});
