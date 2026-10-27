import { expect, test, type Page, type Locator } from '@playwright/test';
import { createPopulatedGameDocument, filledCharacterName, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
const firstId='e2e-character-cadsuane', secondId='e2e-character-ran', eventId='qa-role-revision';
async function stored(page: Page): Promise<any> {
  return page.evaluate(async () => {
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('daggerheart-play-game');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const doc:any=await new Promise((resolve,reject)=>{const r=db.transaction('documents').objectStore('documents').get('current-game');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
    const world=doc?.worlds?.[doc?.activeWorldId]??doc;return world?.games?.[world?.activeGameId]?.state;
  });
}
async function open(page:Page, kind:'groupAction'|'tagTeam') {
  await page.setViewportSize({width:1440,height:900});await openGmGame(page);
  const doc=createPopulatedGameDocument(), chars=doc.files['data/characters.json'].entities;
  chars[firstId].traits.agility=0;chars[secondId].traits.agility=1;
  for(const id of [firstId,secondId]){chars[id].sheetCards=[];chars[id].domainCards=[];chars[id].experiences=[];}
  doc.files['data/game.json'].autoApplyRollConsequences=false;
  const actors=[firstId,secondId].map(actorId=>({actorId,actorName:chars[actorId].name}));
  doc.files['data/feed.json']=[{id:eventId,type:'teamwork',createdAt:'2026-10-27T20:00:00Z',visibility:'public',authorName:'Мастер QA',title:'Совместная проверка QA',body:'',
    teamwork:{id:'qa-request',kind,status:'collecting',requestedAt:'2026-10-27T20:00:00Z',difficulty:12,
      participants:actors.map((actor,index)=>({...actor,role:kind==='tagTeam'?'partner':index===0?'leader':'support'})),availableActors:actors}}];
  await importGameDocument(page,doc,'role-revision.dhgame');
  const chat=page.getByLabel('Чат игры');if(!await chat.isVisible())await page.getByRole('button',{name:/^Открыть чат/}).click();
  const card=page.locator('.feed-teamwork-card');await expect(card).toBeVisible();return card;
}
async function prepare(page:Page, row:Locator, type:'реакции'|'действия') {
  await row.getByRole('button',{name:`Бросок ${type}`,exact:true}).click();
  const tray=page.getByRole('region',{name:'Подготовка броска',exact:true});
  const replace=tray.getByRole('button',{name:'Заменить подготовленный бросок',exact:true});if(await replace.isVisible())await replace.click();
  await expect(tray).toBeVisible();return tray;
}
async function nextDice(page:Page, dice:[number,number]) {
  // Only this isolated synthetic profile; the first two calls are the actual d12 rolls.
  await page.evaluate(values=>{const original=Math.random;let i=0;Math.random=()=>i<values.length?(values[i++]-0.5)/12:original();},dice);
}
test('group reaction becomes a fresh leader action while history, repeat guard and reload remain correct',async({page})=>{
  const card=await open(page,'groupAction');
  const first=card.locator('.feed-rest-participant').filter({has:page.getByText(filledCharacterName,{exact:true})});
  const second=card.locator('.feed-rest-participant').filter({has:page.getByText('Ран',{exact:true})});
  await expect(first.getByRole('combobox',{name:`Характеристика броска: ${filledCharacterName}`,exact:true})).toBeVisible();
  await expect(second.getByRole('combobox',{name:'Характеристика броска: Ран',exact:true})).toBeVisible();
  let tray=await prepare(page,second,'реакции');
  await expect(tray).toContainText('Групповой бросок — результат связан с событием.');
  await nextDice(page,[4,6]);await tray.getByRole('button',{name:'Бросить',exact:true}).click();
  await expect.poll(async()=>{const s=await stored(page);return s?.feed.find((e:any)=>e.id===eventId)?.teamwork.participants[1].result?.total;}).toBe(11);
  const oldRollId=(await stored(page)).rollLog[0].id;
  await tray.getByRole('button',{name:'Закрыть панель броска',exact:true}).click();
  tray=await prepare(page,first,'действия');
  await expect(tray.getByLabel('Итоговая формула',{exact:true})).toHaveText('2d12-1');
  await tray.getByRole('button',{name:'Закрыть панель броска',exact:true}).click();
  await second.getByRole('button',{name:'Сделать лидером',exact:true}).click();
  tray=await prepare(page,first,'реакции');await nextDice(page,[4,6]);await tray.getByRole('button',{name:'Бросить',exact:true}).click();
  await expect.poll(async()=>{const s=await stored(page);return s?.feed.find((e:any)=>e.id===eventId)?.teamwork.participants[0].result?.total;}).toBe(10);
  await tray.getByRole('button',{name:'Закрыть панель броска',exact:true}).click();
  tray=await prepare(page,second,'действия');
  await expect(tray.getByLabel('Исполнитель броска',{exact:true})).toContainText('Ран');
  await expect(tray.getByLabel('Итоговая формула',{exact:true})).toHaveText('2d12');
  await expect(tray).not.toContainText('Этот результат уже применён');
  await expect(tray.getByRole('button',{name:'Бросить',exact:true})).toBeEnabled();
  await page.screenshot({path:'/home/codex/outputs/dh-group-role-roll-20261027/new-leader-prepared.png'});
  await nextDice(page,[5,6]);await tray.getByRole('button',{name:'Бросить',exact:true}).click();
  await expect.poll(async()=>(await stored(page))?.rollLog.length).toBe(3);
  await expect(tray.getByRole('button',{name:'Бросить',exact:true})).toBeDisabled();
  const snapshot=await stored(page);expect(snapshot.rollLog.some((r:any)=>r.id===oldRollId&&r.total===11)).toBe(true);
  expect(snapshot.feed.find((e:any)=>e.id===eventId).teamwork.participants[1].result.rollType).toBe('action');
  await page.screenshot({path:'/home/codex/outputs/dh-group-role-roll-20261027/new-leader-applied.png'});
  await page.reload();await expect(page.locator('[data-vtt-root]')).toBeVisible();
  await expect.poll(async()=>(await stored(page))?.rollLog.length).toBe(3);
  const after=await stored(page);expect(after.rollLog.some((r:any)=>r.id===oldRollId)).toBe(true);
  expect(after.feed.find((e:any)=>e.id===eventId).teamwork.participants[1].roleRevision).toBe(1);
});
test('tag-team preparation retains its own label and named trait selectors',async({page})=>{
  const card=await open(page,'tagTeam');
  await expect(card.getByRole('combobox',{name:/^Характеристика броска:/})).toHaveCount(2);
  const first=card.locator('.feed-rest-participant').filter({has:page.getByText(filledCharacterName,{exact:true})});
  const tray=await prepare(page,first,'действия');
  await expect(tray).toContainText('Командный бросок — результат связан с событием.');
  await expect(tray.getByRole('button',{name:'Бросить',exact:true})).toBeEnabled();
});
