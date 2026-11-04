import { test, expect } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
test('packaged offline manifest and every referenced class/subclass art resolve locally',async({request},info)=>{
 const art=await (await request.get('/offline-artwork.json')).json();let bytes=0;
 for(const path of art.files){const response=await request.get('/'+path);expect(response.status(),path).toBe(200);bytes+=(await response.body()).length;}
 expect(bytes).toBe(art.bytes);
 const refs=new Set<string>();for(const type of ['classes','subclasses'])for(const item of (await (await request.get('/data/'+type+'.json')).json()).data)if(item.image_url)refs.add(item.image_url);
 for(const path of refs){const response=await request.get(path);expect(response.status(),path).toBe(200);expect(art.files).toContain(path.replace(/^\//,''));}
 await info.attach('asset-http-proof',{body:JSON.stringify({manifestFiles:art.files.length,bytes,classSubclassReferences:refs.size}),contentType:'application/json'});
});
for(const width of [1180,400])test(`wizard Druid and Seraph portraits and subclass art render at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:757});await openGmGame(page);const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();await library.getByRole('button',{name:'Создать героя',exact:true}).click();const builder=page.getByRole('dialog',{name:'Новый герой',exact:true});
 for(const name of ['Друид','Серафим']){
  await builder.getByRole('button',{name:'Класс',exact:true}).click();const priorDescription=builder.getByRole('button',{name:'Закрыть описание',exact:true});if(await priorDescription.isVisible())await priorDescription.click();await builder.getByRole('group',{name:'Шаг: Класс',exact:true}).getByRole('button',{name:new RegExp('^'+name)}).click();
  const close=builder.getByRole('button',{name:'Закрыть описание',exact:true});if(await close.isVisible())await close.click();
  await expect.poll(()=>builder.locator('.cinematic-builder-stage-art img').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await builder.getByRole('button',{name:'Подкласс',exact:true}).click();if(await close.isVisible())await close.click();const choices=builder.getByRole('group',{name:'Шаг: Подкласс',exact:true});await expect(choices.getByRole('button')).toHaveCount(2);
  for(const button of await choices.getByRole('button').all()){await button.scrollIntoViewIfNeeded();await expect.poll(()=>button.locator('img').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);}
  await builder.locator('.cinematic-builder-stage-art').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`wizard-art-${name}-${width}.png`)});
 }
});
