import assert from 'node:assert/strict';
import { test } from 'vitest';
import { contentAccessForGame, contentSourceAllowed, type ContentAccess } from '../../src/domain/content/access';
import { createCharacter, createGameState, createDomainCard, createInventoryItem } from '../../src/domain/rules/factories';
import { migratePersistedState } from '../../src/domain/migrations/persistedState';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { resetAllStores, gameStore } from '../../src/stores/gameStores';
import { GameService } from '../../src/services/GameService';
import { filterBuilderContent, classDefinitionForCharacter } from '../../src/domain/characterBuilder';
import { mapGenericItem, mapRawClassItem } from '../../src/domain/content/mappers';

test('missing settings default to all while explicit legacy restrictions survive', () => {
  assert.equal(contentAccessForGame({}), 'all');
  assert.equal(contentAccessForGame(createGameState()), 'all');
  assert.equal(contentAccessForGame({ includeVoidContent: false }), 'core');
  assert.equal(contentAccessForGame({ includeVoidContent: true }), 'all');
  assert.equal(contentAccessForGame({ contentAccess: 'hope-and-fear', includeVoidContent: false }), 'hope-and-fear');
});

test('source policy separates published H&F from Void without relabeling custom content', () => {
  for (const mode of ['core', 'hope-and-fear', 'all'] as ContentAccess[]) {
    assert.equal(contentSourceAllowed(['core', 'srd'], mode), true);
    assert.equal(contentSourceAllowed(['custom'], mode), true);
    assert.equal(contentSourceAllowed(['hope-and-fear'], mode), mode !== 'core');
    assert.equal(contentSourceAllowed(['playtest-the-void'], mode), mode === 'all');
  }
});

test('persistence migration preserves stored characters and explicit choices in every mode', () => {
  resetAllStores();
  const character = createCharacter({ name: 'Сохранённая Ведьма', className: 'Witch', classSlug: 'witch', classSourceId: 123, subclassName: 'Лунная', domainCards: [createDomainCard({ id: 'saved-void-card', name: 'Истязание', domain: 'Dread' })], inventory: [createInventoryItem({ name: 'Сохранённый предмет' })] });
  for (const [legacy, mode] of [[false, 'core'], [true, 'all'], [undefined, 'all']] as const) {
    const state = snapshotPersistedState();
    const game = { ...state.game };
    delete game.contentAccess;
    if (legacy === undefined) delete (game as Partial<typeof game>).includeVoidContent;
    else game.includeVoidContent = legacy;
    state.game = game;
    state.characters.entities = { [character.id]: character };
    state.characters.order = [character.id];
    const migrated = migratePersistedState(state);
    assert.equal(migrated.game.contentAccess, mode);
    assert.equal(migrated.game.includeVoidContent, mode === 'all');
    assert.equal(migrated.characters.entities[character.id].classSlug, 'witch');
    assert.equal(migrated.characters.entities[character.id].subclassName, 'Лунная');
    assert.deepEqual(migrated.characters.entities[character.id].domainCards, character.domainCards);
    assert.deepEqual(migrated.characters.entities[character.id].inventory, character.inventory);
    assert.deepEqual(migrated.characters.order, [character.id]);
    assert.equal(migratePersistedState(migrated).game.contentAccess, mode);
  }
});

test('changing availability changes only game settings and round-trips H&F mode', () => {
  resetAllStores();
  const before = snapshotPersistedState().characters;
  const service = new GameService();
  service.updateSettings({ contentAccess: 'hope-and-fear' });
  assert.equal(gameStore.get().contentAccess, 'hope-and-fear');
  assert.equal(gameStore.get().includeVoidContent, false);
  assert.equal(migratePersistedState(snapshotPersistedState()).game.contentAccess, 'hope-and-fear');
  service.updateSettings({ contentAccess: 'core' });
  service.updateSettings({ contentAccess: 'all' });
  assert.deepEqual(snapshotPersistedState().characters, before);
  service.updateSettings({ includeVoidContent: false });
  assert.equal(gameStore.get().contentAccess, 'core');
});

test('all generic selection catalogs use the same source policy; saved class identity stays readable', () => {
  const items = ['core', 'hope-and-fear', 'playtest-the-void', 'custom'].map((source, index) => mapGenericItem({ slug: source, name: source, source_slugs: [source], id: index }, 'ancestry'));
  const content = { ancestries: items, communities: items, subclasses: items, domainCards: items };
  for (const [mode, count] of [['core', 2], ['hope-and-fear', 3], ['all', 4]] as const) {
    for (const values of Object.values(filterBuilderContent(content, mode))) assert.equal(values.length, count);
  }
  const saved = mapRawClassItem({ slug: 'witch', name: 'Ведьма', source_slugs: ['hope-and-fear'], domain_slugs: ['sage', 'dread'] });
  assert.equal(classDefinitionForCharacter([saved], { className: 'Witch', classSlug: saved.slug, classSourceId: saved.sourceId }, 'core')?.id, saved.id);
});
