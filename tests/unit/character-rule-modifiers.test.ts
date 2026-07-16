import { test } from 'vitest';
import assert from 'node:assert/strict';
import subclassesPayload from '../../public/data/subclasses.json';
import { mapGenericItem } from '../../src/domain/content/mappers';
import type { RawContentItem } from '../../src/domain/content/types';
import {
  characterHandSize,
  characterBuilderRuleModifiersForSubclass,
  normalizeCharacterRuleModifiers,
  startingDomainCardCount
} from '../../src/domain/rules/characterRuleModifiers';
import { buildCharacterBuilderCatalog, buildCharacterBuilderQuickStart } from '../../src/domain/characterBuilder/catalog';
import { buildCharacterDraft } from '../../src/domain/characterBuilder';
import { validateCharacterBuilderReadiness } from '../../src/domain/characterBuilder/validation';
import { equipmentFixture, genericItem } from './helpers';
import { CharacterService } from '../../src/services/CharacterService';
import { resetAllStores } from '../../src/stores/gameStores';
import { createDomainCard } from '../../src/domain/rules/factories';
import { buildCharacterSummary } from '../../src/domain/tabletop/playerView';
import { migratePersistedState } from '../../src/domain/migrations/persistedState';
import { snapshotPersistedState } from '../../src/stores/persistedState';

test('local SRD School of Knowledge grants a third starting card through a stable feature modifier', () => {
  const raw = (subclassesPayload.data as RawContentItem[]).find((item) => item.slug === 'school-of-knowledge');
  assert.ok(raw, 'public/data/subclasses.json must contain school-of-knowledge');
  const subclass = mapGenericItem(raw, 'subclass');
  const modifiers = characterBuilderRuleModifiersForSubclass(subclass);
  assert.deepEqual(modifiers.map((modifier) => ({ kind: modifier.kind, amount: modifier.amount })), [
    { kind: 'startingDomainCards', amount: 1 }
  ]);
  assert.equal(startingDomainCardCount(modifiers), 3);
});

test('School of Knowledge quick start and readiness require exactly three valid level-one domain cards', () => {
  const raw = (subclassesPayload.data as RawContentItem[]).find((item) => item.slug === 'school-of-knowledge');
  assert.ok(raw);
  const subclass = mapGenericItem(raw, 'subclass');
  const content = {
    ancestries: [genericItem({ id: 'ancestry', name: 'Human' })],
    communities: [genericItem({ id: 'community', name: 'Highborne' })],
    subclasses: [subclass],
    domainCards: [
      genericItem({ id: 'codex-1', name: 'Codex One', raw: { domain_slug: 'codex', level: 1 } }),
      genericItem({ id: 'codex-2', name: 'Codex Two', raw: { domain_slug: 'codex', level: 1 } }),
      genericItem({ id: 'splendor-1', name: 'Splendor One', raw: { domain_slug: 'splendor', level: 1 } }),
      genericItem({ id: 'splendor-2', name: 'Splendor Two', raw: { domain_slug: 'splendor', level: 1 } })
    ]
  };
  const catalog = buildCharacterBuilderCatalog({ content, classes: [], equipment: equipmentFixture(), className: 'Wizard' });
  const quick = buildCharacterBuilderQuickStart(catalog);
  assert.equal(quick.selectedCardIds.length, 3);

  const base = {
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Wizard' as const,
    ancestryId: quick.ancestryId,
    communityId: quick.communityId,
    subclassId: quick.subclassId,
    experienceNames: ['Scholar', 'Explorer'],
    armorId: quick.armorId,
    primaryWeaponId: quick.primaryWeaponId,
    secondaryWeaponId: quick.secondaryWeaponId,
    classItem: quick.classItem,
    consumableId: quick.consumableId
  };
  assert.equal(validateCharacterBuilderReadiness({ ...base, selectedCardIds: quick.selectedCardIds }).canCreate, true);
  const onlyTwo = validateCharacterBuilderReadiness({ ...base, selectedCardIds: quick.selectedCardIds.slice(0, 2) });
  assert.equal(onlyTwo.canCreate, false);
  assert.equal(onlyTwo.issues.some((issue) => issue.id === 'domainCards.required'), true);
});

test('a matching name or unregistered homebrew text never silently executes the SRD modifier', () => {
  const impostor = genericItem({
    id: 'impostor',
    name: 'School of Knowledge',
    slug: 'homebrew-knowledge',
    raw: {
      foundation_features: [{ id: 208, name: 'Подготовленный', main_body: 'Возьмите карту.' }]
    }
  });
  const missingFeature = genericItem({
    id: 'missing',
    name: 'School of Knowledge',
    slug: 'school-of-knowledge',
    raw: { foundation_features: [] }
  });
  assert.deepEqual(characterBuilderRuleModifiersForSubclass(impostor), []);
  assert.deepEqual(characterBuilderRuleModifiersForSubclass(missingFeature), []);
});

test('starter-card service consumes the same subclass modifier instead of a hardcoded class name', () => {
  resetAllStores();
  const service = new CharacterService();
  const raw = (subclassesPayload.data as RawContentItem[]).find((item) => item.slug === 'school-of-knowledge');
  assert.ok(raw);
  const subclass = mapGenericItem(raw, 'subclass');
  const library = [
    genericItem({ id: 'codex-a', raw: { domain_slug: 'codex', level: 1 } }),
    genericItem({ id: 'codex-b', raw: { domain_slug: 'codex', level: 1 } }),
    genericItem({ id: 'splendor-a', raw: { domain_slug: 'splendor', level: 1 } }),
    genericItem({ id: 'splendor-b', raw: { domain_slug: 'splendor', level: 1 } })
  ];
  const character = service.createCharacter({ className: 'Wizard', domains: ['Codex', 'Splendor'], subclassSlug: subclass.slug });
  assert.equal(service.ensureStarterDomainCardsFromLibrary(character.id, library, undefined, subclass), true);
  assert.equal(service.getCharacter(character.id)?.domainCards.length, 3);
  assert.deepEqual(service.getCharacter(character.id)?.ruleModifiers.map((modifier) => modifier.id), [
    'school-of-knowledge:prepared:starting-domain-card'
  ]);
});

test('builder persists subclass rule modifiers on the resulting Character draft', () => {
  const raw = (subclassesPayload.data as RawContentItem[]).find((item) => item.slug === 'school-of-knowledge');
  assert.ok(raw);
  const subclass = mapGenericItem(raw, 'subclass');
  const content = {
    ancestries: [genericItem({ id: 'ancestry', name: 'Human' })],
    communities: [genericItem({ id: 'community', name: 'Highborne' })],
    subclasses: [subclass],
    domainCards: [
      genericItem({ id: 'codex-1', raw: { domain_slug: 'codex', level: 1 } }),
      genericItem({ id: 'codex-2', raw: { domain_slug: 'codex', level: 1 } }),
      genericItem({ id: 'splendor-1', raw: { domain_slug: 'splendor', level: 1 } })
    ],
    beastforms: []
  };
  const result = buildCharacterDraft({
    content,
    classes: [],
    equipment: equipmentFixture(),
    className: 'Wizard',
    ancestryId: 'ancestry',
    communityId: 'community',
    subclassId: subclass.id,
    selectedCardIds: ['codex-1', 'codex-2', 'splendor-1']
  });
  assert.deepEqual(result.draft.ruleModifiers?.map((modifier) => modifier.id), [
    'school-of-knowledge:prepared:starting-domain-card'
  ]);
});

test('persisted modifiers are normalized, bounded and drive Hand capacity and its player summary', () => {
  resetAllStores();
  const service = new CharacterService();
  const cards = Array.from({ length: 8 }, (_, index) => createDomainCard({
    id: `card-${index + 1}`,
    domain: 'Codex',
    inLoadout: true
  }));
  const character = service.createCharacter({
    domainCards: cards,
    ruleModifiers: [
      { id: 'feature:expanded-hand', kind: 'handSize', source: 'feature', label: 'Expanded Hand', amount: 2 },
      { id: 'feature:expanded-hand', kind: 'handSize', source: 'feature', label: 'Duplicate', amount: 10 },
      { id: 'homebrew:bounded', kind: 'levelUpChoices', source: 'homebrew', label: 'Bounded', amount: 999 }
    ]
  });
  assert.equal(character.ruleModifiers.length, 2);
  assert.equal(character.ruleModifiers.find((modifier) => modifier.id === 'homebrew:bounded')?.amount, 20);
  assert.equal(characterHandSize(character.ruleModifiers), 7);
  assert.equal(character.domainCards.filter((card) => card.inLoadout).length, 7);
  assert.equal(buildCharacterSummary(character).handLimit, 7);

  service.updateRuleModifiers(character.id, []);
  const reduced = service.getCharacter(character.id)!;
  assert.equal(reduced.domainCards.filter((card) => card.inLoadout).length, 5);
  assert.equal(buildCharacterSummary(reduced).handLimit, 5);
});

test('normalizer rejects unknown executable rules and malformed choice-specific modifiers', () => {
  const normalized = normalizeCharacterRuleModifiers([
    { id: 'valid', kind: 'handSize', source: 'manual', label: 'Valid', amount: 1.9 },
    { id: 'unknown', kind: 'runCode', source: 'homebrew', label: 'Unknown', amount: 5 },
    { id: 'bad-choice', kind: 'advancementChoiceLimit', source: 'homebrew', label: 'Bad', choice: 'manual', amount: 1 },
    { id: 'not-finite', kind: 'levelUpChoices', source: 'feature', label: 'Bad', amount: Number.NaN }
  ]);
  assert.deepEqual(normalized, [
    { id: 'valid', kind: 'handSize', source: 'manual', label: 'Valid', amount: 1 }
  ]);
});

test('current persisted games normalize character modifiers before hydration', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({ name: 'Persisted Rules' });
  const snapshot = snapshotPersistedState();
  const malformed = {
    ...snapshot,
    characters: {
      ...snapshot.characters,
      entities: {
        ...snapshot.characters.entities,
        [character.id]: {
          ...snapshot.characters.entities[character.id],
          ruleModifiers: [
            { id: 'saved-hand', kind: 'handSize', source: 'homebrew', label: 'Saved Hand', amount: 2.8 },
            { id: 'unsafe', kind: 'script', source: 'homebrew', label: 'Unsafe', amount: 10 }
          ]
        }
      }
    }
  };
  const migrated = migratePersistedState(malformed);
  assert.deepEqual(migrated.characters.entities[character.id]?.ruleModifiers, [
    { id: 'saved-hand', kind: 'handSize', source: 'homebrew', label: 'Saved Hand', amount: 2 }
  ]);
});

test('trusted player snapshots cannot rewrite GM-managed character rules', () => {
  resetAllStores();
  const service = new CharacterService();
  const character = service.createCharacter({
    ruleModifiers: [{ id: 'gm-hand', kind: 'handSize', source: 'manual', label: 'GM Hand', amount: 1 }]
  });
  const edited = {
    ...character,
    name: 'Player edit',
    ruleModifiers: [{ id: 'player-hand', kind: 'handSize' as const, source: 'manual' as const, label: 'Player Hand', amount: 20 }]
  };
  assert.equal(service.applyTrustedPlayerUpdate(character.id, edited, { id: 'seat-1', name: 'Player', role: 'player' }), true);
  const updated = service.getCharacter(character.id)!;
  assert.equal(updated.name, 'Player edit');
  assert.deepEqual(updated.ruleModifiers, character.ruleModifiers);
});

test('changing a catalog subclass replaces only subclass-owned rules', () => {
  resetAllStores();
  const service = new CharacterService();
  const raw = (subclassesPayload.data as RawContentItem[]).find((item) => item.slug === 'school-of-knowledge');
  assert.ok(raw);
  const school = mapGenericItem(raw, 'subclass');
  const character = service.createCharacter({
    ruleModifiers: [{ id: 'manual-hand', kind: 'handSize', source: 'manual', label: 'Manual Hand', amount: 1 }]
  });
  service.updateSubclassFromLibrary(character.id, school);
  let updated = service.getCharacter(character.id)!;
  assert.equal(updated.subclassSlug, 'school-of-knowledge');
  assert.equal(updated.ruleModifiers.some((modifier) => modifier.kind === 'startingDomainCards' && modifier.source === 'subclass'), true);
  assert.equal(updated.ruleModifiers.some((modifier) => modifier.id === 'manual-hand'), true);

  service.updateSubclassFromLibrary(character.id, null);
  updated = service.getCharacter(character.id)!;
  assert.equal(updated.ruleModifiers.some((modifier) => modifier.source === 'subclass'), false);
  assert.equal(updated.ruleModifiers.some((modifier) => modifier.id === 'manual-hand'), true);
});
