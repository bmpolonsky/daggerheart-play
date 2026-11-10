import assert from 'node:assert/strict';
import { test } from 'vitest';
import { coerceDomainName, domainCardFromLibrary, isDomainCardForDomains, isSupportedClassItem } from '../../src/domain/characterBuilder';
import { contentSourceAllowed } from '../../src/domain/content/access';
import { mapGenericItem, mapRawClassItem } from '../../src/domain/content/mappers';

// Minimal metadata observed in the 2026-11-09 API refresh. These assertions
// exercise existing mapping only; they do not approve or install a new corpus.
test('class domain identities use explicit slugs despite malformed expanded labels', () => {
  for (const [slug, second, label, expected] of [
    ['witch', 'sage', 'Мудрость', ['Dread', 'Sage']],
    ['playtest-warlock', 'grace', 'Грация', ['Dread', 'Grace']]
  ] as const) {
    const item = mapRawClassItem({ slug, domain_slugs: ['playtest-dread', second],
      domains: [{ slug: 'playtest-dread', name: label }] });
    assert.deepEqual(item.domains, expected);
    assert.equal(isSupportedClassItem(item), true);
  }
});

test('released and playtest Dread aliases retain card identity and use explicit source access', () => {
  for (const [domain_slug, source] of [['playtest-dread', 'playtest-the-void'], ['dread', 'hope-and-fear']]) {
    const raw = { slug: 'voice-of-dread', name: 'Глас ужаса', domain_slug, domain_name: 'Ужас', source_slugs: [source], level: 1 };
    const item = mapGenericItem(raw, 'domain-card');
    assert.equal(coerceDomainName(domain_slug), 'Dread');
    assert.equal(isDomainCardForDomains(item, ['Dread', 'Grace']), true);
    assert.equal(domainCardFromLibrary(item, true).id, 'domain-card:voice-of-dread');
    assert.equal(domainCardFromLibrary(item, true).domain, 'Dread');
    assert.equal(contentSourceAllowed(raw.source_slugs, 'core'), false);
    assert.equal(contentSourceAllowed(raw.source_slugs, 'hope-and-fear'), source === 'hope-and-fear');
    assert.equal(contentSourceAllowed(raw.source_slugs, 'all'), true);
  }
});

test('new subclass records do not silently make Blood classes playable', () => {
  for (const [slug, second] of [['playtest-blood-hunter', 'bone'], ['playtest-summoner', 'splendor']]) {
    const item = mapRawClassItem({ slug, domain_slugs: ['blood', second], source_slugs: ['playtest-the-void'] });
    assert.equal(item.className, 'Custom');
    assert.equal(isSupportedClassItem(item), false);
  }
  assert.equal(coerceDomainName('playtest-blood'), null);
  assert.equal(coerceDomainName('Кровь'), null);
});
