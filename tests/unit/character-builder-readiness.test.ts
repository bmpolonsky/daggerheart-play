import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCharacterDraft } from "../../src/domain/characterBuilder/index";
import { validateCharacterBuilderReadiness } from "../../src/domain/characterBuilder/validation";
import { buildCharacterBuilderCatalog, buildCharacterBuilderQuickStart } from "../../src/domain/characterBuilder/catalog";
import type { ContentState } from "../../src/domain/content/types";
import { CLASS_RECOMMENDED_TRAITS } from "../../src/domain/rules/constants";
import { classItem, equipmentFixture, genericItem } from "./helpers";

test('character builder drafts bounded class-valid selections', () => {
  const ancestry = genericItem({ id: 'ancestry-1', name: 'Ribbet', imageUrl: '/ribbet.png' });
  const community = genericItem({ id: 'community-1', name: 'Wildborne' });
  const subclass = genericItem({ id: 'sub-bard', name: 'Troubadour', imageUrl: '/troubadour.png', raw: { class_slug: 'bard' } });
  const validCard = genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } });
  const invalidDomain = genericItem({ id: 'card-blade', name: 'Blade Card', raw: { domain_name: 'Blade', level: 1 } });
  const tooHighLevel = genericItem({ id: 'card-codex-2', name: 'Codex 2', raw: { domain_name: 'Codex', level: 2 } });
  const content: ContentState['generic'] = {
    ancestries: [ancestry],
    communities: [community],
    subclasses: [subclass],
    domainCards: [validCard, invalidDomain, tooHighLevel]
  };

  const result = buildCharacterDraft({
    content,
    equipment: equipmentFixture(),
    name: '  ',
    playerName: ' Player ',
    className: 'Bard',
    ancestryId: 'ancestry-1',
    communityId: 'community-1',
    subclassId: 'sub-bard',
    selectedCardIds: ['card-grace', 'card-blade', 'card-codex-2'],
    experienceNames: ['Scout', ''],
    now: () => 42
  });

  assert.equal(result.draft.name, 'Новый герой');
  assert.equal(result.draft.playerName, 'Player');
  assert.equal(result.draft.subclassName, 'Troubadour');
  assert.equal(result.draft.ancestry, 'Ribbet');
  assert.deepEqual(result.draft.domains, ['Codex', 'Grace']);
  assert.deepEqual(result.draft.domainCards?.map((card) => card.id), ['card-grace']);
  assert.deepEqual(result.draft.experiences?.map((experience) => experience.name), ['Scout', 'Верный товарищ']);
  assert.equal(result.draft.portraitUrl, '/ribbet.png');
  assert.equal(result.warnings.length, 3);
});

test('character builder draft does not select required library choices by default', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet', imageUrl: '/ribbet.png' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: []
  };

  const result = buildCharacterDraft({
    content,
    equipment: equipmentFixture(),
    className: 'Bard'
  });

  assert.equal(result.selections.ancestry, null);
  assert.equal(result.selections.community, null);
  assert.equal(result.selections.subclass, null);
  assert.equal(result.draft.ancestry, '');
  assert.equal(result.draft.community, '');
  assert.equal(result.draft.subclassName, '');
  assert.equal(result.draft.portraitUrl, '');
});

test('character builder recommended traits follow class guides', () => {
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Bard, { agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Druid, { agility: 1, strength: 0, finesse: 1, instinct: 2, presence: -1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Guardian, { agility: 1, strength: 2, finesse: -1, instinct: 0, presence: 1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Ranger, { agility: 2, strength: 0, finesse: 1, instinct: 1, presence: -1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Rogue, { agility: 1, strength: -1, finesse: 2, instinct: 0, presence: 1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Seraph, { agility: 0, strength: 2, finesse: 0, instinct: 1, presence: 1, knowledge: -1 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Sorcerer, { agility: 0, strength: -1, finesse: 1, instinct: 2, presence: 1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Warrior, { agility: 2, strength: 1, finesse: 0, instinct: 1, presence: -1, knowledge: 0 });
  assert.deepEqual(CLASS_RECOMMENDED_TRAITS.Wizard, { agility: -1, strength: 0, finesse: 0, instinct: 1, presence: 1, knowledge: 2 });
});

test('character builder readiness blocks incomplete required selections', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: [
      genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } }),
      genericItem({ id: 'card-codex', name: 'Codex Card', raw: { domain_name: 'Codex', level: 1 } })
    ]
  };

  const readiness = validateCharacterBuilderReadiness({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Bard',
    ancestryId: '',
    communityId: 'missing-community',
    subclassId: 'sub-bard',
    selectedCardIds: ['card-grace'],
    experienceNames: ['Scout', ''],
    armorId: 'leather-armor',
    primaryWeaponId: 'broadsword',
    secondaryWeaponId: 'tower-shield',
    classItem: 'Любовный роман',
    consumableId: 'minor-health-potion'
  });

  assert.equal(readiness.canCreate, false);
  assert.deepEqual(readiness.issues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.id), [
    'ancestry.required',
    'community.invalid',
    'domainCards.required',
    'experiences.required'
  ]);
});

test('character builder readiness allows complete bounded start and warns on soft issues', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: [
      genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } }),
      genericItem({ id: 'card-codex', name: 'Codex Card', raw: { domain_name: 'Codex', level: 1 } }),
      genericItem({ id: 'card-blade', name: 'Blade Card', raw: { domain_name: 'Blade', level: 1 } })
    ]
  };

  const readiness = validateCharacterBuilderReadiness({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Bard',
    ancestryId: 'ancestry-1',
    communityId: 'community-1',
    subclassId: 'sub-bard',
    selectedCardIds: ['card-grace', 'card-codex'],
    experienceNames: ['Scout', 'scout'],
    armorId: 'leather-armor',
    primaryWeaponId: 'broadsword',
    secondaryWeaponId: 'tower-shield',
    classItem: 'Любовный роман',
    consumableId: 'minor-health-potion'
  });

  assert.equal(readiness.canCreate, true);
  assert.deepEqual(readiness.issues.map((issue) => issue.id), ['experiences.duplicate']);
});

test('character builder readiness validates starting trait distribution before modifiers', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: [
      genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } }),
      genericItem({ id: 'card-codex', name: 'Codex Card', raw: { domain_name: 'Codex', level: 1 } })
    ]
  };

  const readiness = validateCharacterBuilderReadiness({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Bard',
    ancestryId: 'ancestry-1',
    communityId: 'community-1',
    subclassId: 'sub-bard',
    selectedCardIds: ['card-grace', 'card-codex'],
    experienceNames: ['Scout', 'Friend'],
    traits: { agility: 2, strength: 2, finesse: 1, instinct: 0, presence: 0, knowledge: -1 },
    armorId: 'leather-armor',
    primaryWeaponId: 'broadsword',
    secondaryWeaponId: 'tower-shield',
    classItem: 'Любовный роман',
    consumableId: 'minor-health-potion'
  });

  assert.equal(readiness.canCreate, false);
  assert.equal(readiness.issues.find((issue) => issue.id === 'traits.distribution')?.severity, 'blocking');
});

test('character builder readiness blocks creation when class starter cards are unavailable', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: [genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } })]
  };

  const readiness = validateCharacterBuilderReadiness({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Bard',
    ancestryId: 'ancestry-1',
    communityId: 'community-1',
    subclassId: 'sub-bard',
    selectedCardIds: ['card-grace'],
    experienceNames: ['Scout', 'Friend'],
    armorId: 'leather-armor',
    primaryWeaponId: 'broadsword',
    secondaryWeaponId: 'tower-shield',
    classItem: 'Любовный роман',
    consumableId: 'minor-health-potion'
  });

  assert.equal(readiness.canCreate, false);
  assert.equal(readiness.issues.find((issue) => issue.id === 'domainCards.unavailable')?.severity, 'blocking');
});

test('character builder quick start derives a complete starter selection outside UI', () => {
  const content: ContentState['generic'] = {
    ancestries: [genericItem({ id: 'ancestry-1', name: 'Ribbet' })],
    communities: [genericItem({ id: 'community-1', name: 'Wildborne' })],
    subclasses: [genericItem({ id: 'sub-bard', name: 'Troubadour', raw: { class_slug: 'bard' } })],
    domainCards: [
      genericItem({ id: 'card-grace', name: 'Grace Card', raw: { domain_name: 'Grace', level: 1 } }),
      genericItem({ id: 'card-codex', name: 'Codex Card', raw: { domain_name: 'Codex', level: 1 } }),
      genericItem({ id: 'card-blade', name: 'Blade Card', raw: { domain_name: 'Blade', level: 1 } })
    ]
  };

  const catalog = buildCharacterBuilderCatalog({ content, classes: [], equipment: equipmentFixture(), className: 'Bard' });
  const quick = buildCharacterBuilderQuickStart(catalog);
  const readiness = validateCharacterBuilderReadiness({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Bard',
    ancestryId: quick.ancestryId,
    communityId: quick.communityId,
    subclassId: quick.subclassId,
    selectedCardIds: quick.selectedCardIds,
    experienceNames: ['Scout', 'Friend'],
    armorId: quick.armorId,
    primaryWeaponId: quick.primaryWeaponId,
    secondaryWeaponId: quick.secondaryWeaponId,
    classItem: quick.classItem,
    consumableId: quick.consumableId
  });

  assert.deepEqual(quick.selectedCardIds, ['card-grace', 'card-codex']);
  assert.equal(readiness.canCreate, true);
});
