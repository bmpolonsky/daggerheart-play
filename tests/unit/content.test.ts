import { test } from "vitest";
import assert from "node:assert/strict";
import { ContentService } from "../../src/services/ContentService";
import { applyBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";
import { createContentState } from "../../src/stores/contentStore";
import { cleanRulesText, coerceDomainName, domainCardFromLibrary, isDomainCardForDomains, isSubclassForClass } from "../../src/domain/characterBuilder/index";
import { queryLibraryContent } from "../../src/domain/content/query";
import { createAdversaryFromLibrary, mapGenericItem, mapRawAdversary, mapRawClassItem, mapRawEquipmentItem } from "../../src/domain/content/mappers";
import { buildApiCollectionUrl, createContentManifest, summarizeContentSources } from "../../src/domain/content/source";
import { genericItem } from "./helpers";

test('character builder maps and cleans library items without UI state', () => {
  const card = genericItem({
    id: 'card-arcana',
    name: 'Arcane Strike',
    subtitle: 'Arcana 1',
    body: '[Spend 2 Hope](https://example.test) to **strike**.\n\n\n#{Hidden}#',
    raw: { domain_slug: 'arcana', level: '1', stress_cost: 1, card_type: 'Spell' }
  });
  const structuredCostCard = genericItem({
    id: 'card-grace',
    name: 'Structured Cost',
    body: 'Spend 2 Hope in the text should stay textual.',
    raw: { domain_slug: 'grace', level: 1, activation_cost: '1 Hope' }
  });
  const subclass = genericItem({ id: 'sub-bard', raw: { class_name: 'Бард' } });

  assert.equal(coerceDomainName('Аркана'), 'Arcana');
  assert.equal(coerceDomainName('unknown'), null);
  assert.equal(isSubclassForClass(subclass, 'Bard'), true);
  assert.equal(isDomainCardForDomains(card, ['Arcana']), true);
  assert.equal(cleanRulesText(card.body), 'Spend 2 Hope to strike.\n\nHidden');

  const mapped = domainCardFromLibrary(card, true);
  assert.equal(mapped.domain, 'Arcana');
  assert.equal(mapped.level, 1);
  assert.equal(mapped.cost, '');
  assert.equal(mapped.recallCost, 'Стресс 1');
  assert.equal(domainCardFromLibrary(structuredCostCard, true).cost, 'Надежда 1');
});

test('content mappers retain both summaries and full rule text', () => {
  const classItem = mapRawClassItem({
    slug: 'bard',
    name: 'Бард',
    short_description: 'Короткое описание.',
    description: 'Полное описание класса.',
    post_description: 'Важное примечание.'
  });
  const subclass = mapGenericItem({
    slug: 'beastbound',
    name: 'Звериные узы',
    description: 'Короткое описание подкласса.',
    main_body: 'Полные правила спутника.'
  }, 'subclass');

  assert.equal(classItem.body, 'Короткое описание.\n\nПолное описание класса.\n\nВажное примечание.');
  assert.equal(subclass.body, 'Короткое описание подкласса.\n\nПолные правила спутника.');
});

test('content library query searches all compendium sections outside UI', () => {
  const adversary = {
    id: 'adv:1',
    sourceId: 1,
    slug: 'skeleton',
    name: 'Скелет',
    tier: 1,
    type: 'Standard' as const,
    roleName: 'Soldier',
    difficulty: 10,
    attackModifier: 1,
    hp: 3,
    stress: 2,
    thresholds: { major: 6, severe: 12 },
    damageFormula: '1d6',
    damageType: 'physical' as const,
    attackRange: 'Вплотную',
    weaponName: 'Меч',
    hordePerHp: null,
    summary: 'Костяной страж',
    motives: '',
    experiencesText: '',
    mainBody: '',
    imageUrl: null,
    featureCount: 0,
    raw: {}
  };
  const queried = queryLibraryContent({
    query: 'костяной',
    adversaries: [adversary],
    classes: [],
    references: [genericItem({ id: 'ref', name: 'Родословная' })],
    domainCards: [genericItem({ id: 'card', name: 'Костяной зов' })],
    equipment: [],
    rules: [],
    environments: [],
    beastforms: []
  });

  assert.deepEqual(queried.adversaries.map((item) => item.id), ['adv:1']);
  assert.deepEqual(queried.domainCards.map((item) => item.id), ['card']);
  assert.equal(queried.references.length, 0);
});

test('content library search includes a card effect even when its description is empty', () => {
  const card = genericItem({
    id: 'domain-card:chaos',
    name: 'Высвобождение хаоса',
    body: '',
    raw: { features: [{ name: null, main_body: 'Потратьте жетоны, чтобы нанести магический урон.' }] }
  });
  const queried = queryLibraryContent({
    query: 'жетоны',
    adversaries: [],
    classes: [],
    references: [],
    domainCards: [card],
    equipment: [],
    rules: [],
    environments: [],
    beastforms: []
  });

  assert.deepEqual(queried.domainCards.map((item) => item.id), ['domain-card:chaos']);
});

test('content library source filter separates corebook void and homebrew', () => {
  const service = new ContentService();
  const state = createContentState();
  state.selectedCollection = 'domainCards';
  state.generic.domainCards = [
    genericItem({ id: 'domain-card:core', name: 'Core Card', raw: { source_slugs: ['core', 'srd'] } }),
    genericItem({ id: 'domain-card:void', name: 'Void Card', raw: { source_slugs: ['playtest-the-void'] } }),
    genericItem({ id: 'domain-card:homebrew', name: 'Homebrew Card', raw: { source_slugs: ['custom'] } })
  ];

  state.sourceFilter = 'core';
  assert.deepEqual(service.buildLibraryView(state).genericItems.map((item) => item.id), ['domain-card:core']);

  state.sourceFilter = 'void';
  assert.deepEqual(service.buildLibraryView(state).genericItems.map((item) => item.id), ['domain-card:void']);

  state.sourceFilter = 'homebrew';
  assert.deepEqual(service.buildLibraryView(state).genericItems.map((item) => item.id), ['domain-card:homebrew']);
});

test('game source defaults follow The Void setting without resetting manual filters on collection changes', () => {
  const service = new ContentService();

  service.applyGameSourceDefaults('game-source-defaults', false);
  assert.equal(service.content$.get().sourceFilter, 'core');

  service.setSourceFilter('void');
  service.setSelectedCollection('rules');
  assert.equal(service.content$.get().sourceFilter, 'void');

  service.applyGameSourceDefaults('game-source-defaults', false);
  assert.equal(service.content$.get().sourceFilter, 'void');

  service.applyGameSourceDefaults('game-source-defaults', true);
  assert.equal(service.content$.get().sourceFilter, 'all');
});

test('equipment mapper preserves consumable uses', () => {
  const item = mapRawEquipmentItem({
    id: 'minor-potion',
    slug: 'minor-potion',
    name: 'Малое зелье',
    type_slug: 'consumable',
    uses: 1
  });

  assert.equal(item.uses, 1);
});

test('adversary mapper retains the Horde wounds-per-figure rule', () => {
  const horde = mapRawAdversary({
    id: 'zombie-pack',
    slug: 'zombie-pack',
    name: 'Стая зомби',
    tier: 1,
    type_slug: 'horde',
    type_name: 'Орда',
    horde_per_hp: 2
  });

  assert.equal(horde.hordePerHp, 2);
  assert.equal(createAdversaryFromLibrary(horde).hordePerHp, 2);
});

test('equipment mapper extracts fallback features without stat block noise', () => {
  const emptyFeatureWeapon = mapRawEquipmentItem({
    slug: 'crossbow',
    name: 'Арбалет',
    type_slug: 'primary-weapon',
    char_trait: 'finesse',
    range: 'far',
    damage_ty: 'physical',
    die_num: 1,
    die_size: 6,
    bonus: 1,
    burden: 1,
    features: [],
    main_body: '**Trait:** Finesse; **Range:** Far; **Damage:** d6+1 phy; **Burden:** One-Handed\n\n**Feature:** —'
  });
  const fallbackFeatureWeapon = mapRawEquipmentItem({
    slug: 'sample',
    name: 'Sample',
    type_slug: 'primary-weapon',
    char_trait: 'agility',
    range: 'melee',
    damage_ty: 'physical',
    die_num: 1,
    die_size: 8,
    burden: 2,
    features: [],
    main_body: '**Trait:** Agility; **Range:** Melee; **Damage:** d8 phy; **Burden:** Two-Handed\n\n**Feature:** ***Heavy:*** −1 к [Уклонению](/rule/evasion)'
  });

  assert.equal(emptyFeatureWeapon.featureText, '');
  assert.equal(fallbackFeatureWeapon.featureText.includes('Trait:'), false);
  assert.equal(fallbackFeatureWeapon.featureText, '***Heavy:*** −1 к **Уклонению**');
});

test('equipment mapper does not turn a technical stat block into item copy', () => {
  const spear = mapRawEquipmentItem({
    slug: 'spear',
    name: 'Копьё',
    type_slug: 'primary-weapon',
    char_trait: 'finesse',
    range: 'very-close',
    damage_ty: 'physical',
    die_num: 1,
    die_size: 8,
    bonus: 3,
    burden: 2,
    features: [],
    main_body: '**Trait:** Finesse; **Range:** Very Close; **Damage:** d8+3 phy; **Burden:** Two-Handed'
  });

  assert.equal(spear.featureText, '');
});

test('equipment mapper keeps a spellcast trait instead of silently dropping it', () => {
  const wheelchair = mapRawEquipmentItem({
    slug: 'arcane-frame',
    name: 'Чародейское кресло',
    type_slug: 'combat-wheelchair',
    char_trait: 'spellcast'
  });

  assert.equal(wheelchair.trait, null);
  assert.equal(wheelchair.usesSpellcastTrait, true);
});

test('content import removes decorative markdown images and normalizes rules terminology', () => {
  const item = mapGenericItem({
    id: 'reference',
    name: 'Справка',
    description: 'Возьмите дополнительную Карту Домена.\n\n![](https://example.test/art.png)'
  }, 'rule');

  assert.equal(item.body, 'Возьмите дополнительную Карту домена.');
});

test('content service normalizes custom tool content into library collections during reload', async () => {
  const service = new ContentService();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ result: 'ok', data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  applyBrowserCustomContent({
    domainCards: [{
      id: 'custom-library-card',
      slug: 'custom-library-card',
      name: 'Custom Library Card',
      features: [{ id: 'custom-library-card-feature', name: null, main_body: 'Custom card body.' }],
      level: 2,
      card_type: 'spell',
      domain_slug: 'arcana',
      domain_name: 'Arcana',
      image_url: null,
      source_slugs: ['custom']
    }],
    ancestries: [{
      id: 'custom-library-ancestry',
      slug: 'custom-library-ancestry',
      name: 'Custom Library Ancestry',
      features: [{ id: 'custom-library-ancestry-feature', name: 'Custom Library Ancestry', main_body: 'Custom ancestry body.' }],
      source_slugs: ['custom']
    }],
    communities: [{
      id: 'custom-library-community',
      slug: 'custom-library-community',
      name: 'Custom Library Community',
      features: [{ id: 'custom-library-community-feature', name: 'Custom Library Community', main_body: 'Custom community body.' }],
      source_slugs: ['custom']
    }],
    subclasses: [{
      id: 'custom-library-subclass',
      slug: 'custom-library-subclass',
      name: 'Custom Library Subclass',
      class_slug: 'bard',
      class_name: 'Бард',
      foundation_features: [{ id: 'custom-library-subclass-feature', name: 'Custom Library Subclass', main_body: 'Custom subclass body.' }],
      specialization_features: [],
      mastery_features: [],
      source_slugs: ['custom']
    }],
    cardDomains: [],
    adversaries: [{
      id: -1,
      slug: 'custom-library-adversary',
      name: 'Custom Library Adversary',
      tier: 2,
      type_slug: 'standard',
      type_name: 'Рядовой'
    }],
    environments: [{
      id: 'custom-library-environment',
      slug: 'custom-library-environment',
      name: 'Custom Library Environment',
      tier: 3,
      difficulty: 14,
      type_name: 'Опасность',
      short_description: 'Custom environment summary.'
    }]
  });
  try {
    await service.reload();
    service.setSelectedCollection('domainCards');
    const buildView = () => service.buildLibraryView(service.content$.get());
    const view = buildView();
    assert.equal(view.genericItems.some((item) => item.id === 'domain-card:custom-library-card'), true);
    assert.equal(view.collectionCounts.domainCards >= view.genericItems.length, true);
    service.setSourceFilter('homebrew');
    assert.deepEqual(buildView().levelOptions, [2]);
    service.setLevelFilter(2);
    const homebrewDomainCardsView = buildView();
    assert.deepEqual(homebrewDomainCardsView.genericItems.map((item) => item.id), ['domain-card:custom-library-card']);
    service.setSourceFilter('all');
    service.setLevelFilter('all');
    service.setSelectedCollection('ancestries');
    assert.equal(buildView().genericItems.some((item) => item.id === 'ancestry:custom-library-ancestry'), true);
    service.setSelectedCollection('communities');
    assert.equal(buildView().genericItems.some((item) => item.id === 'community:custom-library-community'), true);
    service.setSelectedCollection('subclasses');
    const subclassView = buildView();
    assert.equal(subclassView.genericItems.some((item) => item.id === 'subclass:custom-library-subclass'), true);
    assert.equal(isSubclassForClass(subclassView.genericItems.find((item) => item.id === 'subclass:custom-library-subclass')!, 'Bard'), true);
    service.setSelectedCollection('adversaries');
    service.setSourceFilter('homebrew');
    assert.deepEqual(buildView().tierOptions, [2]);
    service.setTierFilter(2);
    const adversaryView = buildView();
    assert.equal(adversaryView.adversaries.some((item) => item.name === 'Custom Library Adversary'), true);
    assert.equal(adversaryView.adversaries.every((item) => item.raw.source_slugs?.includes('custom') && item.tier === 2), true);
    service.setSelectedCollection('environments');
    service.setSourceFilter('homebrew');
    assert.deepEqual(buildView().tierOptions, [3]);
    service.setTierFilter(3);
    const environmentView = buildView();
    assert.equal(environmentView.environments.some((item) => item.name === 'Custom Library Environment'), true);
    assert.equal(environmentView.environments.every((item) => item.raw.source_slugs?.includes('custom') && item.tier === 3), true);
  } finally {
    applyBrowserCustomContent({ ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [], environments: [] });
    globalThis.fetch = originalFetch;
  }
});

test('content source domain prefers live api metadata and reports cache fallback', () => {
  assert.equal(buildApiCollectionUrl('https://daggerheart.su/', 'domain-card', 'ru'), 'https://daggerheart.su/api/domain-card?lang=ru');

  const apiSummary = summarizeContentSources([{ payload: { data: [{}] }, source: 'api', sourceUrl: 'https://daggerheart.su/api/class?lang=ru' }]);
  assert.deepEqual(apiSummary, { mode: 'api', warnings: [] });

  const mixedSummary = summarizeContentSources([
    { payload: { data: [{}] }, source: 'api', sourceUrl: 'https://daggerheart.su/api/class?lang=ru' },
    { payload: { data: [] }, source: 'cache', sourceUrl: './data/rules.json', error: 'rules: live /api недоступен' }
  ]);
  assert.equal(mixedSummary.mode, 'mixed');
  assert.deepEqual(mixedSummary.warnings, ['rules: live /api недоступен']);

  const manifest = createContentManifest('https://daggerheart.su/', 'ru', [
    {
      config: { key: 'domainCards', endpoint: 'domain-card', file: 'domain-cards.json' },
      loaded: { payload: { data: [{ id: 1 }, { id: 2 }] }, source: 'api', sourceUrl: 'https://daggerheart.su/api/domain-card?lang=ru' }
    }
  ]);
  assert.equal(manifest.source, 'https://daggerheart.su');
  assert.equal(manifest.collections[0].count, 2);
  assert.equal(manifest.collections[0].source, 'api');
});

test('content service uses cache-first collection reads unless live refresh is requested', async () => {
  const service = new ContentService();
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ result: 'ok', data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await service.reload();
    assert.ok(calls.length > 0);
    assert.equal(calls.some((url) => url.includes('/api/')), false);

    calls.length = 0;
    await service.reload(true);
    assert.equal(calls.some((url) => url.includes('/api/')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('content service retains hidden rule articles for contextual help without listing them', async () => {
  const service = new ContentService();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    const data = String(url).includes('rules.json')
      ? [
        { slug: 'visible-rule', name: 'Обычное правило', description: 'Видно в справочнике.', hidden: false },
        { slug: 'agility', name: 'Проворность', description: 'Подсказка характеристики.', hidden: true }
      ]
      : [];
    return new Response(JSON.stringify({ result: 'ok', data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    await service.reload();
    service.setSelectedCollection('rules');
    service.setSourceFilter('all');
    const state = service.content$.get();
    const view = service.buildLibraryView(state);

    assert.equal(state.rules.some((rule) => rule.slug === 'agility'), true);
    assert.deepEqual(view.rules.map((rule) => rule.slug), ['visible-rule']);
    assert.equal(view.collectionCounts.rules, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
