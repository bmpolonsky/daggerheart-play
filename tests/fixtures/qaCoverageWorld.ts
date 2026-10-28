/** Synthetic-only fixture. Uses the production builder and world exporter, never browser storage. */
import { readFileSync } from 'node:fs';
import { buildCharacterBuilderCatalog, buildCharacterBuilderQuickStart } from '../../src/domain/characterBuilder/catalog';
import { buildCharacterDraft } from '../../src/domain/characterBuilder';
import { validateCharacterBuilderReadiness } from '../../src/domain/characterBuilder/validation';
import { startingDomainCardCount } from '../../src/domain/rules/characterRuleModifiers';
import { mapGenericItem, mapRawClassItem, mapRawEquipmentItem, mapRawAdversary, createAdversaryFromLibrary } from '../../src/domain/content/mappers';
import { CLASS_RECOMMENDED_TRAITS } from '../../src/domain/rules/constants';
import type { Character } from '../../src/domain/rules/types';
import type { CharacterBuilderIssue } from '../../src/domain/characterBuilder/validation';
import { createCharacter, createEncounterState, createGameState, createSceneTableState, createUiState } from '../../src/domain/rules/factories';
import { createTableScene, createTokenState } from '../../src/domain/tabletop/factories';
import { createGameDocument } from '../../src/domain/game/gameDocument';
import { BrowserGameDocumentStore } from '../../src/core/persistence/gameDocumentStore';

export async function createQaCoverageWorld(dataDirectory: string) {
  const raw = (name: string): any[] => JSON.parse(readFileSync(`${dataDirectory}/${name}.json`, 'utf8')).data;
  const classes = raw('classes').map(mapRawClassItem);
  const equipment = raw('equipment').map(mapRawEquipmentItem);
  const content = {
    ancestries: raw('ancestries').map(item => mapGenericItem(item, 'ancestry')),
    communities: raw('communities').map(item => mapGenericItem(item, 'community')),
    subclasses: raw('subclasses').map(item => mapGenericItem(item, 'subclass')),
    domainCards: raw('domain-cards').map(item => mapGenericItem(item, 'domain-card'))
  };
  const classOptions = buildCharacterBuilderCatalog({ content, classes, equipment, className: 'Bard', includePlaytest: 'all' }).classOptions;
  const characters: Character[] = [];
  const coverage: { classId: string; className: string; subclassId: string; subclassName: string; characterId: string; readiness: string; warnings: CharacterBuilderIssue[] }[] = [];
  for (const option of classOptions) {
    const catalog = buildCharacterBuilderCatalog({ content, classes, equipment, className: option.className, classId: option.id, includePlaytest: 'all' });
    for (const subclass of catalog.classSubclasses) {
      const selections = buildCharacterBuilderQuickStart(catalog, () => ((characters.length * 37 + 11) % 97) / 97);
      selections.subclassId = subclass.id;
      selections.selectedCardIds = catalog.availableDomainCards.slice(0, startingDomainCardCount(catalog.subclassRuleModifiers[subclass.id])).map(card => card.id);
      const input = { content, classes, equipment, className: option.className, classId: option.id, includePlaytest: 'all' as const,
        ...selections, traits: CLASS_RECOMMENDED_TRAITS[option.className], experienceNames: ['Исследователь QA', 'Надёжный товарищ QA'] };
      const readiness = validateCharacterBuilderReadiness(input);
      if (!readiness.canCreate) throw new Error(`${option.name}/${subclass.name}: ${JSON.stringify(readiness.issues)}`);
      const character = createCharacter({ ...buildCharacterDraft(input).draft, id: `qa-${subclass.id}`, name: `QA ${option.name} — ${subclass.name}`, playerName: 'Синтетический QA',
        notes: 'Только локальная проверка. Не является живой игровой комнатой.',
        conditions: characters.length === 0 ? [{ id: 'qa-custom', name: 'Длинное пользовательское состояние для проверки переноса', notes: 'Снять вручную после проверки.' }, { id: 'qa-legacy', name: 'Архивная заметка', notes: 'Старое описание.', removalCondition: 'После отдыха (старое поле)' }] : [] });
      character.hp.marked = Math.min(characters.length % 3, character.hp.max);
      character.stress.marked = Math.min(characters.length % 4, character.stress.max);
      characters.push(character);
      coverage.push({ classId: option.id, className: option.name, subclassId: subclass.id, subclassName: subclass.name, characterId: character.id, readiness: 'PASS', warnings: readiness.issues });
    }
  }
  const libraryAdversaries = raw('adversaries').map(mapRawAdversary);
  // One representative for every existing role/tier combination, not invented combinations.
  const representatives = [...new Map(libraryAdversaries.map(item => [`${item.type}/${item.tier}`, item])).values()];
  const adversaries = representatives.map((item, index) => ({ ...createAdversaryFromLibrary(item), id: `qa-adversary-${index}`, name: `QA ${item.name}` }));
  const scenes = Array.from({ length: Math.ceil(Math.max(characters.length, adversaries.length) / 4) }, (_, index) => createTableScene({ id: `qa-scene-${index}`, name: `QA классы ${index + 1}`, mode: 'tactical',
    tokens: [...characters.slice(index * 4, index * 4 + 4).map((character, position) => createTokenState({ kind: 'character', id: character.id }, { x: 200, y: 150 + position * 150 })),
      ...adversaries.slice(index * 4, index * 4 + 4).map((adversary, position) => createTokenState({ kind: 'adversary', id: adversary.id }, { x: 700, y: 150 + position * 150 }))] }));
  const game = { ...createGameState(), name: 'QA все поддерживаемые подклассы', contentAccess: 'all' as const, includeVoidContent: true };
  const document = createGameDocument({ schemaVersion: 6, game, characters: { entities: Object.fromEntries(characters.map(item => [item.id, item])), order: characters.map(item => item.id), selectedId: characters[0]?.id ?? null, updatedAt: game.updatedAt },
    encounter: { ...createEncounterState(), adversaries: Object.fromEntries(adversaries.map(item => [item.id, item])), order: adversaries.map(item => item.id), activeAdversaryId: adversaries[0]?.id ?? null },
    feed: [], rollLog: [], ui: createUiState(), sceneTable: createSceneTableState({ scenes: Object.fromEntries(scenes.map(item => [item.id, item])), sceneOrder: scenes.map(item => item.id), activeSceneId: scenes[0].id, liveSceneId: scenes[0].id }) });
  let saved: unknown = null;
  const store = new BrowserGameDocumentStore({ get: async <T>() => saved as T | null, put: async (_key, value) => { saved = value; }, delete: async () => { saved = null; }, subscribe: () => () => undefined }, undefined);
  const worldId = await store.createWorld(document, 'QA каталог — синтетический мир');
  const archive = await store.exportWorld(worldId);
  if (!archive) throw new Error('Production exporter returned no world');
  return { archive, coverage, inventory: { rawClassCount: classes.length, supportedClassOptions: classOptions.map(item => ({ id: item.id, name: item.name, className: item.className, subclasses: coverage.filter(row => row.classId === item.id).length })), excludedClasses: classes.filter(item => !classOptions.some(option => option.id === item.id)).map(item => ({ id: item.id, name: item.name, domainSlugs: item.domainSlugs, domains: item.domains })), rawSubclassCount: content.subclasses.length, characters: characters.length, adversaries: adversaries.length, adversaryRoleTiers: representatives.map(item => ({ role: item.type, tier: item.tier, source: item.name })), scenes: scenes.length } };
}
