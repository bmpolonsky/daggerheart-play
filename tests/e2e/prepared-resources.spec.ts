import { expect, test } from '@playwright/test';
import { openFilledGmGame } from './filled-game-helpers';

test.describe('prepared resources', () => {
  test('prepares from the library, deduplicates, and creates independent scene instances in place', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openFilledGmGame(page);

    const context = page.getByLabel('Контекст мастера');
    await context.getByRole('button', { name: 'Подготовлено' }).click();
    await page.getByRole('region', { name: 'Подготовлено' }).getByRole('button', { name: 'Открыть справочник противников' }).click();
    const workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    const firstCard = workspace.locator('.player-library-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    const detail = workspace.locator('.player-library-detail');
    const title = (await detail.locator('h3').textContent())?.trim() ?? '';
    expect(title).not.toBe('');
    const prepare = detail.getByRole('button', { name: 'Подготовить', exact: true });
    await expect(prepare).toBeVisible();
    await prepare.click();
    await expect(detail.getByRole('button', { name: 'Подготовлено', exact: true })).toBeDisabled();
    await expect(workspace).toBeVisible();
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await expect(context.getByRole('button', { name: 'Подготовлено' })).toHaveAttribute('aria-pressed', 'true');
    const prepared = page.getByRole('region', { name: 'Подготовлено' });
    const row = prepared.locator('.dh-list-item').filter({ hasText: title }).first();
    await expect(row).toBeVisible();
    const add = row.getByRole('button', { name: `Добавить ${title} на сцену` });
    await add.click();
    await expect(row).toContainText('1');
    await add.click();
    await expect(row).toContainText('2');
    await row.getByRole('button', { name: `Убрать последнего ${title} со сцены` }).click();
    await expect(row).toContainText('1');
    await expect(prepared).toBeVisible();

    await row.getByRole('button', { name: title, exact: true }).click();
    const sheet = page.getByLabel('Противник мастера');
    await expect(sheet).toContainText('Подготовленный шаблон');
    await expect(sheet.getByRole('button', { name: /Атака/ })).toHaveCount(0);

    await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' }).click();
    await prepared.getByRole('button', { name: 'Создать героя' }).click();
    await expect(page.getByRole('dialog', { name: 'Новый герой' })).toBeVisible();
  });

  test('keeps handouts in Prepared and opens the existing routed editor', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await openFilledGmGame(page);

    const context = page.getByLabel('Контекст мастера');
    await context.getByRole('button', { name: 'Подготовлено' }).click();
    const prepared = page.getByRole('region', { name: 'Подготовлено' });
    const handouts = prepared.getByRole('heading', { name: 'Раздатки' }).locator('xpath=ancestor::section[contains(@class, "player-prepared__section")]');
    await expect(handouts.getByText('Пока ничего не подготовлено.')).toBeVisible();

    await handouts.getByRole('button', { name: 'Создать раздатку' }).click();
    let workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    let editor = workspace.locator('.player-tools-handout-editor');
    await expect(editor).toBeVisible();
    await editor.getByLabel('Название').fill('Письмо из тумана');
    await editor.getByLabel('Текст').fill('Секретная тропа начинается у старого маяка.');
    await expect(page).toHaveURL(/#\/library\/handouts\/handout/);
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();

    await expect(context.getByRole('button', { name: 'Подготовлено' })).toHaveAttribute('aria-pressed', 'true');
    const row = handouts.locator('.dh-list-item').filter({ hasText: 'Письмо из тумана' });
    await expect(row).toContainText('Черновик');

    const search = prepared.getByRole('searchbox', { name: 'Поиск подготовленных ресурсов' });
    await search.fill('старого маяка');
    await expect(row).toBeVisible();
    await search.fill('неизвестная улика');
    await expect(row).toHaveCount(0);
    await search.fill('');

    await row.getByRole('button', { name: 'Письмо из тумана', exact: true }).click();
    workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    editor = workspace.getByRole('region', { name: 'Редактор раздатки Письмо из тумана' });
    await expect(editor.getByLabel('Текст')).toHaveValue('Секретная тропа начинается у старого маяка.');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();
    await page.goBack();
    await expect(page.getByRole('region', { name: 'Редактор раздатки Письмо из тумана' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('dialog', { name: 'Библиотека игры' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Показать на столе: Письмо из тумана' }).click();
    await expect(row).toContainText('Сейчас показана');
    await row.getByRole('button', { name: 'Убрать со стола: Письмо из тумана' }).click();
    await expect(row).toContainText('Доступна игрокам');

    await context.getByRole('button', { name: 'Музыка' }).click();
    await expect(page.getByRole('region', { name: 'Музыка сцены' })).toBeVisible();
    await expect(page.getByLabel('Инструменты сцены').getByText('Письмо из тумана')).toHaveCount(0);
  });
});
