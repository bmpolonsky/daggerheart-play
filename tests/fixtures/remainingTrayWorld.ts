import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readZipEntries, writeZip, zipTextEntry } from '../../src/core/archive/zip';
import { isWorldArchiveDocument } from '../../src/core/persistence/gameDocumentStore';
import { createTokenState } from '../../src/domain/tabletop/factories';
import { createWeapon } from '../../src/domain/rules/factories';
import { mapGenericItem, mapRawEquipmentItem, mapRawEnvironmentItem, createEnvironmentFromLibrary } from '../../src/domain/content/mappers';
import { domainCardFromLibrary } from '../../src/domain/characterBuilder';
import type { DaggerheartClass } from '../../src/domain/rules/types';
export type RemainingTrayCase = 'siphon' | 'combo' | 'countdown' | 'weapon-single' | 'weapon-sequence' | 'beastform' | 'risk';

/** Derivatives of the checked-in 26-character world; production archive format, no browser state access. */
export async function remainingTrayWorld(kind: RemainingTrayCase) {
  const entries = await readZipEntries(new Blob([new Uint8Array(readFileSync(resolve('tests/fixtures/qa-world/synthetic-coverage-world.dhworld'))).buffer]));
  const manifest = JSON.parse(zipTextEntry(entries, 'manifest.json')!);
  const world = JSON.parse(zipTextEntry(entries, 'data/world.json')!);
  const candidate: unknown = { ...manifest, world }; if (!isWorldArchiveDocument(candidate)) throw new Error('Invalid source QA archive');
  const archive = candidate;
  const state = archive.world.games[archive.world.activeGameId!].state;
  const className: DaggerheartClass = kind === 'siphon' ? 'Assassin' : kind === 'beastform' ? 'Druid' : kind === 'risk' ? 'Seraph' : 'Fighter';
  const actor = Object.values(state.characters.entities).find(actor => actor.className === className)!;
  const raw = (name: string): any[] => JSON.parse(readFileSync(resolve(`public/data/${name}.json`), 'utf8')).data;
  actor.stress.marked = 0; actor.hp.marked = kind === 'risk' ? actor.hp.max : 0; actor.hope.value = Math.min(4, actor.hope.max);
  state.rollLog = []; state.feed = []; state.game.autoApplyRollConsequences = false;
  const scene = state.sceneTable.scenes[state.sceneTable.activeSceneId!];
  scene.tokens = [createTokenState({ kind: 'character', id: actor.id }, { x: 300, y: 300 })];
  let sourceName = '', macroLabel = '', environmentName = '';
  if (kind === 'siphon') {
    actor.level = 2;
    const card = domainCardFromLibrary(mapGenericItem(raw('domain-cards').find(card => card.slug === 'siphon-essence'), 'domain-card'), true);
    actor.domainCards = [...actor.domainCards, card]; sourceName = card.name; macroLabel = 'd12+4';
  } else if (kind === 'combo') { sourceName = actor.sheetCards.find(card => card.id === 'sheet-class-playtest-fighter-1970')!.name; macroLabel = 'Кость Комбо'; }
  else if (kind === 'countdown') {
    const environment = createEnvironmentFromLibrary(mapRawEnvironmentItem(raw('environments').find(item => item.slug === 'cliffside-ascent')));
    environment.id = 'qa-remaining-cliff'; state.encounter.environments[environment.id] = environment;
    scene.tokens.push(createTokenState({ kind: 'environment', id: environment.id }, { x: 650, y: 350 })); environmentName = environment.name; macroLabel = '1d12'; sourceName = 'Падение';
  } else if (kind.startsWith('weapon-')) {
    const item = mapRawEquipmentItem(raw('equipment').find(item => item.slug === (kind === 'weapon-single' ? 'greatstaff' : 'yutari-bloodbow')));
    // A valid custom heterogeneous pool deliberately cannot identify one current die size.
    const weapon = createWeapon({ id: `qa-${kind}`, name: `QA ${item.name}`, sourceId: item.sourceId, sourceSlug: item.slug, damageFormula: '1d8+1d6', damageType: item.damageType, trait: item.trait ?? 'strength', range: item.range, featureText: item.featureText });
    actor.weapons = [weapon]; sourceName = weapon.name; macroLabel = 'дополнительную кость урона';
  } else if (kind === 'risk') {
    state.feed = [{ id: 'qa-remaining-risk', type: 'deathMove', createdAt: '2026-10-28T17:00:00Z', authorName: 'Мастер QA', title: 'Предсмертный ход QA', body: '', visibility: 'public', publication: 'public', deathMove: { id: 'qa-risk', status: 'pending', requestedAt: '2026-10-28T17:00:00Z', actor: { actorId: actor.id, actorName: actor.name, actorType: 'character' } } }];
  }
  archive.world.name = `QA реальные входы — ${kind}`;
  const bundle = await writeZip([{ path: 'manifest.json', data: JSON.stringify({ ...manifest, name: archive.world.name }) }, { path: 'data/world.json', data: JSON.stringify(archive.world) }]);
  return { buffer: Buffer.from(await bundle.arrayBuffer()), actorId: actor.id, actorName: actor.name, sourceName, macroLabel, environmentName, originalCharacterCount: state.characters.order.length, proficiency: actor.proficiency };
}
