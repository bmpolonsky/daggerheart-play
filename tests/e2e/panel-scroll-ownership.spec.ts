import { expect, test, type Locator } from '@playwright/test';
import { filledCharacterName, openFilledGmGame } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

async function verticalScrollOwners(panel: Locator) {
  return panel.evaluate((element) => [element, ...element.querySelectorAll<HTMLElement>('*')]
    .filter((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && candidate.clientHeight > 0
        && /^(auto|scroll)$/.test(getComputedStyle(candidate).overflowY)
        && candidate.scrollHeight > candidate.clientHeight + 2;
    })
    .map((candidate) => ({
      className: candidate.className,
      label: candidate.getAttribute('aria-label'),
      clientHeight: candidate.clientHeight,
      scrollHeight: candidate.scrollHeight
    })));
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`sheet and character editor keep one vertical scroll owner at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFilledGmGame(page);
    await page.setViewportSize(viewport);
    if (viewport.width < 921) await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист', exact: true }).click();
    await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({ hasText: filledCharacterName }).first().click({ position: { x: 18, y: 28 } });
    const sheet = page.getByLabel('Персонаж игрока');
    await expect(sheet).toBeVisible();
    await page.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Карты', exact: true }).click();
    const sheetOwners = await verticalScrollOwners(sheet);
    expect(sheetOwners, JSON.stringify(sheetOwners)).toHaveLength(1);
    expect(sheetOwners[0].label).toBe('Персонаж игрока');

    const workspace = await openGameLibrary(page);
    await workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await workspace.getByLabel('Ростер персонажей').getByRole('button', { name: new RegExp(filledCharacterName) }).first().click();
    const editor = workspace.getByLabel('Редактор персонажа');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button', { name: 'Снаряжение', exact: true }).click();
    const owners = await verticalScrollOwners(workspace.getByLabel('Содержимое библиотеки'));
    // Multiple side-by-side panels may each own a scrollport. The character
    // editor itself must own exactly one, with no overflowing modal ancestor.
    expect(owners.filter((owner) => owner.label === 'Содержимое библиотеки'), JSON.stringify(owners)).toHaveLength(0);
    const editorOwners = await verticalScrollOwners(editor);
    expect(editorOwners, JSON.stringify(editorOwners)).toHaveLength(1);
    expect(editorOwners[0].label).toBe('Редактор персонажа');
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
  });
}
