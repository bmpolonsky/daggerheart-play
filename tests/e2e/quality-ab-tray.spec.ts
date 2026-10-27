import { sharedQualityDocument, installQualityClickCounter, qualityClickCount, qualityViewRole } from './quality-ab-fixtures';
import { expect,test } from '@playwright/test';
test.beforeEach(async ({ page }) => { await installQualityClickCounter(page); });
import { mkdir,writeFile } from 'node:fs/promises';
import { createPopulatedGameDocument,importGameDocument,filledCharacterName } from './filled-game-helpers';
import { installDeterministicP2PTransport } from './game-route-helpers';
const root=(process.env.QUALITY_OUTPUT_DIR ?? 'test-results/quality-ab');
test('paired tray exploration: empty, add, advantage, actor and modifier',async({page,baseURL})=>{
 const label=process.env.QUALITY_LABEL??'v8'; const out=`${root}/${label}`;await mkdir(out,{recursive:true});
 await installDeterministicP2PTransport(page);await page.goto(`${baseURL}#/game`);await expect(page.locator('[data-vtt-root]')).toBeVisible();
 await importGameDocument(page,await sharedQualityDocument(createPopulatedGameDocument()),'paired-identical.dhgame');
 const rows:any[]=[];
 async function record(name:string){const tray=page.locator(label==='release'?'.mini-dice-launcher__panel':'.mini-dice-launcher__floating-panel');await tray.screenshot({path:`${out}/${name}.png`});rows.push({name,pointerClicks:await qualityClickCount(page), role:await qualityViewRole(page),text:await tray.innerText(),rect:await tray.boundingBox(),inputs:await tray.locator('input').evaluateAll(xs=>xs.map((x:any)=>({label:x.getAttribute('aria-label'),value:x.value}))),buttons:await tray.getByRole('button').allTextContents()});}
 await page.getByRole('button',{name:'Открыть панель костей',exact:true}).click();await record('01-default-gm');
 await page.getByRole('button',{name:'Сбросить набор',exact:true}).click();await record('02-empty');
 const add=page.getByRole('button',{name:label==='release'?'d20':'Добавить d20',exact:true});await add.click();await record('03-reset-add');
 const adv=page.getByRole('button',{name:/^Преим\./});await adv.click();await adv.click();await record('04-two-advantage');
 if(label!=='release'){
  if(label==='current') await page.getByRole('button',{name:'Изменить формулу',exact:true}).click();
  await page.getByLabel('Формула броска',{exact:true}).fill('1d20+5');await page.getByLabel('Формула броска',{exact:true}).blur();await record('05-formula-five');
  await page.getByLabel('Модификатор',{exact:true}).fill('3');await page.getByLabel('Формула броска',{exact:true}).fill('1d20+7');await page.getByLabel('Формула броска',{exact:true}).blur();await record('06-reciprocal-edit');
  await page.getByRole('button',{name:'Выбрать исполнителя броска',exact:true}).click();await page.getByRole('combobox',{name:'Исполнитель броска',exact:true}).selectOption('character:e2e-character-cadsuane');await record('07-pc-actor');
 }
 const close=page.getByRole('button',{name:label==='release'?'Скрыть панель':'Закрыть панель броска',exact:true});await close.click();
 await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({hasText:filledCharacterName}).first().click();
 await page.getByRole('button',{name:'Открыть панель костей',exact:true}).click();await record('08-selected-pc-reopen');
 await writeFile(`${out}/tray-observations.json`,JSON.stringify(rows,null,2));
});
