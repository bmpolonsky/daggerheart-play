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

    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    let editor = page.getByRole('dialog', { name: `Редактор шаблона ${title}` });
    await expect(editor.getByLabel('Карточка подготовленного противника')).toBeVisible();
    await expect(editor.getByLabel('Заметки мастера')).toHaveCount(0);
    await editor.getByLabel('Сложность', { exact: true }).fill('17');
    await editor.getByLabel('Название атаки').fill('Проверочный удар');
    const properties = editor.locator('.player-compendium-editor__section').filter({ hasText: 'Свойства' });
    await properties.getByRole('button', { name: 'Добавить' }).click();
    await editor.getByLabel(/Название свойства/).last().fill('Проверочное свойство');
    await editor.getByRole('button', { name: 'Сохранить' }).click();
    await expect(editor).toHaveCount(0);

    await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
    editor = page.getByRole('dialog', { name: `Редактор шаблона ${title}` });
    await expect(editor.getByLabel('Сложность', { exact: true })).toHaveValue('17');
    await expect(editor.getByLabel('Название атаки')).toHaveValue('Проверочный удар');
    await expect(editor.getByLabel(/Название свойства/).last()).toHaveValue('Проверочное свойство');
    await editor.getByRole('button', { name: 'Отмена' }).click();

    await page.getByLabel('Контекст мастера').getByRole('button', { name: 'Подготовлено' }).click();
    await prepared.getByRole('button', { name: 'Создать героя' }).click();
    await expect(page.getByRole('dialog', { name: 'Новый герой' })).toBeVisible();
  });

  test('keeps handouts in Prepared, previews them, and opens the routed editor explicitly', async ({ page }) => {
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
    await expect(row).not.toContainText('Секретная тропа');
    await expect(row).not.toContainText('Черновик');

    const search = prepared.getByRole('searchbox', { name: 'Поиск подготовленных ресурсов' });
    await search.fill('старого маяка');
    await expect(row).toBeVisible();
    await search.fill('неизвестная улика');
    await expect(row).toHaveCount(0);
    await search.fill('');

    await row.getByRole('button', { name: 'Письмо из тумана', exact: true }).click();
    const preview = page.getByRole('complementary', { name: 'Предпросмотр', exact: true });
    await expect(preview).toContainText('Письмо из тумана');
    await expect(preview).toContainText('Секретная тропа начинается у старого маяка.');
    await expect(preview.getByText('Раздатка', { exact: true })).toHaveCount(0);
    await expect(preview.getByText('Приватно', { exact: true })).toHaveCount(0);
    await expect(preview.getByRole('button', { name: 'Отправить в чат раздатку Письмо из тумана' })).toBeVisible();
    await expect(page.getByLabel('Чат игры').getByText('Письмо из тумана')).toHaveCount(0);
    await preview.getByRole('button', { name: 'Действия: Письмо из тумана' }).click();
    await page.getByRole('menu', { name: 'Действия: Письмо из тумана' }).getByRole('menuitem', { name: 'Редактировать' }).click();
    workspace = page.getByRole('dialog', { name: 'Библиотека игры' });
    editor = workspace.getByRole('region', { name: 'Редактор раздатки Письмо из тумана' });
    await expect(editor.getByLabel('Текст')).toHaveValue('Секретная тропа начинается у старого маяка.');
    await workspace.getByRole('button', { name: 'Закрыть библиотеку' }).click();
    await page.goBack();
    await expect(page.getByRole('region', { name: 'Редактор раздатки Письмо из тумана' })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('dialog', { name: 'Библиотека игры' })).toHaveCount(0);

    await row.getByRole('button', { name: 'Письмо из тумана', exact: true }).click();
    await preview.getByRole('button', { name: 'Показать на столе' }).click();
    await expect(row).toContainText('На столе');
    await preview.getByRole('button', { name: 'Убрать со стола' }).click();
    await expect(row).not.toContainText('На столе');

    await context.getByRole('button', { name: 'Музыка' }).click();
    await expect(page.getByRole('region', { name: 'Музыка сцены' })).toBeVisible();
    await expect(page.getByLabel('Инструменты сцены').getByText('Письмо из тумана')).toHaveCount(0);
  });
});
