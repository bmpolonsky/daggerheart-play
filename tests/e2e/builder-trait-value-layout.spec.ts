import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {openGmGame} from './game-route-helpers';
import {openGameLibrary} from './tools-helpers';
for(const width of [1440,1024,390]) for(const zoom of [1,.9]) {
 test(`builder signed values fit at ${width}px and document zoom ${zoom}`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await openGmGame(page);
  const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();
  await library.getByRole('button',{name:/Создать героя/}).first().click();
  const builder=page.getByRole('dialog',{name:'Новый герой'});
  await builder.getByRole('button',{name:'Характеристики',exact:true}).click();
  const traits=builder.getByRole('group',{name:'Шаг: Характеристики'});await expect(traits).toBeVisible();
  const selects=traits.getByRole('combobox');for(let i=0;i<6;i++)await selects.nth(i).selectOption('');
  for(const [name,value] of [['Проворность','0'],['Сила','-1'],['Искусность','1'],['Инстинкт','1'],['Влияние','2'],['Знание','0']])await traits.getByRole('combobox',{name,exact:true}).selectOption(value);
  await page.setViewportSize({width,height:width===390?844:900});
  // CSS zoom is a fractional-layout stress check, not browser toolbar zoom.
  await page.evaluate(z=>{document.documentElement.style.zoom=String(z);},zoom);
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await selects.evaluateAll(elements=>elements.map(element=>{
   const e=element as HTMLSelectElement,s=getComputedStyle(e);const canvas=document.createElement('canvas');const c=canvas.getContext('2d')!;c.font=s.font;
   return {value:e.value,text:e.selectedOptions[0]?.text??'',width:e.clientWidth,contentWidth:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),textWidth:c.measureText(e.selectedOptions[0]?.text??'').width};
  }));
  for(const metric of metrics){expect(metric.width).toBeGreaterThanOrEqual(70);expect(metric.contentWidth).toBeGreaterThan(metric.textWidth+8);}
  expect(metrics.map(m=>m.value)).toEqual(['0','-1','1','1','2','0']);
  expect(await page.locator('body').evaluate(e=>e.scrollWidth)).toBeLessThanOrEqual(Math.ceil(width/zoom));
  const output='/home/codex/outputs/dh-builder-clipping-20261027';await mkdir(output,{recursive:true});
  await page.screenshot({path:`${output}/after-${width}-css${zoom}.png`});
  await traits.screenshot({path:`${output}/values-${width}-css${zoom}.png`});
  await writeFile(`${output}/metrics-${width}-css${zoom}.json`,JSON.stringify({viewport:page.viewportSize(),zoom,zoomKind:zoom===1?'normal browser 100%':'CSS document zoom stress only; native browser90% unverified',metrics},null,2));
 });
}
