import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  applyDomainCardMove,
  enforceCharacterHandLimit,
  placeAcquiredDomainCards,
  permanentlyVaultDomainCard,
  planDomainCardMove
} from '../../src/domain/rules/cardLoadout';
import { createCharacter, createDomainCard } from '../../src/domain/rules/factories';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';
import rulesPayload from '../../public/data/rules.json';
import type { RawRuleItem } from '../../src/domain/content/types';

function cards(count = 6) {
  return Array.from({ length: count }, (_, index) => createDomainCard({
    id: `card-${index + 1}`,
    sourceId: `source-${index + 1}`,
    name: `Card ${index + 1}`,
    domain: 'Codex',
    recallCost: index === 5 ? 'Стресс 2' : 'Стресс 1',
    inLoadout: true
  }));
}

test('Hand/Vault constants match the bundled SRD rule sources', () => {
  const rules = rulesPayload.data as RawRuleItem[];
  const loadout = rules.find((rule) => rule.slug === 'loadout-and-vault');
  const swapping = rules.find((rule) => rule.slug === 'swapping-cards');
  assert.match(loadout?.description ?? '', /(?:максимум|не более) пяти/i);
  assert.match(swapping?.main_body ?? '', /стоимост[ьи] Призыва/i);
  assert.match(swapping?.main_body ?? '', /повышаете Уровень/i);
});

test('Hand is capped at five while all additional cards remain in the Vault', () => {
  const normalized = enforceCharacterHandLimit(cards(7));
  assert.equal(normalized.filter((card) => card.inLoadout).length, 5);
  assert.equal(normalized.filter((card) => !card.inLoadout).length, 2);
  const character = createCharacter({ domainCards: cards(7) });
  assert.equal(character.domainCards.filter((card) => card.inLoadout).length, 5);
  assert.equal(character.domainCards.length, 7);
});

test('outside rest recalling a card pays Recall Cost and replaces a card when Hand is full', () => {
  const character = createCharacter({ domainCards: cards(), stress: { marked: 1, max: 6 } });
  const missingReplacement = planDomainCardMove(character, { cardId: 'card-6', to: 'hand', context: 'adventure' });
  assert.equal(missingReplacement.canApply, false);
  assert.equal(missingReplacement.issues.some((issue) => issue.code === 'hand.full'), true);

  const result = applyDomainCardMove(character, {
    cardId: 'card-6',
    to: 'hand',
    context: 'adventure',
    replaceCardId: 'card-1'
  });
  assert.equal(result.applied, true);
  assert.equal(result.plan.stressCost, 2);
  assert.equal(result.character.stress.marked, 3);
  assert.equal(result.character.domainCards.find((card) => card.id === 'card-6')?.inLoadout, true);
  assert.equal(result.character.domainCards.find((card) => card.id === 'card-1')?.inLoadout, false);
  assert.equal(result.character.domainCards.filter((card) => card.inLoadout).length, 5);
});

test('rest and level-up swaps are free, but insufficient Stress blocks an adventure recall', () => {
  const character = createCharacter({ domainCards: cards(), stress: { marked: 5, max: 6 } });
  assert.equal(planDomainCardMove(character, {
    cardId: 'card-6', to: 'hand', context: 'adventure', replaceCardId: 'card-1'
  }).issues.some((issue) => issue.code === 'stress.insufficient'), true);
  for (const context of ['rest', 'levelUp'] as const) {
    const result = applyDomainCardMove(character, {
      cardId: 'card-6', to: 'hand', context, replaceCardId: 'card-1'
    });
    assert.equal(result.applied, true);
    assert.equal(result.plan.stressCost, 0);
    assert.equal(result.character.stress.marked, 5);
  }
});

test('permanent Vault removes a card from play and forbids every recall context', () => {
  const character = permanentlyVaultDomainCard(createCharacter({ domainCards: cards(2) }), 'card-1');
  assert.equal(character.domainCards.find((card) => card.id === 'card-1')?.permanentlyVaulted, true);
  assert.equal(character.domainCards.find((card) => card.id === 'card-1')?.inLoadout, false);
  for (const context of ['rest', 'adventure', 'levelUp'] as const) {
    const plan = planDomainCardMove(character, { cardId: 'card-1', to: 'hand', context });
    assert.equal(plan.canApply, false);
    assert.equal(plan.issues.some((issue) => issue.code === 'card.permanentlyVaulted'), true);
  }
});

test('CharacterService keeps excess acquisitions in Vault and audits legal moves', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ domainCards: cards(5) });
  service.addDomainCard(character.id, createDomainCard({ id: 'vault-card', domain: 'Codex', recallCost: 'Стресс 1' }));
  const acquired = service.getCharacter(character.id)?.domainCards.find((card) => card.id === 'vault-card');
  assert.equal(acquired?.inLoadout, false);
  assert.equal(acquired?.loadoutChoicePending, true);
  const moved = service.moveDomainCard(character.id, {
    cardId: 'vault-card', to: 'hand', context: 'levelUp', replaceCardId: 'card-1'
  }, { actor: { id: 'player', name: 'Player', role: 'player' } });
  assert.equal(moved?.applied, true);
  assert.equal(moved?.plan.stressCost, 0);
  assert.equal(service.getCharacter(character.id)?.domainCards.find((card) => card.id === 'vault-card')?.loadoutChoicePending, false);
  assert.equal(service.getCharacter(character.id)?.changeHistory?.at(-1)?.kind, 'cardMove');
});

test('permanent Vault stays auditable and can be restored through history undo', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ domainCards: cards(2) });
  assert.equal(service.permanentlyVaultDomainCard(character.id, 'card-1', {
    actor: { id: 'player', name: 'Player', role: 'player' }
  }), true);

  const changed = service.getCharacter(character.id)!;
  const record = changed.changeHistory?.at(-1);
  assert.equal(changed.domainCards.find((card) => card.id === 'card-1')?.permanentlyVaulted, true);
  assert.equal(record?.kind, 'cardMove');

  const undo = service.undoChange(character.id, record!.id, { id: 'gm', name: 'GM', role: 'gm' });
  assert.equal(undo?.status, 'applied');
  const restored = service.getCharacter(character.id)!;
  assert.equal(restored.domainCards.find((card) => card.id === 'card-1')?.permanentlyVaulted, false);
  assert.equal(restored.domainCards.find((card) => card.id === 'card-1')?.inLoadout, true);
});

test('a full-Hand acquisition remains an explicit free choice and can be kept in Vault', () => {
  const existing = cards(5);
  const [newCard] = cards(1).map((card) => ({ ...card, id: 'new-card', name: 'New card', recallCost: 'Стресс 3' }));
  const domainCards = placeAcquiredDomainCards(existing, [newCard]);
  const character = createCharacter({ domainCards, stress: { marked: 5, max: 6 } });
  assert.equal(character.domainCards.find((card) => card.id === 'new-card')?.loadoutChoicePending, true);

  const replacement = applyDomainCardMove(character, {
    cardId: 'new-card', to: 'hand', context: 'levelUp', replaceCardId: 'card-1'
  });
  assert.equal(replacement.applied, true);
  assert.equal(replacement.plan.stressCost, 0);
  assert.equal(replacement.character.stress.marked, 5);
  assert.equal(replacement.character.domainCards.find((card) => card.id === 'new-card')?.inLoadout, true);
  assert.equal(replacement.character.domainCards.find((card) => card.id === 'new-card')?.loadoutChoicePending, false);

  const kept = applyDomainCardMove(character, { cardId: 'new-card', to: 'vault', context: 'levelUp' });
  assert.equal(kept.applied, true);
  assert.equal(kept.character.domainCards.find((card) => card.id === 'new-card')?.inLoadout, false);
  assert.equal(kept.character.domainCards.find((card) => card.id === 'new-card')?.loadoutChoicePending, false);
});

test('CharacterService uses the persisted Hand modifier for every move and ignores request-only escalation', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    domainCards: cards(7),
    ruleModifiers: [{ id: 'feature:hand-six', kind: 'handSize', source: 'feature', label: 'Hand six', amount: 1 }]
  });
  assert.equal(character.domainCards.filter((card) => card.inLoadout).length, 6);

  const full = service.moveDomainCard(character.id, {
    cardId: 'card-7',
    to: 'hand',
    context: 'rest'
  });
  assert.equal(full?.applied, false);
  assert.equal(full?.plan.handLimit, 6);
  assert.equal(full?.plan.issues.some((issue) => issue.code === 'hand.full'), true);

  service.moveDomainCard(character.id, { cardId: 'card-1', to: 'vault', context: 'rest' });
  const recalled = service.moveDomainCard(character.id, {
    cardId: 'card-7',
    to: 'hand',
    context: 'rest',
    modifiers: [{ id: 'request-only', kind: 'handSize', source: 'manual', label: 'Request only', amount: 20 }]
  });
  assert.equal(recalled?.applied, true);
  assert.equal(recalled?.plan.handLimit, 6);
  assert.equal(service.getCharacter(character.id)?.domainCards.filter((card) => card.inLoadout).length, 6);
});
