import { expect, test, type Page } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';

async function openAncestryLibrary(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGmGame(page);
  const workspace = await openGameLibrary(page);
  await workspace.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Справочник', exact: true }).click();
  await workspace.getByLabel('Коллекции справочника').getByRole('button', { name: 'Родословные', exact: true }).click();
  return workspace;
}

test('saving outside search and source filters keeps both filters and the saved entry focused', async ({ page }) => {
  const workspace = await openAncestryLibrary(page);
  const search = workspace.getByLabel('Поиск по справочнику');
  const coreFilter = workspace.getByLabel('Источник материалов').getByRole('button', { name: 'Основная книга', exact: true });
  await coreFilter.click();
  await search.fill('неподходящий-поиск-qa');
  await expect(workspace.locator('.player-library-card')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Создать', exact: true }).click();
  const editor = workspace.locator('.player-compendium-editor');
  await editor.getByLabel('Название', { exact: true }).fill('Сохранённая родословная QA');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(editor).toContainText('Материал сохранён.');
  await expect(search).toHaveValue('неподходящий-поиск-qa');
  await expect(coreFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByLabel('Название', { exact: true })).toHaveValue('Сохранённая родословная QA');
  await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(workspace.getByLabel('Полная запись компендиума').getByRole('heading', { name: 'Сохранённая родословная QA', exact: true })).toBeVisible();
  await expect(search).toHaveValue('неподходящий-поиск-qa');
  await expect(coreFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.player-library-card')).toHaveCount(0);
});

test('properties-only material gets readable preview and narrow HTML cleanup in its detail', async ({ page }) => {
  const workspace = await openAncestryLibrary(page);
  await workspace.getByRole('button', { name: 'Создать', exact: true }).click();
  const editor = workspace.locator('.player-compendium-editor');
  await editor.getByLabel('Название', { exact: true }).fill('Свойства без описания QA');
  await editor.getByRole('button', { name: 'Добавить', exact: true }).click();
  await editor.getByLabel('Название свойства 1', { exact: true }).fill('Стойкость');
  await editor.getByLabel('Текст свойства 1', { exact: true }).fill('<p>Раны &lt; 3 &amp; Стресс &ge; 2.</p><script>невидимый-маркер</script>');
  await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(editor).toContainText('Материал сохранён.');
  await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
  const card = workspace.locator('.player-library-card').filter({ hasText: 'Свойства без описания QA' });
  await expect(card).toContainText('Раны < 3 & Стресс ≥ 2.');
  await expect(card).not.toContainText('Без описания.');
  await expect(card).not.toContainText('невидимый-маркер');
  const detail = workspace.getByLabel('Полная запись компендиума');
  await expect(detail).toContainText('Раны < 3 & Стресс ≥ 2.');
  await expect(detail).not.toContainText('<p>');
  await expect(detail).not.toContainText('невидимый-маркер');
});
