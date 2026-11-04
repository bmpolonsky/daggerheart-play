import { expect, test } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';

for (const width of [525, 1180]) {
  test(`closing a saved single search result keeps the list and query at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1180, height: 757 });
    await openGmGame(page);
    const document = createPopulatedGameDocument();
    document.files['content/custom-equipment.json'] = [{
      id: 'qa-close-armor29', slug: 'qa-close-armor29', name: 'QA броня 29',
      type_slug: 'armor', source_slugs: ['custom'], tier: 1, armor_score: 2,
      base_thresholds: [4, 9],
      features: [{ name: 'Контрольное свойство', main_body: 'Исходная редакция.' }]
    }];
    await importGameDocument(page, document, 'qa-close-single-result.dhgame');
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Справочник', exact: true }).click();
    await library.getByLabel('Коллекции справочника').getByRole('button', { name: 'Снаряжение', exact: true }).click();
    await page.setViewportSize({ width, height: 757 });
    const search = library.getByLabel('Поиск по справочнику');
    await search.fill('QA броня');
    const detail = library.getByLabel('Полная запись компендиума');
    await expect(detail.getByRole('heading', { name: 'QA броня 29', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
    const editor = library.locator('.player-compendium-editor');
    const text = 'Контрольная редакция29, повторная проверка3066fef. Без числовых бонусов.';
    await editor.getByLabel('Текст свойства 1', { exact: true }).fill(text);
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(editor).toContainText('Материал сохранён.');
    await editor.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(detail).toContainText(text);
    await page.screenshot({ path: info.outputPath(`saved-detail-${width}.png`) });
    await detail.getByRole('button', { name: 'Закрыть описание', exact: true }).click();
    // A single immediate assertion can pass before an effect reopens the detail.
    const states = [];
    for (let index = 0; index < 5; index++) {
      await page.waitForTimeout(200);
      states.push({ detailCount: await detail.count(), searchVisible: await search.isVisible(), query: await search.inputValue() });
    }
    await page.screenshot({ path: info.outputPath(`after-close-${width}.png`) });
    await info.attach('close-stability', { body: JSON.stringify(states), contentType: 'application/json' });
    expect(states.every(state => state.detailCount === 0 && state.searchVisible && state.query === 'QA броня')).toBe(true);
    await expect(library.locator('.player-library-card')).toHaveCount(1);

    await library.locator('.player-library-card').click();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(text);
    await detail.getByRole('button', { name: 'Закрыть описание', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(detail).toHaveCount(0);
    await expect(search).toHaveValue('QA броня');

    const ownMaterials = library.getByLabel('Источник материалов').getByRole('button', { name: 'Свои', exact: true });
    await ownMaterials.click();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Закрыть описание', exact: true }).click();
    await page.waitForTimeout(500);
    await expect(detail).toHaveCount(0);
    await expect(ownMaterials).toHaveAttribute('aria-pressed', 'true');
    await expect(search).toHaveValue('QA броня');
    await search.fill('QA броня 29');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(text);
  });
}
