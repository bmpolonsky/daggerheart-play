import {expect,test} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createPopulatedGameDocument,filledCharacterName,importGameDocument} from './filled-game-helpers';
import {openGmGame} from './game-route-helpers';
import {openGameLibrary} from './tools-helpers';
const before=process.env.RESOURCE_SPACING_BEFORE==='1';const out='/home/codex/outputs/dh-resource-spacing-20261028';
for(const mode of ['sheet','library'])for(const width of [1180,500])test(`resource groups ${mode} ${width}`,async({page})=>{
 mkdirSync(out,{recursive:true});await page.setViewportSize({width:1440,height:900});await openGmGame(page);
 const doc=createPopulatedGameDocument(),hero=doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
 hero.sheetCards=[];hero.domainCards=[];hero.hp={max:12,marked:1};hero.stress={max:12,marked:2};hero.armor={...hero.armor,score:12,markedSlots:1,feature:'',featureText:''};
 await importGameDocument(page,doc,'resource-spacing.dhgame');let editor;
 if(mode==='sheet'){
  await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({hasText:filledCharacterName}).first().click();await page.getByRole('button',{name:'Редактировать',exact:true}).click();
  editor=page.getByRole('dialog',{name:'Редактор персонажа',exact:true});
 }else{
  const lib=await openGameLibrary(page);await lib.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();
  await lib.getByRole('navigation',{name:'Ростер персонажей',exact:true}).getByRole('button',{name:filledCharacterName,exact:true}).click();editor=lib.getByRole('region',{name:'Редактор персонажа',exact:true});
 }
 await page.setViewportSize({width,height:757});await editor.locator('.resource-grid').scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/${before?'before':'after'}-${mode}-${width}.png`});
 const metrics=await editor.locator('.resource-grid > .resource-pips').evaluateAll(groups=>groups.map(el=>{
  const t=el.querySelector('.resource-title')!.getBoundingClientRect(),p=el.querySelector('.pips')!.getBoundingClientRect(),r=el.getBoundingClientRect();
  return{label:el.querySelector('.resource-title span')!.textContent,value:el.querySelector('.resource-title strong')!.textContent,top:t.top,bottom:r.bottom,left:r.left,right:r.right,innerGap:p.top-t.bottom};
 }));writeFileSync(`${out}/${before?'before':'after'}-${mode}-${width}.json`,JSON.stringify(metrics,null,2));
 if(before)return;
 expect(metrics).toHaveLength(4);expect(metrics.map(x=>x.value)).toEqual(['2/6','1/12','2/12','1/12']);
 for(const group of metrics){expect(group.innerGap).toBeGreaterThanOrEqual(6);for(const prev of metrics){
  if(prev.bottom<=group.top && Math.min(prev.right,group.right)-Math.max(prev.left,group.left)>50)expect(group.top-prev.bottom).toBeGreaterThanOrEqual(15);
 }}
 await editor.getByRole('group',{name:'Отмеченный Стресс',exact:true}).getByRole('button',{name:'Отмеченный Стресс 4 из 12',exact:true}).click();
 await expect(editor.getByRole('group',{name:'Отмеченный Стресс',exact:true}).locator('..').locator('.resource-title strong')).toHaveText('4/12');
 expect(await editor.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});
