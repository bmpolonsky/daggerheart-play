import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Store } from '../../src/core/store/Store';
import { mapGenericItem } from '../../src/domain/content/mappers';
import { buildNpcCatalog, formatNpc, generateNpc, rerollNpcField, NPC_GENDER_LABELS, type NpcField } from '../../src/domain/generators/npc';
import { nameCandidates } from '../../src/domain/generators/names';
import { NpcGeneratorService } from '../../src/services/NpcGeneratorService';
import { createContentState } from '../../src/stores/contentStore';

const origin = (id: string, source: string) => mapGenericItem({ id, name: id, source_slugs: [source] }, 'test');
const library = {
  ...createContentState().generic,
  ancestries: [origin('Основная родословная', 'core'), origin('Авторская родословная', 'custom'), origin('Дополнительная родословная', 'hope-and-fear')],
  communities: [origin('Основное сообщество', 'srd'), origin('Авторское сообщество', 'custom'), origin('Дополнительное сообщество', 'hope-and-fear')]
};

function harness(includeVoidContent = false) {
  const content = new Store(createContentState());
  const game = new Store({ id: 'game-a', includeVoidContent, name: 'Первая игра' });
  let draws = 0;
  let reloads = 0;
  const service = new NpcGeneratorService({
    content$: content.toStream(),
    ensureLoaded: () => {
      if (!content.get().lastLoadedAt) content.update((state) => ({ ...state, isLoading: true }));
    },
    reload: async () => { reloads++; content.update((state) => ({ ...state, error: null, isLoading: true })); }
  }, game, () => { draws++; return 0.999; });
  const finishLoading = () => content.update((state) => ({ ...state, generic: library, lastLoadedAt: '2026-09-19', isLoading: false, error: null }));
  return { content, game, service, finishLoading, draws: () => draws, reloads: () => reloads };
}

test('NPC origins use the builder source policy, including custom and enabled expansion content', () => {
  const core = buildNpcCatalog(library);
  assert.deepEqual(core.ancestries.map((item) => item.name), ['Основная родословная', 'Авторская родословная']);
  assert.deepEqual(core.communities.map((item) => item.name), ['Основное сообщество', 'Авторское сообщество']);
  const expanded = buildNpcCatalog(library, true);
  assert.equal(expanded.ancestries.length, 3);
  assert.equal(expanded.communities.length, 3);
  assert.equal(expanded.ancestries[2]!.id, library.ancestries[2]!.id);
});

test('NPC origin does not determine the name, gender, occupation, appearance or motive; formatting contains only the compact basis', () => {
  const catalog = buildNpcCatalog(library);
  const left = generateNpc({ ancestries: [catalog.ancestries[0]!], communities: [catalog.communities[0]!] }, () => 0.37)!;
  const right = generateNpc({ ancestries: [catalog.ancestries[1]!], communities: [catalog.communities[1]!] }, () => 0.37)!;
  assert.deepEqual(right, { ...left, ancestry: catalog.ancestries[1], community: catalog.communities[1] });
  assert.ok(nameCandidates({ kind: 'character', style: 'any', gender: left.gender, withSurname: false }).some((item) => item.name === left.name));
  assert.deepEqual(Object.keys(left).sort(), ['ancestry', 'appearance', 'community', 'gender', 'motive', 'name', 'occupation']);
  assert.equal(formatNpc(left), `${left.name}\nПол: ${NPC_GENDER_LABELS[left.gender]}.\nРодословная: Основная родословная.\nСообщество: Основное сообщество.\nЗанятие: ${left.occupation}.\nВнешность: ${left.appearance}.\nМотив: ${left.motive}.`);
  assert.notEqual(generateNpc(catalog, () => 0.37, left)!.name, left.name);
});

test('an empty origin pool does not generate a fallback NPC or consume randomness', () => {
  const catalog = buildNpcCatalog(library);
  const noRandom = () => { throw new Error('must not draw'); };
  assert.equal(generateNpc({ ...catalog, ancestries: [] }, noRandom), null);
  assert.equal(generateNpc({ ...catalog, communities: [] }, noRandom), null);
});

test('each field reroll changes only that field and avoids its previous value', () => {
  const h = harness();
  h.finishLoading();
  const disconnect = h.service.connect();
  const fields: NpcField[] = ['name', 'ancestry', 'community', 'occupation', 'appearance', 'motive'];
  for (const field of fields) {
    const before = h.service.state$.get().npc!;
    h.service.reroll(field);
    const after = h.service.state$.get().npc!;
    assert.notDeepEqual(after[field], before[field]);
    assert.equal(after.gender, before.gender);
    for (const other of fields.filter((candidate) => candidate !== field)) assert.deepEqual(after[other], before[other]);
  }
  const npc = h.service.state$.get().npc!;
  const singleton = { ancestries: [npc.ancestry], communities: [npc.community] };
  const noRandom = () => { throw new Error('no alternative must not draw'); };
  assert.equal(rerollNpcField(npc, singleton, 'ancestry', noRandom), npc);
  assert.equal(rerollNpcField(npc, singleton, 'community', noRandom), npc);
  h.content.update((state) => ({ ...state, isLoading: true }));
  const draws = h.draws();
  h.service.reroll('name');
  assert.equal(h.service.state$.get().npc, npc);
  assert.equal(h.draws(), draws);
  disconnect();
});


test('gender is drawn before the name; changing gender changes only the name with it', () => {
  const catalog = buildNpcCatalog(library);
  for (const [gender, random] of [['male', 0.1], ['female', 0.9]] as const) {
    let draws = 0;
    const npc = generateNpc(catalog, () => draws++ === 0 ? random : 0.37)!;
    assert.equal(npc.gender, gender);
    const pool = nameCandidates({ kind: 'character', style: 'any', gender, withSurname: false });
    assert.ok(pool.some((item) => item.name === npc.name));
    const renamed = rerollNpcField(npc, catalog, 'name', () => 0.37);
    assert.notEqual(renamed.name, npc.name);
    assert.equal(renamed.gender, gender);
    assert.ok(pool.some((item) => item.name === renamed.name));
  }
  const h = harness();
  h.finishLoading();
  const disconnect = h.service.connect();
  for (const expected of ['male', 'female'] as const) {
    const before = h.service.state$.get().npc!;
    h.service.reroll('gender');
    const after = h.service.state$.get().npc!;
    assert.equal(after.gender, expected);
    assert.notEqual(after.name, before.name);
    assert.deepEqual(after, { ...before, name: after.name, gender: expected });
    assert.ok(nameCandidates({ kind: 'character', style: 'any', gender: expected, withSurname: false }).some((item) => item.name === after.name));
  }
  disconnect();
});

test('NPC waits for loading and survives unrelated updates and tab remounts without new random draws', () => {
  const h = harness();
  let disconnect = h.service.connect();
  h.service.regenerate();
  assert.deepEqual(h.service.state$.get(), { npc: null, status: 'loading' });
  assert.equal(h.draws(), 0);
  h.content.update((state) => ({ ...state, generic: library, lastLoadedAt: '2026-09-19' }));
  assert.equal(h.service.state$.get().npc, null);
  h.finishLoading();
  const npc = h.service.state$.get().npc;
  assert.ok(npc);
  const draws = h.draws();
  h.content.update((state) => ({ ...state, sourceFilter: 'homebrew', searchTerm: 'несвязанный поиск' }));
  h.game.update((state) => ({ ...state, name: 'Новое название игры' }));
  disconnect();
  disconnect = h.service.connect();
  assert.equal(h.service.state$.get().npc, npc);
  assert.equal(h.draws(), draws);
  h.service.regenerate();
  assert.notEqual(h.service.state$.get().npc!.name, npc.name);
  disconnect();
});

test('NPC respects source changes and does not carry a card from a different game', () => {
  const h = harness(true);
  h.finishLoading();
  const disconnect = h.service.connect();
  assert.equal(h.service.state$.get().npc!.ancestry.name, 'Дополнительная родословная');
  h.game.update((state) => ({ ...state, includeVoidContent: false }));
  const npc = h.service.state$.get().npc!;
  assert.equal(npc.ancestry.name, 'Авторская родословная');
  assert.equal(npc.community.name, 'Авторское сообщество');
  h.game.update((state) => ({ ...state, id: 'game-b' }));
  assert.notEqual(h.service.state$.get().npc, npc);
  disconnect();
});

test('NPC exposes loading, error and empty states and preserves an existing card during a failed reload', async () => {
  const h = harness();
  const disconnect = h.service.connect();
  h.finishLoading();
  const npc = h.service.state$.get().npc;
  await h.service.reload();
  assert.equal(h.reloads(), 1);
  assert.deepEqual(h.service.state$.get(), { npc, status: 'loading' });
  h.content.update((state) => ({ ...state, isLoading: false, error: 'network unavailable' }));
  h.service.regenerate();
  assert.deepEqual(h.service.state$.get(), { npc, status: 'error' });
  h.content.update((state) => ({ ...state, error: null, generic: { ...library, communities: [] } }));
  assert.deepEqual(h.service.state$.get(), { npc: null, status: 'empty' });
  h.finishLoading();
  assert.ok(h.service.state$.get().npc);
  assert.equal(h.service.state$.get().status, 'ready');
  disconnect();
});
