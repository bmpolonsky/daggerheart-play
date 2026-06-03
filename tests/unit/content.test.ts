import { test } from "vitest";
import assert from "node:assert/strict";
import { ContentService } from "../../src/services/ContentService";
import { applyBrowserCustomContent } from "../../src/core/persistence/browserProjectContent";
import { cleanRulesText, coerceDomainName, domainCardFromLibrary, isDomainCardForDomains, isSubclassForClass } from "../../src/domain/characterBuilder/index";
import { queryLibraryContent } from "../../src/domain/content/query";
import { mapRawEquipmentItem } from "../../src/domain/content/mappers";
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
  assert.equal(fallbackFeatureWeapon.featureText, '***Heavy:*** −1 к [Уклонению](/rule/evasion)');
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
    }]
  });
  try {
    await service.reload();
    service.setSelectedCollection('domainCards');
    const buildView = () => service.buildLibraryView(service.content$.get());
    const view = buildView();
    assert.equal(view.genericItems.some((item) => item.id === 'domain-card:custom-library-card'), true);
    assert.equal(view.collectionCounts.domainCards >= view.genericItems.length, true);
    service.setSelectedCollection('ancestries');
    assert.equal(buildView().genericItems.some((item) => item.id === 'ancestry:custom-library-ancestry'), true);
    service.setSelectedCollection('communities');
    assert.equal(buildView().genericItems.some((item) => item.id === 'community:custom-library-community'), true);
    service.setSelectedCollection('subclasses');
    const subclassView = buildView();
    assert.equal(subclassView.genericItems.some((item) => item.id === 'subclass:custom-library-subclass'), true);
    assert.equal(isSubclassForClass(subclassView.genericItems.find((item) => item.id === 'subclass:custom-library-subclass')!, 'Bard'), true);
    service.setSelectedCollection('adversaries');
    const adversaryView = buildView();
    assert.equal(adversaryView.adversaries.some((item) => item.name === 'Custom Library Adversary'), true);
  } finally {
    applyBrowserCustomContent({ ancestries: [], communities: [], subclasses: [], domainCards: [], cardDomains: [], adversaries: [] });
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
