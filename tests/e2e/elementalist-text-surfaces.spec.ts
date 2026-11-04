import { readFileSync } from 'node:fs';
import { test, expect, type Locator } from '@playwright/test';
import { cleanMarkdownText } from '../../src/core/utils/markdownText';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const before=process.env.ELEMENTAL_SURFACES_BEFORE==='1',name='QA Чародей — Стихийное начало';
const raw=JSON.parse(readFileSync(new URL('../../public/data/subclasses.json',import.meta.url),'utf8')).data.find((x:any)=>x.slug==='elemental-origin');
const source=raw.foundation_features.find((x:any)=>x.id===195);
const feature={id:'sheet-subclass-elemental-origin-195',sourceId:'subclass:elemental-origin',featureId:195,collection:'subclass',slug:'elemental-origin',name:source.name,text:cleanMarkdownText(source.main_body,{stripEmphasis:true,stripCodeTicks:true}),sourceLabel:'Подкласс'};
async function content(target:Locator){const text=await target.innerText();expect(text).toContain('Воздух');expect(text).toContain('Вода');if(!before){expect(text).not.toMatch(/<\/?p(?:\s|>)|&lt;\/?p(?:\s|&gt;)/i);expect(text).not.toMatch(/(^|\n)\s*\*\*\s*(\n|$)/);}return text;}
for(const width of [1180,400]){
 test(`scene Elementalist button opens clean floating preview at ${width}`,async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await openGmGame(page);const doc=createPopulatedGameDocument();const hero=doc.files['data/characters.json'].entities['e2e-character-cadsuane'];hero.name=name;hero.className='Sorcerer';hero.classDisplayName='Чародей';hero.classSlug='sorcerer';hero.classSourceId='class:sorcerer';hero.subclassName='Стихийное начало';hero.spellcastTrait='instinct';hero.sheetCards=[{...feature,kind:'subclassFeature'}];hero.domainCards=[];
  await importGameDocument(page,doc,'elementalist-surfaces.dhgame',name);await page.locator('.player-roster__item').filter({hasText:name}).first().click();await page.setViewportSize({width,height:757});const layers=page.getByLabel('Слой интерфейса');if(await layers.isVisible())await layers.getByRole('button',{name:'Лист',exact:true}).click();const sheet=page.getByLabel('Персонаж игрока',{exact:true});await sheet.getByRole('button',{name:'Элементалист',exact:true}).click();const preview=page.getByRole(width < 700 ? 'dialog' : 'complementary',{name:'Предпросмотр',exact:true});await expect(preview).toBeVisible();await expect(preview.getByRole('button',{name:'потратить Надежду',exact:true})).toBeVisible();const text=await content(preview);expect(text).toContain('+2');expect(text).toContain('+3');if(before)expect(text).toContain('<p class="card-centered">');await info.attach('actual-entry',{body:JSON.stringify(await page.locator('script[type="module"][src]').first().getAttribute('src')),contentType:'application/json'});await page.screenshot({path:info.outputPath(`scene-preview-${before?'before':'after'}-${width}.png`)});await preview.getByRole('button',{name:'Закрыть предпросмотр',exact:true}).click();
  if(await layers.isVisible())await layers.getByRole('button',{name:/^Чат/}).click();else{const open=page.getByRole('button',{name:/^Открыть чат/});if(await open.isVisible())await open.click();}
  
  const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();await library.getByRole('navigation',{name:'Ростер персонажей'}).getByRole('button',{name,exact:true}).click();const editor=library.getByRole('region',{name:'Редактор персонажа',exact:true});await editor.getByLabel('Разделы листа персонажа').getByRole('button',{name:'Свойства',exact:true}).click();await content(editor.getByRole('region',{name:'Свойства персонажа',exact:true}));await page.screenshot({path:info.outputPath(`editor-rules-${before?'before':'after'}-${width}.png`)});
 });
 test(`Elementalist wizard and local compendium-share text at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:757});await openGmGame(page);const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();await library.getByRole('button',{name:'Создать героя',exact:true}).click();const builder=page.getByRole('dialog',{name:'Новый герой',exact:true});const close=builder.getByRole('button',{name:'Закрыть описание',exact:true});if(await close.isVisible())await close.click();await builder.getByRole('group',{name:'Шаг: Класс',exact:true}).getByRole('button',{name:/^Чародей/}).click();if(await close.isVisible())await close.click();await builder.getByRole('button',{name:'Подкласс',exact:true}).click();if(await close.isVisible())await close.click();await builder.getByRole('group',{name:'Шаг: Подкласс',exact:true}).getByRole('button',{name:/^Стихийное начало/}).click();const description=builder.getByLabel('Описание выбора',{exact:true});await content(description);await page.screenshot({path:info.outputPath(`builder-description-${before?'before':'after'}-${width}.png`)});await builder.getByRole('button',{name:'Закрыть',exact:true}).click();
  await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Справочник',exact:true}).click();await library.getByLabel('Коллекции справочника').getByRole('button',{name:'Подклассы',exact:true}).click();await library.getByLabel('Поиск по справочнику').fill('Стихийное начало');const detail=library.getByLabel('Полная запись компендиума');await expect(detail.getByRole('heading',{name:'Стихийное начало',exact:true})).toBeVisible();await content(detail);
  // This is a disconnected synthetic local game; no real players/room joined.
  await detail.getByRole('button',{name:'Показать игрокам',exact:true}).click();await library.getByRole('button',{name:'Закрыть библиотеку',exact:true}).click();const layers=page.getByLabel('Слой интерфейса');if(await layers.isVisible())await layers.getByRole('button',{name:/^Чат/}).click();else{const open=page.getByRole('button',{name:/^Открыть чат/});if(await open.isVisible())await open.click();}
  const system=page.locator('.player-activity-event').filter({hasText:'Стихийное начало'}).last();await content(system);if(!before)expect(await system.innerText()).not.toMatch(/(^|\s)#{1,6}(?=\s)/);await page.screenshot({path:info.outputPath(`compendium-share-${before?'before':'after'}-${width}.png`)});
 });
}

for (const width of [1180, 400]) test(`saved compendium system message displays cleanly at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 757 }); await openGmGame(page);
  const doc = createPopulatedGameDocument();
  doc.files['data/feed.json'] = [{ id: 'qa-old-system', type: 'system', createdAt: new Date().toISOString(), visibility: 'public', publication: 'public', authorName: 'Система', title: 'QA — прежний показ справочника', body: '### Элементалист\n<p class="card-centered">Воздух · Земля · Огонь · Молния · Вода</p>\nПолучите **+2** к действию либо **+3** к урону.' }];
  await importGameDocument(page, doc, 'saved-compendium-message.dhgame');
  const layers = page.getByLabel('Слой интерфейса');
  if (await layers.isVisible()) await layers.getByRole('button', { name: /^Чат/ }).click();
  else { const open = page.getByRole('button', { name: /^Открыть чат/ }); if (await open.isVisible()) await open.click(); }
  const message = page.locator('.player-activity-event').filter({ hasText: 'QA — прежний показ справочника' });
  await content(message);
  if (!before) expect(await message.innerText()).not.toContain('###');
  await page.screenshot({ path: info.outputPath(`saved-system-${before ? 'before' : 'after'}-${width}.png`) });
});
