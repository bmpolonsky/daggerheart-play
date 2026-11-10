import test from 'node:test';
import assert from 'node:assert/strict';
import { applyContentExclusions } from '../../scripts/lib/content-exclusions.mjs';
import { compareContentPayloads, renderContentRefreshReport } from '../../scripts/lib/content-refresh-diff.mjs';

const voidSources = ['playtest-the-void'];
const card = { slug: 'blood-spike', name: 'Кровавый шип', domain_slug: 'playtest-blood', source_slugs: voidSources };
const payload = (data) => ({ result: 'ok', data, meta: { retained: true } });

test('only explicit Void Blood cards and unsupported class subclasses are deferred', () => {
  for (const domain_slug of ['blood', 'playtest-blood']) {
    const input = payload([{ ...card, domain_slug }, { ...card, slug: 'voice-of-dread', domain_slug: 'dread', source_slugs: ['hope-and-fear'] }]);
    const result = applyContentExclusions('domainCards', input);
    assert.deepEqual(result.payload.data.map(item => item.slug), ['voice-of-dread']);
    assert.equal(result.exclusions.length, 1);
    assert.equal(input.data.length, 2, 'source payload is not mutated');
    assert.equal(result.payload.meta, input.meta);
  }
  const classes = ['blood-hunter', 'playtest-blood-hunter', 'summoner', 'playtest-summoner'];
  const input = payload(classes.map((class_slug, i) => ({ slug: `beta-${i}`, class_slug, source_slugs: voidSources })));
  assert.equal(applyContentExclusions('subclasses', input).payload.data.length, 0);
  assert.equal(applyContentExclusions('subclasses', input).exclusions.length, 4);
  assert.equal(applyContentExclusions('classes', input).payload, input, 'existing class reference entries remain available');
});

test('released, mixed-source, unknown-source and unrelated content are not silently excluded', () => {
  for (const source_slugs of [undefined, [], ['hope-and-fear'], ['core'], ['custom'], ['playtest-the-void', 'hope-and-fear'], ['playtest-the-void', 'unknown']]) {
    const input = payload([{ ...card, source_slugs }, { slug: 'theurgy', class_slug: 'playtest-summoner', source_slugs }]);
    for (const collection of ['domainCards', 'subclasses']) assert.equal(applyContentExclusions(collection, input).payload, input);
  }
  const input = payload([{ ...card, domain_slug: 'playtest-dread' }, { slug: 'other', class_slug: 'playtest-warlock', source_slugs: voidSources }]);
  for (const collection of ['domainCards', 'subclasses', 'equipment']) assert.equal(applyContentExclusions(collection, input).payload, input);
});

test('review report explains exclusions even when accepted content is unchanged', () => {
  const existing = { slug: 'core', domain_slug: 'arcana', source_slugs: ['core'] };
  const previous = payload([existing]);
  const { payload: next, exclusions } = applyContentExclusions('domainCards', payload([existing, card]));
  const report = renderContentRefreshReport([{ ...compareContentPayloads('domainCards', previous, next), exclusions }]);
  assert.match(report, /No content changes/);
  assert.match(report, /Deferred beta entries excluded \(1\)/);
  assert.match(report, /domainCards\/blood-spike/);
  assert.match(report, /Blood domain beta cards are deferred/);
});

test('keeps all reviewed reference classes and their audited features while excluding new beta items', () => {
  const classes = { result: 'ok', data: [
    { slug: 'playtest-blood-hunter', source_slugs: ['playtest-the-void'], features: [{ id: 2130 }, { id: 2131 }, { id: 2132 }] },
    { slug: 'playtest-summoner', source_slugs: ['playtest-the-void'], features: [{ id: 2128 }, { id: 2129 }] }
  ] };
  assert.deepEqual(applyContentExclusions('classes', classes).payload, classes);
  assert.deepEqual(applyContentExclusions('domainCards', { data: [
    { slug: 'blood-spike', domain_slug: 'playtest-blood', source_slugs: ['playtest-the-void'] }, { slug: 'nether-flames', domain_slug: 'dread' }
  ] }).payload.data.map(item => item.slug), ['nether-flames']);
  assert.deepEqual(applyContentExclusions('subclasses', { data: [
    { slug: 'theurgy', class_slug: 'playtest-summoner', source_slugs: ['playtest-the-void'] }, { slug: 'hedge', class_slug: 'witch' }
  ] }).payload.data.map(item => item.slug), ['hedge']);
});

test('slug normalization stays gated by exact Void-only provenance', () => {
  for (const [collection, item] of [
    ['domainCards', { slug: 'blood-spike', domain_slug: ' PLAYTEST-BLOOD ' }],
    ['subclasses', { slug: 'theurgy', class_slug: ' SUMMONER ' }],
    ['subclasses', { slug: 'order-of-the-lycan', class_slug: 'PlayTest-Blood-Hunter' }]
  ]) {
    assert.equal(applyContentExclusions(collection, payload([{ ...item, source_slugs: ['playtest-the-void'] }])).payload.data.length, 0);
    for (const source_slugs of [['core'], ['playtest-the-void', 'core'], [], undefined]) {
      const input = payload([{ ...item, source_slugs }]);
      assert.equal(applyContentExclusions(collection, input).payload, input);
    }
  }
});
