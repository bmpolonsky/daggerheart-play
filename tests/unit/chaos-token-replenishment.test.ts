import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCharacter, createDomainCard } from '../../src/domain/rules/factories';
import { CharacterService } from '../../src/services/CharacterService';
import { charactersStore, resetAllStores, feedStore } from '../../src/stores/gameStores';
import { buildCharacterSummary } from '../../src/domain/tabletop/playerView';
import { runDomainCardMacroAction } from '../../src/ui/vtt/playerView/domainCards/domainCardMacroActions';

function setup({ marked = 0, tokens = 0, inLoadout = true, trait = 2 } = {}) {
  resetAllStores();
  const card = createDomainCard({ id: 'chaos', name: 'Высвобождение хаоса', inLoadout,
    text: 'В начале сессии поместите на эту карту количество жетонов, равное вашей Характеристике Заклинателя. Отметьте Стресс, чтобы восполнить запас жетонов на этой карте вплоть до вашей Характеристики Заклинателя.',
    tokens: { value: tokens, max: 6 } });
  const actor = createCharacter({ id: 'hero', spellcastTrait: 'instinct', domainCards: [card] });
  actor.traits.instinct = trait;
  actor.stress.marked = marked;
  charactersStore.update((state) => ({ ...state, order: [actor.id], entities: { [actor.id]: actor } }));
  return { service: new CharacterService(), actor };
}

test('Chaos replenishment publishes one atomic change, pays once, and fills to actual spellcast trait', () => {
  const { service, actor } = setup();
  const observed: Array<[number, number]> = [];
  const unsubscribe = charactersStore.subscribe((state) => {
    const current = state.entities[actor.id];
    if (current) observed.push([current.stress.marked, current.domainCards[0].tokens.value]);
  });
  try {
    assert.equal(service.replenishChaosTokens(actor.id, 'chaos'), 'applied');
    assert.deepEqual(observed.at(-1), [1, 2]);
    assert.equal(observed.some(([stress, tokens]) => stress === 1 && tokens === 0), false);
    assert.equal(service.replenishChaosTokens(actor.id, 'chaos'), 'full');
    assert.equal(service.getCharacter(actor.id)?.stress.marked, 1);
    assert.equal(service.getCharacter(actor.id)?.domainCards[0].tokens.max, 2);
  } finally { unsubscribe(); }
});

test('full Stress refuses Chaos activation without HP damage or partial token change', () => {
  const { service, actor } = setup();
  service.markSlots(actor.id, 'stress', actor.stress.max);
  const before = structuredClone(service.getCharacter(actor.id));
  assert.equal(service.replenishChaosTokens(actor.id, 'chaos'), 'stress');
  assert.deepEqual(service.getCharacter(actor.id), before);
});

test('vaulted card, zero spellcast trait and unrelated Stress macro cannot replenish Chaos', () => {
  for (const options of [{ inLoadout: false }, { trait: 0 }]) {
    const { service, actor } = setup(options);
    assert.equal(service.replenishChaosTokens(actor.id, 'chaos'), 'unavailable');
    assert.equal(service.getCharacter(actor.id)?.stress.marked, 0);
  }
  const { service, actor } = setup();
  service.addDomainCard(actor.id, { id: 'other', name: 'Other card', text: 'Отметьте Стресс.', inLoadout: true });
  assert.equal(service.replenishChaosTokens(actor.id, 'other'), 'unavailable');
  const summary = buildCharacterSummary(service.getCharacter(actor.id)!);
  const other = summary.loadoutCards.find((card) => card.id === 'other')!;
  runDomainCardMacroAction(other, other.macros[0], { character: summary, role: 'gm', openRollDraft: () => undefined });
  assert.equal(service.getCharacter(actor.id)?.stress.marked, 1);
  assert.equal(service.getCharacter(actor.id)?.domainCards[0].tokens.value, 0);
});

test('Chaos inline Stress action replenishes and logs both effect and cost', () => {
  const { service, actor } = setup();
  const summary = buildCharacterSummary(service.getCharacter(actor.id)!);
  const card = summary.loadoutCards[0];
  const macro = card.macros.find((item) => item.kind === 'markStress')!;
  const context = { character: summary, role: 'gm' as const, openRollDraft: () => undefined };
  runDomainCardMacroAction(card, macro, context);
  assert.equal(service.getCharacter(actor.id)?.domainCards[0].tokens.value, 2);
  assert.equal(service.getCharacter(actor.id)?.stress.marked, 1);
  assert.match(feedStore.get()[0].body, /жетоны восстановлены.*1 Стресс/);
  runDomainCardMacroAction(card, macro, context); // stale preview cannot charge twice
  assert.equal(service.getCharacter(actor.id)?.stress.marked, 1);
  assert.match(feedStore.get()[0].body, /уже полон; Стресс не отмечен/);
});

test('missing spellcast choice cannot fall back to a generic six-token activation', () => {
  const { service, actor } = setup();
  charactersStore.update((state) => ({ ...state, entities: {
    ...state.entities, [actor.id]: { ...state.entities[actor.id], spellcastTrait: null }
  } }));
  assert.equal(service.replenishChaosTokens(actor.id, 'chaos'), 'unavailable');
  assert.equal(service.getCharacter(actor.id)?.stress.marked, 0);
});
