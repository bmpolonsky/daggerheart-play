import { test } from "vitest";
import assert from "node:assert/strict";
import { parseDomainCardTextMacros } from "../../src/domain/rules/domainCards";
import { createInventoryItem } from "../../src/domain/rules/factories";
import { buildCharacterSidecarModel, sheetCardKindLabel } from "../../src/domain/rules/sidecar";
import { buildDomainCardPreviewFeedItem } from "../../src/domain/tabletop/feed";
import { resetAllStores, feedStore } from "../../src/stores/gameStores";
import { characterService, feedService } from "../../src/services/serviceRegistry";
import { starterDomainCardsFromLibrary } from "../../src/domain/characterBuilder/index";
import { firstCharacter, genericItem } from "./helpers";

test('domain card token controls stay explicit and separate from card publication', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.addDomainCard(character.id, {
    id: 'token-card',
    name: 'Token Card',
    cost: '2 tokens',
    text: '',
    inLoadout: true,
    tokens: { value: 1, max: 6 }
  });

  assert.equal(characterService.getCharacter(character.id)?.domainCards.find((card) => card.id === 'token-card')?.tokens.value, 1);
  characterService.updateDomainCardTokens(character.id, 'token-card', 3);
  assert.equal(characterService.getCharacter(character.id)?.domainCards.find((card) => card.id === 'token-card')?.tokens.value, 3);
});

test('starter domain cards come from library data and can seed empty characters', () => {
  resetAllStores();
  const character = firstCharacter();
  const libraryCards = [
    genericItem({ id: 'card-grace', name: 'Grace Card', imageUrl: '/card.png', raw: { domain_name: 'Grace', level: 1 } }),
    genericItem({ id: 'card-codex', name: 'Codex Card', raw: { domain_name: 'Codex', level: 1 } }),
    genericItem({ id: 'card-blade', name: 'Blade Card', raw: { domain_name: 'Blade', level: 1 } })
  ];

  const planned = starterDomainCardsFromLibrary(libraryCards, character.domains);
  assert.deepEqual(planned.map((card) => card.id), ['card-grace', 'card-codex']);
  assert.equal(planned[0].imageUrl, '/card.png');

  assert.equal(characterService.ensureStarterDomainCardsFromLibrary(character.id, libraryCards), true);
  assert.deepEqual(characterService.getCharacter(character.id)?.domainCards.map((card) => card.id), ['card-grace', 'card-codex']);
  assert.equal(characterService.ensureStarterDomainCardsFromLibrary(character.id, libraryCards), false);
});

test('domain card ephemeral previews use raw card text and inline macros without writing feed', () => {
  resetAllStores();
  const character = firstCharacter();
  characterService.setHope(character.id, 2);
  characterService.addDomainCard(character.id, {
    id: 'aura-card',
    name: 'Aura Card',
    cost: '1 Hope',
    recallCost: 'Стресс 1',
    text: 'Потратьте Надежду. Бросок Заклинания (12). Until the scene ends, allies nearby glow.',
    inLoadout: true
  });
  const card = characterService.getCharacter(character.id)?.domainCards.find((item) => item.id === 'aura-card');
  if (!card) {
    assert.fail('Expected card to be present');
  }

  const preview = buildDomainCardPreviewFeedItem({
    id: 'ephemeral-card-preview',
    createdAt: '2026-05-30T00:00:00.000Z',
    authorName: character.name,
    card,
    actor: {
      actorId: character.id,
      actorName: character.name,
      actorType: 'character'
    }
  });

  assert.equal(feedService.feedStore.getSnapshot().length, 0);
  assert.equal(preview.kind, 'card');
  assert.equal(preview.ephemeral, true);
  assert.equal(preview.publication, 'private');
  assert.equal(preview.body, 'Потратьте Надежду. Бросок Заклинания (12). Until the scene ends, allies nearby glow.');
  assert.doesNotMatch(preview.body, /Recall|ресурсы не списаны|Макрос/i);
  assert.equal(characterService.getCharacter(character.id)?.hope.value, 2);
  assert.equal(preview.actor?.actorId, character.id);
  assert.equal(preview.card?.text.includes('Бросок Заклинания'), true);
  assert.deepEqual(parseDomainCardTextMacros(preview.card?.text ?? '').map((macro) => macro.kind), ['spendHope', 'actionRoll']);
});

test('character sidecar model separates loadout cards and feature sections outside UI', () => {
  resetAllStores();
  const character = firstCharacter();
  character.domainCards = [
    { id: 'archive', name: 'Archived', domain: 'Arcana', level: 2, text: '', inLoadout: false, tokens: { value: 0, max: 0 } },
    { id: 'hand', name: 'Hand', domain: 'Blade', level: 1, text: '', inLoadout: true, tokens: { value: 0, max: 0 } }
  ];
  character.sheetCards = [
    { id: 'ancestry-card', kind: 'ancestry', name: 'Ancestry Card' },
    { id: 'community-card', kind: 'community', name: 'Community Card' },
    { id: 'subclass-card', kind: 'subclass', name: 'Subclass Card' },
    { id: 'community', kind: 'communityFeature', name: 'Community' },
    { id: 'class', kind: 'classFeature', name: 'Class' },
    { id: 'subclass-feature', kind: 'subclassFeature', name: 'Subclass Feature' },
    { id: 'domain', kind: 'domainCard', name: 'Domain Card' },
    { id: 'item', kind: 'item', name: 'Utility Item' },
    { id: 'note', kind: 'note', name: 'Sheet Note' }
  ];
  character.experiences = [
    { id: 'low', name: 'Low', modifier: 1 },
    { id: 'high', name: 'High', modifier: 3 }
  ];
  character.weapons = [
    { id: 'blade', name: 'Blade', trait: 'agility', range: 'Melee', damageFormula: '1d8+1', damageType: 'physical' }
  ];
  character.inventory = [
    createInventoryItem({ name: 'Rope' }),
    createInventoryItem({ name: 'Minor Health Potion', kind: 'consumable', uses: { current: 1, max: 1 } })
  ];
  character.armor = {
    name: 'Chainmail',
    baseMajor: 7,
    baseSevere: 15,
    score: 3,
    markedSlots: 1,
    feature: 'Heavy'
  };

  const model = buildCharacterSidecarModel(character);
  assert.deepEqual(model.loadoutCards.map((card) => card.id), ['hand']);
  assert.deepEqual(model.archivedCards.map((card) => card.id), ['archive']);
  assert.deepEqual(model.features.map((card) => card.id), ['class', 'subclass-feature', 'community']);
  assert.deepEqual(model.experiences.map((experience) => experience.id), ['high', 'low']);
  assert.deepEqual(model.actions.weapons.map((weapon) => weapon.id), ['blade']);
  assert.deepEqual(model.weapons.map((weapon) => weapon.id), ['blade']);
  assert.deepEqual(model.gear.inventory.map((item) => item.name), ['Rope', 'Minor Health Potion']);
  assert.deepEqual(model.inventory.map((item) => item.name), ['Rope', 'Minor Health Potion']);
  assert.equal(model.gear.armor.name, 'Chainmail');
  assert.equal(model.hasActions, true);
  assert.equal(model.hasGear, true);
  assert.equal(model.hasFeatures, true);
  assert.equal(model.overviewResources.find((resource) => resource.id === 'armor')?.value, 2);
  assert.deepEqual(model.traits.map((trait) => trait.id), ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge']);
  assert.equal(sheetCardKindLabel('communityFeature'), 'Сообщество');
});

test('character sidecar keeps experiences out of the Features section', () => {
  resetAllStores();
  const character = firstCharacter();
  character.sheetCards = [
    { id: 'domain', kind: 'domainCard', name: 'Domain Card' },
    { id: 'item', kind: 'item', name: 'Utility Item' },
    { id: 'note', kind: 'note', name: 'Sheet Note' }
  ];
  character.experiences = [
    { id: 'exp', name: 'Scout', modifier: 2 }
  ];

  const model = buildCharacterSidecarModel(character);
  assert.deepEqual(model.features, []);
  assert.deepEqual(model.experiences.map((experience) => experience.id), ['exp']);
  assert.equal(model.hasFeatures, false);
});
