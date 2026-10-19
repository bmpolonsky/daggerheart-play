import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { classDefinitionForCharacter, domainCardFromLibrary } from '../../src/domain/characterBuilder';
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
