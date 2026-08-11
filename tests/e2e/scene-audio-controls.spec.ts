import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';

test('keeps idle scene audio controls compact and hides transport diagnostics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFilledGmGame(page);

  await page.getByLabel('Слой интерфейса').getByRole('button', { name: 'Лист' }).click();
  const panel = page.getByLabel('Инструменты сцены');
  await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Музыка' }).click();
  const music = panel.getByRole('region', { name: 'Музыка сцены' });
  const tabAudio = panel.getByRole('region', { name: 'Звук вкладки' });
  await expect(music).toBeVisible();
  await expect(tabAudio).toBeVisible();
  await expect(music).not.toContainText('Готов к запуску');
  await expect(tabAudio).not.toContainText('Отдельная трансляция');
  await expect(tabAudio).not.toContainText('Захват звука отменен.');
  await expect(panel.locator('.player-scene-audio__status')).toHaveCount(0);
});
