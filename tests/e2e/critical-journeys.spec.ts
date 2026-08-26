import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

async function openWorkspace(page: Page): Promise<Locator> {
  const workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
  await openGameLibrary(page);
  await expect(workspace).toBeVisible();
  return workspace;
}

async function selectWorkspaceTab(workspace: Locator, name: string): Promise<void> {
  const tab = workspace.getByLabel('Разделы библиотеки').getByRole('button', { name, exact: true });
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
    return JSON.stringify(project ?? null).includes(marker) === present;
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

async function storedCustomAdversarySlug(page: Page, name: string): Promise<string> {
  let slug = '';
  await expect.poll(async () => {
    slug = await page.evaluate(async (expectedName) => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open('daggerheart-play-custom-content');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('documents', 'readonly');
        const read = transaction.objectStore('documents').get('local');
        read.onerror = () => reject(read.error);
        read.onsuccess = () => resolve(read.result?.adversaries?.find((entry: { name?: string }) => entry.name === expectedName)?.slug ?? '');
        transaction.oncomplete = () => db.close();
      };
    }), name);
    return slug;
  }).not.toBe('');
  return slug;
}

async function waitForStoredPreparedAdversary(page: Page, name: string): Promise<void> {
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
    const encounter = project?.games?.[project?.activeGameId]?.state?.encounter;
    return Object.values(encounter?.adversaries ?? {}).some((entry: any) => entry.name === expectedName);
  }, name)).toBe(true);
}

test.describe('critical persisted journeys', () => {
  test.describe.configure({ timeout: 120_000 });

  test('opens a structured editor for every editable compendium collection', async ({ page }) => {
    await openGmGame(page);
    const workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Справочник');
    const collections = workspace.getByLabel('Коллекции справочника');
    const cases = [
      ['Классы', 'Уклонение'],
      ['Подклассы', 'Характеристика заклинателя'],
      ['Родословные', 'Краткое описание'],
      ['Сообщества', 'Краткое описание'],
      ['Домены', 'Уровень'],
      ['Снаряжение', 'Тип'],
      ['Противники', 'Роль'],
      ['Окружения', 'Импульсы'],
      ['Звероформы', 'Атака через']
    ] as const;

    for (const [collection, field] of cases) {
      await collections.getByRole('button', { name: collection, exact: true }).click();
      await workspace.getByRole('button', { name: 'Создать', exact: true }).click();
      const editor = workspace.locator('.player-compendium-editor');
      await expect(editor.getByLabel('Название', { exact: true })).toBeVisible();
      await expect(editor.getByText(field, { exact: true }).first()).toBeVisible();
      await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
      await expect(editor).toHaveCount(0);
    }

    await collections.getByRole('button', { name: 'Правила', exact: true }).click();
    await expect(workspace.getByRole('button', { name: 'Создать', exact: true })).toHaveCount(0);
  });

  test('keeps a dirty compendium draft when collection change is cancelled', async ({ page }) => {
    await openGmGame(page);
    const workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Справочник');
    const collections = workspace.getByLabel('Коллекции справочника');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await workspace.getByRole('button', { name: 'Создать', exact: true }).click();
    const editor = workspace.locator('.player-compendium-editor');
    await editor.getByLabel('Название', { exact: true }).fill('Несохранённый противник');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Отменить несохранённые изменения?');
      await dialog.dismiss();
    });
    await collections.getByRole('button', { name: 'Классы', exact: true }).click();

    await expect(editor.getByLabel('Название', { exact: true })).toHaveValue('Несохранённый противник');
    await expect(collections.getByRole('button', { name: 'Противники', exact: true })).toHaveAttribute('aria-pressed', 'true');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Отменить несохранённые изменения?');
      await dialog.dismiss();
    });
    const acceptedUrl = page.url();
    await page.goBack();
    await expect(editor.getByLabel('Название', { exact: true })).toHaveValue('Несохранённый противник');
    await expect(collections.getByRole('button', { name: 'Противники', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.url()).toBe(acceptedUrl);
  });

  test('opens copy intents and normalizes official raw select values', async ({ page }) => {
    await openGmGame(page);
    const workspace = await openWorkspace(page);
    await selectWorkspaceTab(workspace, 'Справочник');
    const collections = workspace.getByLabel('Коллекции справочника');
    await collections.getByRole('button', { name: 'Снаряжение' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Наручные Руны');
    await workspace.locator('.player-library-card').filter({ hasText: 'Наручные Руны' }).first().click();
    await workspace.getByLabel('Полная запись компендиума').getByRole('button', { name: 'Создать копию' }).click();

    const editor = workspace.locator('.player-compendium-editor');
    await expect(editor.getByLabel('Дистанция')).toHaveValue('very-close');
    await expect(editor.getByLabel('Тип урона')).toHaveValue('magic');

    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/?copy=red-ooze#/library/compendium/adversaries/red-ooze`);
    const routedWorkspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    const routedEditor = routedWorkspace.locator('.player-compendium-editor');
    await expect(routedEditor.getByLabel('Название', { exact: true }).first()).toHaveValue('Алая Слизь (копия)');
    await expect.poll(() => new URL(page.url()).searchParams.has('copy')).toBe(false);

    await routedEditor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(routedEditor.getByText('Материал сохранён.')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toMatch(/\/custom-/);
    await routedEditor.getByRole('button', { name: 'Закрыть редактор' }).click();
    await expect(routedEditor).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Библиотека игры' })).toBeVisible();
    await expect(page.locator('.player-compendium-editor')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('copy')).toBe(false);
  });

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
    await builder.getByRole('button', { name: 'Случайный герой' }).click();
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

  test('persists The Void setting and keeps no-image class choices readable', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openGmGame(page);
    let workspace = await openWorkspace(page);
    await selectSettingsSection(workspace, 'Игра');

    const voidSetting = workspace.getByRole('checkbox', { name: 'Использовать материалы The Void' });
    await expect(voidSetting).not.toBeChecked();
    await voidSetting.check();
    await waitForStoredMarker(page, '"includeVoidContent":true');

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectSettingsSection(workspace, 'Игра');
    await expect(voidSetting).toBeChecked();

    await selectWorkspaceTab(workspace, 'Персонажи');
    await workspace.getByRole('button', { name: 'Создать героя' }).click();
    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    const classStep = builder.getByRole('group', { name: 'Шаг: Класс' });
    const assassin = classStep.getByRole('button', { name: /^Ассасин / });
    await expect(assassin).toBeVisible();
    await expect(classStep.getByRole('button', { name: /^Боец / })).toBeVisible();
    await expect(classStep.getByRole('button', { name: /^Ведьма / })).toBeVisible();
    await expect(classStep.getByRole('button', { name: /^Колдун / })).toBeVisible();

    await assassin.click();
    const classBody = assassin.locator('.cinematic-card-body');
    const detail = builder.getByLabel('Описание выбора');
    const detailCopy = detail.locator('.cinematic-builder-choice-detail-copy');
    await expect(assassin).toContainText('Клинок + Полночь');
    await expect(assassin.getByText('А', { exact: true })).toBeVisible();
    await expect(detail).toHaveClass(/dh-no-choice-image/);
    expect((await classBody.boundingBox())?.width ?? 0).toBeGreaterThan(120);
    expect(await detailCopy.evaluate((node) => node.clientHeight)).toBeGreaterThan(300);
    await expect(detail).toContainText('Метка Смерти');
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

    const customEditor = workspace.locator('.player-compendium-editor');
    await customEditor.getByLabel('Кратко').fill('Идёт на звон разбитых обещаний.');
    await customEditor.getByLabel('Сложность').fill('15');
    await customEditor.getByLabel('Название', { exact: true }).fill('Стеклянный паломник');
    await expect(customEditor.getByLabel('Название', { exact: true })).toHaveValue('Стеклянный паломник');
    await expect(customEditor.getByLabel('Кратко')).toHaveValue('Идёт на звон разбитых обещаний.');
    await customEditor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(customEditor.getByText('Материал сохранён.')).toBeVisible();
    await waitForStoredCustomAdversary(page, 'Стеклянный паломник', true);
    const customSlug = await storedCustomAdversarySlug(page, 'Стеклянный паломник');

    await workspace.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(customEditor.getByLabel('Название', { exact: true })).toHaveValue('');
    await customEditor.getByRole('button', { name: 'Отмена', exact: true }).click();

    await page.evaluate((slug) => { window.location.hash = `/library/compendium/adversaries/${slug}`; }, customSlug);
    const routedDetail = workspace.getByLabel('Полная запись компендиума');
    await expect(routedDetail.getByRole('heading', { name: 'Стеклянный паломник' })).toBeVisible();
    await expect(workspace.getByLabel('Источник материалов').getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
    await workspace.getByLabel('Источник материалов').getByRole('button', { name: 'Свои' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Стеклянный паломник');
    await workspace.locator('.player-library-card').filter({ hasText: 'Стеклянный паломник' }).click();
    const createdDetail = workspace.getByLabel('Полная запись компендиума');
    await createdDetail.getByRole('button', { name: 'Подготовить' }).click();
    await expect(createdDetail.getByRole('button', { name: 'Подготовлено' })).toBeDisabled();
    await waitForStoredPreparedAdversary(page, 'Стеклянный паломник');

    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Справочник');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await workspace.getByLabel('Источник материалов').getByRole('button', { name: 'Свои' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Стеклянный паломник');
    const result = workspace.locator('.player-library-card').filter({ hasText: 'Стеклянный паломник' });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('Идёт на звон разбитых обещаний.');
    await result.click();
    const detail = workspace.getByLabel('Полная запись компендиума');
    await expect(detail).toContainText('Сложность: 15');
    await detail.getByRole('button', { name: 'Редактировать' }).click();
    const restoredEditor = workspace.locator('.player-compendium-editor');
    await expect(restoredEditor.getByLabel('Название', { exact: true })).toHaveValue('Стеклянный паломник');
    await restoredEditor.getByRole('button', { name: 'Удалить материал' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Удалить «Стеклянный паломник»?' });
    await confirmation.getByRole('button', { name: 'Удалить' }).click();
    await expect(restoredEditor).toHaveCount(0);
    await waitForStoredCustomAdversary(page, 'Стеклянный паломник', false);
    await waitForStoredPreparedAdversary(page, 'Стеклянный паломник');
    await reloadGamePage(page);
    await expect(workspace).toBeVisible();
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();
    await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' }).click();
    await expect(page.getByRole('region', { name: 'Подготовлено' }).getByText('Стеклянный паломник')).toBeVisible();
    await openGameLibrary(page);
    await expect(workspace).toBeVisible();
    await selectWorkspaceTab(workspace, 'Справочник');
    await collections.getByRole('button', { name: 'Противники' }).click();
    await workspace.getByLabel('Источник материалов').getByRole('button', { name: 'Свои' }).click();
    await workspace.getByLabel('Поиск по справочнику').fill('Стеклянный паломник');
    await expect(workspace.locator('.player-library-card').filter({ hasText: 'Стеклянный паломник' })).toHaveCount(0);
  });
});
