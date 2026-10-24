import { expect, test } from '@playwright/test';
import { installDeterministicP2PTransport } from './game-route-helpers';

test('material select persists all three modes and keeps reference source filters independent', async ({ page }) => {
  await installDeterministicP2PTransport(page);
  await page.goto('/#/library/settings/game');
  const workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
  const select = workspace.getByRole('combobox', { name: 'Доступные материалы', exact: false });
  await expect(select).toHaveValue('all');
  await expect(workspace.getByText('The Void — тестовые материалы.', { exact: true })).toBeVisible();
  for (const [mode, count] of [['core', 9], ['hope-and-fear', 13], ['all', 13]] as const) {
    await select.selectOption(mode);
    await expect(select).toHaveValue(mode);
    // IndexedDB persistence is asynchronous; reload after the actual save completes.
    await expect.poll(() => page.evaluate(async expectedMode => {
      const stored = await new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('daggerheart-play-game');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('documents', 'readonly');
          const read = tx.objectStore('documents').get('current-game');
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
          tx.oncomplete = () => db.close();
        };
      });
      return JSON.stringify(stored ?? null).includes(`"contentAccess":"${expectedMode}"`);
    }, mode)).toBe(true);
    await page.reload();
    await expect(select).toHaveValue(mode);
    await page.goto('/#/library/characters');
    await workspace.getByRole('button', { name: /Создать героя/ }).first().click();
    const builder = page.getByRole('dialog', { name: 'Новый герой' });
    const choices = builder.getByRole('group', { name: 'Шаг: Класс' });
    await expect(choices.getByRole('button')).toHaveCount(count);
    await expect(choices.getByRole('button', { name: /Ведьма/ })).toHaveCount(mode === 'core' ? 0 : 1);
    await builder.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.goto('/#/library/compendium/classes');
    await workspace.getByRole('group', { name: 'Источник материалов' }).getByRole('button', { name: 'Hope & Fear', exact: true }).click();
    await expect(workspace.locator('.player-library-card')).toHaveCount(4);
    await page.goto('/#/library/settings/game');
    await expect(select).toHaveValue(mode);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: test.info().outputPath('material-select-mobile.png'), animations: 'disabled' });
});
