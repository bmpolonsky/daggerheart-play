import { test, expect, type Locator } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { createExperience } from '../../src/domain/rules/factories';
const before=process.env.SCOPE_CAPTURE_BEFORE==='1';
for(const width of [1180,400]){
 test(`shared editor stat tiles at ${width}`,async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await openGmGame(page);await importGameDocument(page,createPopulatedGameDocument(),'scope-editor.dhgame');
  await page.locator('.player-roster__item').filter({hasText:filledCharacterName}).first().click();await page.setViewportSize({width,height:757});
  const layers=page.getByLabel('Слой интерфейса');if(await layers.isVisible())await layers.getByRole('button',{name:'Лист',exact:true}).click();
  await page.getByRole('button',{name:'Редактировать',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Редактор персонажа',exact:true});
  async function measure(target:Locator,entry:string){
   const rows=target.getByLabel('Ключевые параметры',{exact:true}).locator('.inline-stat');await expect(rows).toHaveCount(3);
   const metrics=await rows.evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return{display:s.display,padding:s.padding,background:s.backgroundColor,overflow:el.scrollWidth-el.clientWidth,text:el.textContent};}));
   await info.attach(entry+'-tiles',{body:JSON.stringify(metrics),contentType:'application/json'});await page.screenshot({path:info.outputPath(`${entry}-${before?'before':'after'}-${width}.png`)});
   if(!before)for(const m of metrics){expect(m.display).toBe('grid');expect(m.padding).toBe('8px');expect(m.background).not.toBe('rgba(0, 0, 0, 0)');expect(m.overflow).toBeLessThanOrEqual(1);}
  }
  await measure(dialog,'standalone');await dialog.getByRole('button',{name:'Закрыть редактор персонажа'}).click();
  const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();await library.getByRole('navigation',{name:'Ростер персонажей'}).getByRole('button',{name:filledCharacterName,exact:true}).click();await measure(library,'library');
 });
 test(`long experience label and full bonus at ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:757});await openGmGame(page);const doc=createPopulatedGameDocument();const hero=doc.files['data/characters.json'].entities['e2e-character-cadsuane'];hero.hope.value=1;hero.experiences=[createExperience('Длинный опыт для проверки переносов и читаемости',2),createExperience('Верный товарищ',2)];await importGameDocument(page,doc,'long-experience.dhgame');
  const layers=page.getByLabel('Слой интерфейса');if(await layers.isVisible())await layers.getByRole('button',{name:'Сцена',exact:true}).click();
  await page.getByRole('button',{name:'Открыть панель костей',exact:true}).click();const tray=page.getByRole('region',{name:'Подготовка броска',exact:true});await tray.getByRole('combobox',{name:'Исполнитель броска',exact:true}).selectOption('character:e2e-character-cadsuane');await tray.getByRole('button',{name:'Опыт',exact:true}).click();
  async function check(state:string){
   const metrics=await tray.locator('.unified-roll-experiences > .dh-checkbox').evaluateAll(rows=>rows.map(el=>{const spans=el.querySelectorAll('span');const label=spans[0]!,meta=spans[1]!,box=spans[2]!;const r=el.getBoundingClientRect(),m=meta.getBoundingClientRect(),b=box.getBoundingClientRect();return{height:r.height,overflow:el.scrollWidth-el.clientWidth,labelWhite:getComputedStyle(label).whiteSpace,labelHeight:label.getBoundingClientRect().height,meta:meta.textContent,metaWidth:m.width,metaRight:m.right,rowRight:r.right,boxLeft:b.left,rowLeft:r.left};}));
   await info.attach(state+'-metrics',{body:JSON.stringify(metrics),contentType:'application/json'});await page.screenshot({path:info.outputPath(`experience-${state}-${before?'before':'after'}-${width}.png`)});
   if(!before){expect(await tray.locator('.unified-roll-composer__body').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);for(const m of metrics){expect(m.height).toBeGreaterThanOrEqual(width<600?40:32);expect(m.overflow).toBeLessThanOrEqual(1);expect(m.labelWhite).toBe('normal');expect(m.meta).toBe('+2');expect(m.metaWidth).toBeGreaterThan(10);expect(m.metaRight).toBeLessThanOrEqual(m.rowRight+1);expect(m.boxLeft).toBeGreaterThanOrEqual(m.rowLeft-1);}}
  }
  await check('unselected');if(before)return;
  await tray.getByRole('checkbox',{name:'Длинный опыт для проверки переносов и читаемости +2',exact:true}).check();await tray.getByRole('checkbox',{name:'Верный товарищ +2',exact:true}).check();await expect(tray.getByRole('button',{name:'Бросить',exact:true})).toBeDisabled();await expect(tray).toContainText('Надежды');await check('selected-insufficient');await tray.getByRole('checkbox',{name:'Верный товарищ +2',exact:true}).uncheck();await expect(tray.getByRole('button',{name:'Бросить',exact:true})).toBeEnabled();await check('one-selected');
 });
}
