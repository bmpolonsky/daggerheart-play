/** Controlled service-intent gallery: compares panel variants, not proof of every source click path. */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createPopulatedGameDocument, importGameDocument } from './filled-game-helpers';
import { openGmGame } from './game-route-helpers';
const ids = ['F1','F2','F3','F4','F5','P1','P2','P3','P4','P5','N1','N2','C1','C2','C3','C4','C5','C6','E1','E2','E3','E4','E5','E6'];
const directory = process.env.TRAY_CONTEXT_GALLERY;
for (const width of [1180, 390]) test(`controlled tray context gallery ${width}`, async ({ page }) => {
  test.skip(!directory, 'Explicit artifact-generation run only'); test.setTimeout(180000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 757 }); await openGmGame(page);
  const doc = createPopulatedGameDocument(); const pc = doc.files['data/characters.json'].entities['e2e-character-cadsuane'];
  pc.traits.instinct = 2; pc.spellcastTrait = 'instinct'; pc.hope.value = 4;
  pc.companion = { name: 'QA спутник', evasion: 10, stress: { marked: 0, max: 3 }, attackName: 'Когти', attackRange: 'Вплотную', attackFormula: '1d6', attackDamageType: 'physical', experiences: [{ id: 'qa-comp-xp', name: 'Чуткий нюх', modifier: 2 }], unavailableUntilLongRest: false };
  await importGameDocument(page, doc, 'tray-context-gallery.dhgame');
  const out = `${directory}/${width}`; mkdirSync(out, { recursive: true }); const records = [];
  for (const id of ids) {
    const prepared = await page.evaluate(async (id) => {
      const draftPath = '/src/services/UnifiedRollDraftService.ts', registryPath = '/src/services/serviceRegistry.ts';
      const { unifiedRollDraftService: service } = await import(/* @vite-ignore */ draftPath);
      const { feedService, eventRollService } = await import(/* @vite-ignore */ registryPath);
      const pc = { kind: 'character', id: 'e2e-character-cadsuane', key: 'character:e2e-character-cadsuane', name: 'Кадсуанэ' };
      const npc = { kind: 'adversary', id: 'e2e-adversary-ooze', key: 'adversary:e2e-adversary-ooze', name: 'Алая Слизь' };
      const gm = { kind: 'gm', id: null, key: 'gm', name: 'Мастер' };
      const support = { actorId: 'e2e-character-ran', actorName: 'Ран' }, leader = { actorId: pc.id, actorName: pc.name };
      const base = { actor: pc, mode: 'action', formula: '2d12', trait: 'instinct', title: 'Проверка персонажа' };
      const cases: Record<string, any> = {
        F1: { actor: gm, mode: 'manual', formula: '1d20', title: 'Кости', advantageCount: 2 },
        F2: { ...base, advantageCount: 3, experienceIds: [], manualModifier: 2 }, F3: { ...base, mode: 'reaction', disadvantageCount: 2 },
        F4: { actor: npc, mode: 'gmAttack', formula: '1d20', title: 'Атака', disadvantageCount: 2 },
        F5: { actor: { kind: 'environment', id: 'e2e-environment-grove', key: 'environment:e2e-environment-grove', name: 'Заброшенная роща' }, mode: 'manual', formula: '2d6', title: 'Проверка окружения' },
        P1: { ...base, title: 'Заклинательская характеристика', source: { label: 'Способность QA' } },
        P2: { ...base, title: 'Атака оружием', damage: { formula: '2d8+2' } },
        P3: { ...base, title: 'Атака спутника', source: { isCompanion: true } },
        P4: { actor: pc, mode: 'damage', formula: '2d8+2', critical: true, title: 'Урон оружия' },
        P5: { actor: pc, mode: 'damage', formula: '1d6', title: 'Урон спутника', source: { isCompanion: true } },
        N1: { actor: npc, mode: 'gmAttack', formula: '1d20', title: 'Атака' },
        N2: { actor: npc, mode: 'damage', formula: '2d6+2', title: 'Урон противника' },
        C1: { actor: pc, mode: 'manual', formula: '3d8', title: 'Макрос способности' },
        C2: { actor: pc, mode: 'manual', formula: '', title: 'Высвобождение хаоса', quantity: { label: 'Жетонов потрачено на эту атаку', value: null, min: 1, max: 3, formulaTemplate: '{count}d10' } },
        C3: { actor: pc, mode: 'manual', formula: '', title: 'Вариант способности', branches: [{ id: 'a', label: 'Малый эффект', formula: '1d6' }, { id: 'b', label: 'Большой эффект', formula: '2d8' }] },
        C4: { actor: pc, mode: 'manual', formula: '3d4', title: 'Молитва', hint: 'Подготовлено 3d4 по контексту персонажа.' },
        C5: { actor: pc, mode: 'manual', formula: '2d6', title: 'Покровитель', hint: 'Подготовлен пул текущего ранга.' }
      };
      let input = cases[id];
      if (id === 'E1') {
        const entry = feedService.requestRest('short', { participants: [{ ...leader, choices: [{ id: 'qa-choice', label: 'Залечить Раны', count: 1 }], ready: true }] });
        const result = eventRollService.prepare({ kind: 'rest', entryId: entry.id, actorId: pc.id, choiceId: 'qa-choice' }, 'gm'); if (!result.ok) throw new Error(result.error); input = result.input;
      } else if (id === 'E2' || id === 'E3') {
        const entry = feedService.requestDeathMove({ actor: leader, dedupe: false });
        const result = eventRollService.prepare({ kind: 'death', entryId: entry.id, actorId: pc.id, deathChoice: id === 'E2' ? 'avoidDeath' : 'riskItAll' }, 'gm'); if (!result.ok) throw new Error(result.error); input = result.input;
      } else if (id === 'E4' || id === 'E5' || id === 'E6') {
        const entry = feedService.requestTeamworkRoll({ kind: id === 'E6' ? 'tagTeam' : 'groupAction', participants: [leader, support], status: 'collecting' });
        const result = eventRollService.prepare({ kind: 'teamwork', entryId: entry.id, actorId: id === 'E4' ? support.actorId : pc.id, trait: 'instinct' }, 'gm'); if (!result.ok) throw new Error(result.error); input = result.input;
      }
      service.resetDraft();
      if (input) { service.request(input); service.choosePending(true); }
      return { id, input: input ?? null, nonRoll: id === 'C6' };
    }, id);
    const tray = page.getByRole('region', { name: 'Подготовка броска', exact: true });
    if (!prepared.nonRoll) {
      await expect(tray).toBeVisible();
      if (['F2','F4','P3'].includes(id)) {
        const experience = tray.getByRole('button', { name: 'Опыт', exact: true }); if (await experience.isVisible()) await experience.click();
      }
      if (id === 'C3') await tray.getByRole('combobox', { name: 'Вариант способности' }).selectOption('b');
      if (id === 'C2') await expect(tray.getByRole('button', { name: 'Бросить', exact: true })).toBeDisabled();
      await page.waitForTimeout(250); // Finish the existing tray enter/exit transition before comparing pixels.
      await page.screenshot({ path: `${out}/${id}.png` });
      const bounds = await tray.boundingBox(); records.push({ ...prepared, formula: await tray.getByLabel('Итоговая формула', { exact: true }).textContent(), bounds });
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await tray.getByRole('button', { name: 'Закрыть панель броска', exact: true }).click();
    } else { await page.screenshot({ path: `${out}/${id}-no-tray.png` }); records.push(prepared); }
  }
  writeFileSync(`${out}/manifest.json`, JSON.stringify({ viewport: { width, height: width === 390 ? 844 : 757 }, type: 'controlled-service-intent-views-not-all-source-click-paths', records }, null, 2));
});
