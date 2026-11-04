import {expect,test,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {createPopulatedGameDocument,filledAdversaryName,filledCharacterName,importGameDocument} from './filled-game-helpers';
import {openGmGame,createIsolatedDeterministicP2PRelay,openSharedGmGame,openSharedPlayerGame} from './game-route-helpers';
const output = () => test.info().outputPath();
async function noCalculator(page:Page){await expect(page.getByText('Входящий урон',{exact:true})).toHaveCount(0);await expect(page.getByRole('spinbutton',{name:'Полученный урон',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Применить урон',exact:true})).toHaveCount(0);}
for(const width of [1440,390])test(`GM marks NPC and PC wounds directly without incoming calculator ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:900});await openGmGame(page);
 const doc=createPopulatedGameDocument();doc.files['data/encounter.json'].adversaries['e2e-adversary-ooze'].hp={marked:0,max:4};await importGameDocument(page,doc,'manual-wounds.dhgame');
 const layers=page.getByLabel('Слой интерфейса');if(await layers.isVisible())await layers.getByRole('button',{name:'Сцена',exact:true}).click();
 await page.getByLabel('Игровая сцена').getByRole('button',{name:filledAdversaryName,exact:true}).click();if(await layers.isVisible())await layers.getByRole('button',{name:'Лист',exact:true}).click();
 const npc=page.getByLabel('Противник мастера',{exact:true});await noCalculator(page);await expect(npc.getByLabel('Пороги противника')).toBeVisible();
 const wounds=npc.getByRole('group',{name:'Раны',exact:true});await wounds.getByRole('button',{name:'Раны 3 из 4',exact:true}).click();await expect(wounds.locator('[aria-pressed=true]')).toHaveCount(3);
 await wounds.getByRole('button',{name:'Раны 4 из 4',exact:true}).click();await expect(npc.getByRole('button',{name:'Снять состояние Побеждён',exact:true})).toBeVisible();
 await mkdir(output(),{recursive:true});await page.screenshot({path:`${output()}/gm-npc-${width}.png`});
 if(await layers.isVisible())await layers.getByRole('button',{name:'Сцена',exact:true}).click();await page.getByLabel('Игровая сцена').getByRole('button',{name:filledCharacterName,exact:true}).click();if(await layers.isVisible())await layers.getByRole('button',{name:'Лист',exact:true}).click();
 const pc=page.getByLabel('Персонаж игрока',{exact:true});await noCalculator(page);
 const pcWounds=pc.getByRole('group',{name:'Раны',exact:true});await pcWounds.getByRole('button',{name:'Раны 2 из 5',exact:true}).click();await expect(pcWounds.locator('[aria-pressed=true]')).toHaveCount(2);
 const armor=pc.getByRole('group',{name:'Броня',exact:true});await armor.getByRole('button').first().click();await expect(armor.getByRole('button').first()).toHaveAttribute('aria-pressed','true');
 await expect(pc.getByLabel('Защита',{exact:true})).toBeVisible();await page.screenshot({path:`${output()}/gm-pc-${width}.png`});
});
test('connected PC keeps direct wounds and armor without incoming calculator',async({browser})=>{
 const relay=await createIsolatedDeterministicP2PRelay(browser,['manual-gm','manual-player']);const[gm,player]=relay.clients.map(c=>c.page);
 try{const room=`MANUAL${Date.now()}`;await openSharedGmGame(gm,room);await importGameDocument(gm,createPopulatedGameDocument(),'manual-player.dhgame');await openSharedPlayerGame(player,room);await player.getByRole('region',{name:'Выбор игрока'}).getByRole('button',{name:`Игрок 1 ${filledCharacterName}`}).click();
 const pc=player.getByLabel('Персонаж игрока',{exact:true});await noCalculator(player);await pc.getByRole('group',{name:'Раны',exact:true}).getByRole('button',{name:'Раны 2 из 5',exact:true}).click();await expect(pc.getByRole('group',{name:'Раны',exact:true}).locator('[aria-pressed=true]')).toHaveCount(2);
 const armor=pc.getByRole('group',{name:'Броня',exact:true});await armor.getByRole('button').first().click();await expect(armor.getByRole('button').first()).toHaveAttribute('aria-pressed','true');await expect(pc.getByLabel('Защита',{exact:true})).toBeVisible();await mkdir(output(),{recursive:true});await player.screenshot({path:`${output()}/player-pc.png`});
 }finally{await relay.close();}
});
