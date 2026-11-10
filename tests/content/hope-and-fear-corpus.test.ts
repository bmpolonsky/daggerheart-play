import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { classDefinitionForCharacter, domainCardFromLibrary, buildCharacterBuilderChoicePreview } from '../../src/domain/characterBuilder';
import { buildCharacterBuilderCatalog } from '../../src/domain/characterBuilder/catalog';
import { mapGenericItem, mapRawClassItem } from '../../src/domain/content/mappers';
import type { RawClassItem, RawContentItem } from '../../src/domain/content/types';
import { analyzeFeatureRules } from '../../src/domain/rules/featureEffects';

const load = <T>(name: string): T[] => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8')).data;
const classes = load<RawClassItem>('classes').map(mapRawClassItem);
const content = {
  ancestries: load<RawContentItem>('ancestries').map(item => mapGenericItem(item, 'ancestry')),
  communities: load<RawContentItem>('communities').map(item => mapGenericItem(item, 'community')),
  subclasses: load<RawContentItem>('subclasses').map(item => mapGenericItem(item, 'subclass')),
  domainCards: load<RawContentItem>('domain-cards').map(item => mapGenericItem(item, 'domain-card'))
};

test('H&F options retain identity, subclasses and domains under the existing additional-content setting', () => {
  const released = classes.filter(item => item.raw.source_slugs?.includes('hope-and-fear'));
  assert.equal(released.length, 4);
  assert.equal(content.subclasses.filter(item => item.raw.source_slugs?.includes('hope-and-fear')).length, 8);
  assert.equal(content.ancestries.filter(item => item.raw.source_slugs?.includes('hope-and-fear')).length, 6);
  assert.equal(content.communities.filter(item => item.raw.source_slugs?.includes('hope-and-fear')).length, 6);
  for (const item of released) {
    const input = { content, classes, equipment: [], className: item.className, classId: item.id };
    const enabled = buildCharacterBuilderCatalog({ ...input, includePlaytest: true });
    const disabled = buildCharacterBuilderCatalog({ ...input, includePlaytest: false });
    assert.equal(enabled.classDefinition?.id, item.id);
    assert.equal(enabled.classSubclasses.length, 2);
    assert.equal(enabled.classOptions.some(option => option.id === item.id), true);
    assert.equal(disabled.classOptions.some(option => option.id === item.id), false);
    assert.equal(classDefinitionForCharacter(classes, { className: item.className, classSlug: item.slug, classSourceId: item.sourceId }, true)?.id, item.id);
  }
  const catalog = buildCharacterBuilderCatalog({ content, classes, equipment: [], className: 'Bard', includePlaytest: true });
  for (const slug of ['playtest-blood-hunter', 'playtest-summoner']) {
    const incomplete = classes.find(item => item.slug === slug);
    assert.ok(incomplete, `${slug} remains in the reference library`);
    assert.equal(content.subclasses.some(item => item.raw.class_slug === slug), false);
    assert.equal(catalog.classOptions.some(option => option.id === incomplete.id), false);
  }
});

test('reviewed Dread card corrections survive the sheet projection', () => {
  for (const slug of ['nether-flames', 'summon-horror']) {
    const item = content.domainCards.find(item => item.slug === slug);
    assert.ok(item);
    const limits = analyzeFeatureRules(domainCardFromLibrary(item, true).text).effects.filter(effect => effect.kind === 'usageLimit');
    assert.equal(limits.length, 1);
    assert.equal(limits[0].max, 1);
    assert.equal(limits[0].reset, 'scene');
  }
  for (const slug of ['invoke-torment', 'savor-the-anguish']) {
    const item = content.domainCards.find(item => item.slug === slug);
    assert.ok(item);
    assert.equal(domainCardFromLibrary(item, true).cardType, 'ability');
  }
});

test('published H&F mode follows the reviewed source tags of all Dread cards', () => {
  const dreadCards = content.domainCards.filter(item => ['dread', 'playtest-dread'].includes(String(item.raw.domain_slug)));
  assert.equal(dreadCards.length, 21);
  const source = dreadCards[0].raw.source_slugs;
  assert.ok(JSON.stringify(source) === '["hope-and-fear"]' || JSON.stringify(source) === '["playtest-the-void"]');
  for (const item of dreadCards) assert.deepEqual(item.raw.source_slugs, source);
  const published = source?.includes('hope-and-fear');
  for (const [mode, classCount, cardCount] of [['core', 9, 189], ['hope-and-fear', 13, published ? 210 : 189], ['all', 13, 210]] as const) {
    const catalog = buildCharacterBuilderCatalog({ content, classes, equipment: [], className: 'Witch', includePlaytest: mode });
    assert.equal(catalog.classOptions.length, classCount);
    assert.equal(catalog.builderContent.domainCards.length, cardCount);
    assert.equal(catalog.builderContent.ancestries.length, mode === 'core' ? 18 : 24);
    assert.equal(catalog.builderContent.communities.length, mode === 'core' ? 9 : 15);
    assert.equal(catalog.builderContent.subclasses.length, mode === 'core' ? 18 : 26);
    const dread = catalog.builderContent.domainCards.filter(item => ['dread', 'playtest-dread'].includes(String(item.raw.domain_slug)));
    assert.equal(dread.length, mode === 'all' || (mode === 'hope-and-fear' && published) ? 21 : 0);
  }
});


test('Warlock card availability follows actual Dread source restrictions', () => {
  const published = content.domainCards.find(item => item.slug === 'nether-flames')?.raw.source_slugs?.includes('hope-and-fear');
  const hf = buildCharacterBuilderCatalog({ content, classes, equipment: [], className: 'Warlock', includePlaytest: 'hope-and-fear' });
  assert.deepEqual(hf.availableCardDomains, published ? ['Dread', 'Grace'] : ['Grace']);
  assert.deepEqual(hf.restrictedCardDomains, published ? [] : ['Dread']);
  assert.equal(hf.availableDomainCards.length, published ? 6 : 3);
  const all = buildCharacterBuilderCatalog({ content, classes, equipment: [], className: 'Warlock', includePlaytest: 'all' });
  assert.equal(all.availableDomainCards.length, 6);
  assert.deepEqual(all.availableCardDomains, ['Dread', 'Grace']);
  assert.deepEqual(all.restrictedCardDomains, []);
});

test('Inspirational Words complete detail includes the source ending with one level label', () => {
  const card = content.domainCards.find(item => item.slug === 'inspirational-words');
  assert.ok(card);
  const preview = buildCharacterBuilderChoicePreview({ step: 'cards', selectedCards: [card] });
  assert.ok(preview);
  assert.equal(preview.body, domainCardFromLibrary(card, true).text);
  assert.ok(preview.body.endsWith('снимите все неиспользованные жетоны.'));
  assert.equal((preview.subtitle?.match(/Уровень 1/g) ?? []).length, 1);
});
