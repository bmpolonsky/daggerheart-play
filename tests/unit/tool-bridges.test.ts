import { test } from "vitest";
import assert from "node:assert/strict";
import { customCardToCharacterDomainCard, normalizeCardCreatorCustomCardPayload } from "../../src/domain/cardCreatorBridge/index";
import { createCardCreatorBridgeEvent, createCombatBuilderBridgeEvent, normalizeToolBridgeEvent } from "../../src/domain/toolBridge/index";

test('card creator bridge normalizes custom domain cards into character cards', () => {
  const payload = {
    id: 'custom-card-1',
    typeId: 'domain-card',
    cardFields: {
      slug: 'starfall',
      title: '  Starfall  ',
      description: 'Spend Hope to call down light.',
      dataDomain: 'Splendor',
      stressText: '1 Stress',
      label: 'Spell'
    },
    customImage: 'https://example.test/starfall.webp',
    baseCard: {
      id: 'starfall-base',
      level: 3,
      domainName: 'Grace',
      stressCost: 2
    },
    updatedAt: 123
  };

  const normalized = normalizeCardCreatorCustomCardPayload(payload);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.card?.title, 'Starfall');
  assert.equal(normalized.card?.domain, 'Splendor');
  assert.equal(normalized.card?.cost, '1 Stress');

  const converted = customCardToCharacterDomainCard(payload);
  assert.equal(converted.warnings.length, 0);
  assert.equal(converted.card?.id, 'card-creator:custom-card-1');
  assert.equal(converted.card?.name, 'Starfall');
  assert.equal(converted.card?.domain, 'Splendor');
  assert.equal(converted.card?.level, 3);
  assert.equal(converted.card?.imageUrl, 'https://example.test/starfall.webp');
});

test('tool bridge validates card creator and combat builder events without UI', () => {
  const cardEvent = createCardCreatorBridgeEvent({
    id: 'custom-card-2',
    typeId: 'domain-card',
    cardFields: { title: 'Moonlit Step', description: 'Move silently.', dataDomain: 'Midnight' },
    baseCard: { level: 2 }
  });
  const normalizedCardEvent = normalizeToolBridgeEvent(cardEvent);
  assert.equal(normalizedCardEvent.ok, true);
  if (normalizedCardEvent.event?.type !== 'card-creator/custom-card.export') {
    assert.fail('Expected normalized card creator export event');
  }
  assert.equal(normalizedCardEvent.event.payload.title, 'Moonlit Step');

  const combatEvent = createCombatBuilderBridgeEvent({
    entries: [{
      count: 1,
      adversary: { id: 11, tier: 1, name: 'Scout', hp: 3, stress: 1 }
    }]
  });
  const normalizedCombatEvent = normalizeToolBridgeEvent(combatEvent);
  assert.equal(normalizedCombatEvent.ok, true);
  assert.equal(normalizedCombatEvent.event?.type, 'combat-builder/encounter.export');

  const rejected = normalizeToolBridgeEvent({ version: 1, source: 'unknown', target: 'tabletop', type: 'bad', payload: {} });
  assert.equal(rejected.ok, false);
});
