import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewedDreadContract } from '../e2e/reviewed-dread-contract.mjs';
const load = id => JSON.parse(readFileSync(new URL(`../fixtures/reviewed-dread/${id}.json`, import.meta.url), 'utf8'));
for (const [id, hf, starter] of [['void-20261102', 0, 3], ['hope-and-fear-20261110', 21, 6]]) {
  test(`accepts explicit reviewed ${id} contract`, () => {
    const result = reviewedDreadContract(load(id));
    assert.equal(result.id, id); assert.equal(result.hfCards, hf); assert.equal(result.hfStarterCards, starter);
  });
  for (const mutation of ['missing', 'added', 'text', 'mixed-source', 'unknown-source']) {
    test(`rejects ${mutation} in ${id}`, () => {
      const data = load(id);
      if (mutation === 'missing') data.pop();
      if (mutation === 'added') data.push({ ...data[0], slug: 'unreviewed-card' });
      if (mutation === 'text') data[0].main_body += ' unreviewed';
      if (mutation === 'mixed-source') data[0].source_slugs = ['hope-and-fear', 'playtest-the-void'];
      if (mutation === 'unknown-source') data[0].source_slugs = ['unknown'];
      assert.throws(() => reviewedDreadContract(data), /Unreviewed Dread corpus/);
    });
  }
}
