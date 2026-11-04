import { expect, test } from '@playwright/test';
import { createWeapon } from '../../src/domain/rules/factories';
import { openGmGame } from './game-route-helpers';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGameLibrary } from './tools-helpers';

const before = process.env.COSMETIC_BEFORE === '1';
const property = 'Громоздкое: −1 к **Искусности**. QA: личная гравировка 29 октября';
for (const width of [525, 1180]) {
  test(`level-up review separates labels from values at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 757 }); await openGmGame(page);
    await importGameDocument(page, createPopulatedGameDocument(), 'cosmetic-level-review.dhgame');
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name: 'Персонажи', exact: true }).click();
    await library.getByLabel('Ростер персонажей').getByRole('button', { name: filledCharacterName, exact: true }).click();
    await library.getByLabel('Редактор персонажа').getByRole('button', { name: 'Новый уровень', exact: true }).click();
    const wizard = page.getByRole('dialog', { name: 'Повышение уровня', exact: true });
    await wizard.getByRole('button', { name: 'Добавить: Добавить ячейку Ран', exact: true }).click();
    await wizard.getByRole('button', { name: 'Добавить: Добавить ячейку Стресса', exact: true }).click();
    await wizard.getByRole('button', { name: 'Дальше', exact: true }).click();
    await wizard.getByLabel('Новый Опыт (+2)').fill('QA гравировка');
    await wizard.getByRole('button', { name: 'Дальше', exact: true }).click();
    await wizard.getByRole('button', { name: 'Обязательная карта домена', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Выбор: Обязательная карта домена', exact: true });
    await picker.getByRole('option').first().click(); await picker.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await wizard.getByRole('button', { name: 'Дальше', exact: true }).click();
    const review = wizard.getByRole('group', { name: 'Шаг: Проверка', exact: true });
    await expect(wizard.getByRole('button', { name: 'Применить повышение', exact: true })).toBeEnabled();
    if (!before) {
      for (const stat of await review.locator('.inline-stat').all()) {
        const gap = await stat.evaluate(element => { const a=element.querySelector('span')!.getBoundingClientRect(), b=element.querySelector('strong')!.getBoundingClientRect(); return b.left-a.right; });
        expect(gap).toBeGreaterThanOrEqual(5);
      }
      expect(await wizard.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`level-review-${width}.png`) });
  });
  test(`stowed weapon description is unique and readable at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 757 }); await openGmGame(page);
    const document = createPopulatedGameDocument();
    document.files['data/characters.json'].entities['e2e-character-cadsuane'].weapons = [createWeapon({ id:'qa-engraved', name:'QA Алебарда', featureText:property, notes:property, damageFormula:'1d8+3' })];
    await importGameDocument(page, document, 'cosmetic-weapon.dhgame');
    const library = await openGameLibrary(page);
    await library.getByLabel('Разделы библиотеки').getByRole('button', { name:'Персонажи',exact:true }).click();
    await library.getByLabel('Ростер персонажей').getByRole('button', {name:filledCharacterName,exact:true}).click();
    const editor=library.getByLabel('Редактор персонажа');
    await editor.getByRole('button',{name:'Редактировать',exact:true}).click();
    await editor.getByLabel('Разделы листа персонажа').getByRole('button',{name:'Снаряжение',exact:true}).click();
    await editor.getByRole('button',{name:'Снять оружие QA Алебарда',exact:true}).click();
    const item=editor.locator('.dh-list-item').filter({has:page.getByRole('button',{name:'Надеть оружие QA Алебарда',exact:true})});
    await item.scrollIntoViewIfNeeded();
    if(!before){ const text=await item.innerText();expect(text.match(/личная гравировка/g)).toHaveLength(1);expect(text).not.toContain('**'); }
    await page.screenshot({path:info.outputPath(`stowed-weapon-${width}.png`)});
    await item.getByRole('button',{name:'Надеть оружие QA Алебарда',exact:true}).click();
    await expect(editor.getByLabel('Свойство',{exact:true})).toHaveValue(property);
    await editor.getByRole('button',{name:'Снять оружие QA Алебарда',exact:true}).click();
    await editor.getByRole('button',{name:'Удалить предмет QA Алебарда',exact:true}).click();
    await expect(editor.getByRole('button',{name:'Надеть оружие QA Алебарда',exact:true})).toHaveCount(0);
  });
}
