import { test, expect, type Page } from '@playwright/test';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { readStoredGameState } from './persistence-helpers';
const id='e2e-character-cadsuane', name='QA29 — перераспределение';
const readBase=async(page:Page)=>(await readStoredGameState(page)).characters.entities[id].armor.baseMajor;
async function editorFor(page:Page){
 const library=await openGameLibrary(page);
 await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();
 await library.getByRole('navigation',{name:'Ростер персонажей'}).getByRole('button',{name,exact:true}).click();
 const editor=library.getByRole('region',{name:'Редактор персонажа',exact:true});
 await editor.getByLabel('Разделы листа персонажа').getByRole('button',{name:'Характеристики',exact:true}).click();return editor;
}
for(const mode of ['fast','held-lock','committed-control']) test(`Library armor threshold Done reload: ${mode}`,async({page,context},info)=>{
 await page.setViewportSize({width:1180,height:757});await openGmGame(page);
 const doc=createPopulatedGameDocument(),hero=doc.files['data/characters.json'].entities[id];hero.name=name;hero.level=1;hero.sheetCards=[];hero.domainCards=[];hero.ruleModifiers=[];
 hero.armor={...hero.armor,name:'Кожаная броня',equipped:true,baseMajor:6,baseSevere:13,score:2,feature:'',featureText:'',sourceSlug:'leather-armor'};hero.thresholds={major:7,severe:14};
 await importGameDocument(page,doc,'threshold-diagnostic.dhgame',name);
 const editor=await editorFor(page);await expect.poll(()=>readBase(page)).toBe(6);
 await editor.getByRole('button',{name:'Редактировать',exact:true}).click();
 await editor.locator('summary').filter({hasText:'Тонкая настройка брони и порогов'}).click();
 const base=editor.getByRole('spinbutton',{name:'База Ощутимого',exact:true});await expect(base).toHaveValue('6');
 let holder:Page|null=null;
 if(mode==='held-lock'){
  holder=await context.newPage();await holder.route('**/qa-lock-holder',r=>r.fulfill({contentType:'text/html',body:'ready'}));await holder.goto('/qa-lock-holder');
  await holder.evaluate(()=>{void navigator.locks.request('daggerheart-play:game-document',async()=>{document.body.textContent='held';await new Promise<void>(resolve=>{(window as any).release=resolve;});});});await expect(holder.locator('body')).toHaveText('held');
 }
 let warnings=0;page.on('dialog',async dialog=>{expect(dialog.type()).toBe('beforeunload');warnings++;await dialog.dismiss();});
 const moments:any[]=[];
 try{
  await base.fill('10');await base.press('Tab');
  await editor.getByRole('button',{name:'Готово',exact:true}).click();
  await expect(editor.locator('.character-editor-statline .inline-stat').filter({hasText:'Ощутимый'}).locator('strong')).toHaveText('11');
  if(mode==='committed-control')await expect.poll(()=>readBase(page)).toBe(10);
  moments.push({phase:'before reload',storedBase:await readBase(page)});
  await page.evaluate(()=>{(window as any).thresholdDoc='original';});
  await page.reload({timeout:1500}).catch(error=>{expect(String(error)).toMatch(/ERR_ABORTED|net::|Timeout 1500ms/);});
  const same=await page.evaluate(()=>(window as any).thresholdDoc==='original');
  moments.push({phase:'after reload attempt',warnings,sameDocument:same,storedBase:await readBase(page)});
  if(mode==='held-lock'){expect(warnings).toBe(1);expect(same).toBe(true);expect(await readBase(page)).toBe(6);}
  if(mode==='committed-control')expect(warnings).toBe(0);
  if(warnings)expect(same).toBe(true);
  await page.screenshot({path:info.outputPath(`${mode}-after-reload-attempt.png`)});
 }finally{if(holder){await holder.evaluate(()=>(window as any).release());await holder.close();}}
 await expect.poll(()=>readBase(page)).toBe(10);
 const beforeWarnings=warnings;await page.reload();expect(warnings).toBe(beforeWarnings);
 const reopened=await editorFor(page);await expect(reopened.locator('.character-editor-statline .inline-stat').filter({hasText:'Ощутимый'}).locator('strong')).toHaveText('11');
 moments.push({phase:'committed fresh reload',warnings,storedBase:await readBase(page)});
 await info.attach('threshold-moments',{body:JSON.stringify(moments,null,2),contentType:'application/json'});
 await page.screenshot({path:info.outputPath(`${mode}-committed-reload.png`)});
});
