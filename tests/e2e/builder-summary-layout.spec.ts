import {expect,test} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {openGmGame} from './game-route-helpers';
import {openGameLibrary} from './tools-helpers';
const before=process.env.BUILDER_SUMMARY_BEFORE==='1',out='/home/codex/outputs/dh-builder-summary-20261028';
for(const width of [1180,390])test(`summary groups and readiness at ${width}`,async({page})=>{
 mkdirSync(out,{recursive:true});await page.setViewportSize({width,height:width===390?844:757});await openGmGame(page);
 const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();await library.getByRole('button',{name:/Создать героя/}).first().click();
 const builder=page.getByRole('dialog',{name:'Новый герой',exact:true});
 await page.evaluate(()=>{let seed=241;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};});
 await builder.getByRole('button',{name:'Случайный герой',exact:true}).click();await builder.getByRole('button',{name:'Личность',exact:true}).click();await builder.getByRole('textbox',{name:'Имя',exact:true}).fill('QA — Итог');
 await builder.getByRole('button',{name:'Итог',exact:true}).click();const step=builder.getByRole('group',{name:'Шаг: Итог',exact:true});await expect(builder.getByRole('button',{name:'Создать',exact:true})).toBeEnabled();
 await page.screenshot({path:`${out}/${before?'before':'after'}-valid-${width}.png`});
 const bar=before ? await builder.locator('.cinematic-builder-progress').evaluate(el=>{const b=el.getBoundingClientRect(),f=el.querySelector('span')!.getBoundingClientRect();return{barHeight:b.height,fillHeight:f.height,barWidth:b.width,fillWidth:f.width};}) : null;
 writeFileSync(`${out}/${before?'before':'after'}-bar-${width}.json`,JSON.stringify(bar));
 const summary=step.locator('.cinematic-builder-loadout-summary');const validText=await summary.innerText();
 if(!before){await expect(summary.getByRole('region',{name:'Характеристики',exact:true})).toBeVisible();await expect(builder.locator('.cinematic-builder-progress')).toHaveCount(0);}
 await builder.getByRole('button',{name:'Характеристики',exact:true}).click();const agility=builder.getByRole('combobox',{name:'Проворность',exact:true});const original=await agility.inputValue();await agility.selectOption('');
 await builder.getByRole('button',{name:'Итог',exact:true}).click();await expect(builder.getByRole('button',{name:'Создать',exact:true})).toBeDisabled();
 await page.screenshot({path:`${out}/${before?'before':'after'}-invalid-${width}.png`});if(before)return;
 await expect(summary).toContainText('Нет значения');await expect(summary).not.toContainText('Проворность не выбрано');
 const issue=step.getByRole('region',{name:'Нужно завершить',exact:true});await issue.getByRole('button').first().click();await expect(agility).toBeVisible();await agility.selectOption(original);
 await builder.getByRole('button',{name:'Итог',exact:true}).click();expect(await summary.innerText()).toBe(validText);await expect(builder.getByRole('button',{name:'Создать',exact:true})).toBeEnabled();
 expect(await step.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await builder.getByRole('button',{name:'Создать',exact:true}).click();await expect(builder).toHaveCount(0);
 await expect(library.getByRole('region',{name:'Редактор персонажа',exact:true}).getByRole('heading',{name:'QA — Итог',exact:true})).toBeVisible();
});
