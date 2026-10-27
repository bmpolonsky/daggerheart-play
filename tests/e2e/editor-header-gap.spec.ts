import { expect, test } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
import { openGameLibrary } from './tools-helpers';
import { writeFile } from 'node:fs/promises';
const before=process.env.HEADER_GAP_BEFORE==='1';
for(const mode of ['sheet','library'] as const)for(const width of [1180,500])test(`editor vitals label and value spacing ${mode} ${width}`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await openGmGame(page);
  const doc=createPopulatedGameDocument(),hero=doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  hero.className='Druid';hero.classSlug='druid';hero.classSourceId='class:druid';hero.classDisplayName='Друид';
  hero.evasion=10;hero.domains=['Sage','Arcana'];hero.armor={...hero.armor,score:5,markedSlots:0,equipped:true,feature:'',featureText:''};hero.sheetCards=[];hero.domainCards=[];
  await importGameDocument(page,doc,'header-gap.dhgame');
  let editor;
  if(mode==='sheet'){
    await page.getByLabel('Участники сцены').locator('.player-roster__item').filter({hasText:filledCharacterName}).first().click();
    await page.getByRole('button',{name:'Редактировать',exact:true}).click();
    editor=page.getByRole('dialog',{name:'Редактор персонажа',exact:true});
  }else{
    const library=await openGameLibrary(page);await library.getByLabel('Разделы библиотеки').getByRole('button',{name:'Персонажи',exact:true}).click();
    await library.getByRole('navigation',{name:'Ростер персонажей',exact:true}).getByRole('button',{name:filledCharacterName,exact:true}).click();
    editor=library.getByRole('region',{name:'Редактор персонажа',exact:true});
  }
  await page.setViewportSize({width,height:757});
  const vitals=editor.getByLabel('Ключевые параметры',{exact:true});await expect(vitals).toBeVisible();
  const metrics=await vitals.locator('.inline-stat').evaluateAll(stats=>stats.map(stat=>{
    const label=stat.querySelector('span')!,value=stat.querySelector('strong')!;
    const l=label.getBoundingClientRect(),v=value.getBoundingClientRect(),s=stat.getBoundingClientRect();
    return{label:label.textContent,value:value.textContent,horizontalGap:v.left-l.right,verticalGap:v.top-l.bottom,sameLine:Math.abs(v.top-l.top)<4,valueRight:v.right,cellRight:s.right,labelFont:getComputedStyle(label).fontSize,valueFont:getComputedStyle(value).fontSize};
  }));
  const prefix=`${before?'before':'after'}-${mode}-${width}`;
  await page.screenshot({path:`/home/codex/outputs/dh-editor-header-gap-20261027/${prefix}.png`});
  await writeFile(`/home/codex/outputs/dh-editor-header-gap-20261027/${prefix}.json`,JSON.stringify(metrics,null,2));
  if(before)return;
  expect(metrics.map(x=>x.value)).toEqual(['10','5/5','Мудрость + Аркана']);
  for(const m of metrics){
    expect(m.valueRight).toBeLessThanOrEqual(m.cellRight+1);
    if(m.sameLine)expect(m.horizontalGap).toBeGreaterThanOrEqual(5);
    else expect(m.verticalGap).toBeGreaterThanOrEqual(2);
  }
});
