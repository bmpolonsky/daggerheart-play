import { test, expect } from '@playwright/test';
for (const width of [1180, 400]) test(`notifications preserve dialog controls and keyboard at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 757 });
  await page.goto('/tests/fixtures/toast-controls.html');
  await page.getByRole('button', { name: 'Открыть окно', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Проверка уведомлений', exact: true });
  await dialog.getByRole('button', { name: 'Длинная ошибка' }).click();
  const error = dialog.getByRole('alert'); await expect(error).toContainText('Изменения не сохранены');
  const rail = dialog.locator('[data-dh-toast-host]');
  expect(await rail.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await dialog.getByRole('button', { name: 'Важное действие 0' }).click();
  await dialog.getByRole('button', { name: 'Сохранить 1' }).click();
  await page.screenshot({ path: info.outputPath(`long-error-${width}.png`) });
  await dialog.getByLabel('Уведомления', { exact: true }).focus();
  await page.keyboard.press('End');
  await expect.poll(() => rail.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'Закрыть уведомление' })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Вложенное окно', exact: true }).click();
  const nested = page.getByRole('dialog', { name: 'Вложенное', exact: true });
  await expect(nested.getByRole('alert')).toBeVisible();
  await nested.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(error).toBeVisible();
  const dismiss = dialog.getByRole('button', { name: 'Закрыть уведомление' });
  await dismiss.focus(); await page.keyboard.press('Enter'); await expect(error).toHaveCount(0);
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (const [name, role] of [['Успех','status'], ['Предупреждение','status'], ['Информация','status']] as const) {
    await dialog.getByRole('button', { name, exact: true }).click();
    await expect(dialog.getByRole(role)).toBeVisible();
    await dialog.getByRole('button', { name: 'Закрыть уведомление' }).click();
  }
  await dialog.getByRole('button', { name: 'Длинная ошибка' }).click();
  await dialog.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть окно', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});
