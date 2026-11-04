import { test, expect } from '@playwright/test';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
const before=process.env.ELEMENTAL_CAPTURE_BEFORE==='1';
for(const width of [1180,400])test(`Elemental Origin HTML-wrapped emphasis has no orphan markers at ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:757});await openGmGame(page);
 const entry=await page.locator('script[type="module"][src]').first().getAttribute('src');
 await info.attach('actual-entry',{body:JSON.stringify({entry,width,phase:before?'before8549c76':'after'}),contentType:'application/json'});
 if(before)expect(entry).toContain('index-YAMjZiR6.js');
 const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Справочник',exact:true}).click();await library.getByLabel('Коллекции справочника').getByRole('button',{name:'Подклассы',exact:true}).click();await library.getByLabel('Поиск по справочнику').fill('Стихийное начало');await expect(library.getByLabel('Полная запись компендиума').getByRole('heading',{name:'Стихийное начало',exact:true})).toBeVisible();
 const detail=library.getByLabel('Полная запись компендиума');const elements=detail.getByText('Воздух · Земля · Огонь · Молния · Вода',{exact:true});await expect(elements).toBeVisible();await elements.scrollIntoViewIfNeeded();
 const orphan=detail.locator('p').filter({hasText:/^\s*\*\*\s*$/});
 await page.screenshot({path:info.outputPath(`elemental-${before?'before':'after'}-${width}.png`)});
 if(before){await expect(orphan).toHaveCount(2);return;}
 await expect(orphan).toHaveCount(0);await expect(detail.locator('strong').filter({hasText:/^Воздух · Земля · Огонь · Молния · Вода$/})).toBeVisible();
 await expect(detail).toContainText('+2');await expect(detail).toContainText('+3');await expect(detail).toContainText('Элементалист');
});
