import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareContentPayloads,
  renderContentRefreshReport
} from '../../scripts/lib/content-refresh-diff.mjs';

test('reports item text changes and nested feature additions by stable identity', () => {
  const previous = payload('2026-07-20T10:00:00.000Z', [{
    slug: 'beastbound',
    name: 'Звериный союз',
    main_body: 'Старый основной текст.',
    foundation_features: [{
      id: 10,
      name: 'Верный спутник',
      main_body: 'Старое правило.'
    }]
  }]);
  const next = payload('2026-07-30T10:00:00.000Z', [{
    slug: 'beastbound',
    name: 'Звериный союз',
    main_body: 'Новый основной текст.',
    foundation_features: [{
      id: 10,
      name: 'Верный спутник',
      main_body: 'Старое правило.'
    }, {
      id: 11,
      name: 'Новая способность',
      main_body: 'Новое правило.'
    }]
  }]);

  const comparison = compareContentPayloads('subclasses', previous, next);
  const report = renderContentRefreshReport([comparison], {
    generatedAt: '2026-07-30T12:00:00.000Z'
  });

  assert.equal(comparison.added.length, 1);
  assert.equal(comparison.changed.length, 1);
  assert.equal(comparison.removed.length, 0);
  assert.ok(report.includes('subclasses/beastbound/foundation_features/11'));
  assert.match(report, /main_body/);
  assert.match(report, /- Старый основной текст\./);
  assert.match(report, /\+ Новый основной текст\./);
  assert.match(report, /2026-07-20T10:00:00\.000Z/);
  assert.match(report, /10d 2h old/);
});

test('ignores source item and feature ordering', () => {
  const alpha = {
    slug: 'alpha',
    name: 'Alpha',
    features: [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }]
  };
  const beta = {
    slug: 'beta',
    name: 'Beta',
    features: [{ id: 3, name: 'Three' }]
  };

  const comparison = compareContentPayloads(
    'classes',
    payload('2026-07-20T10:00:00.000Z', [alpha, beta]),
    payload('2026-07-30T10:00:00.000Z', [
      { ...beta, features: [...beta.features].reverse() },
      { ...alpha, features: [...alpha.features].reverse() }
    ])
  );

  assert.equal(comparison.hasChanges, false);
});

test('states when no local baseline exists', () => {
  const comparison = compareContentPayloads(
    'rules',
    null,
    payload('2026-07-30T10:00:00.000Z', [{ slug: 'new-rule', name: 'Новое правило' }])
  );
  const report = renderContentRefreshReport([comparison]);

  assert.equal(comparison.hasBaseline, false);
  assert.match(report, /No usable local baseline/);
});

function payload(generatedAt, data) {
  return {
    result: 'ok',
    meta: { generatedAt },
    data
  };
}
