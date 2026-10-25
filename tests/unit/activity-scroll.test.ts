import { test } from 'vitest';
import assert from 'node:assert/strict';
import { countNewActivityIds, isActivityNearBottom } from '../../src/ui/vtt/playerView/playerChrome/activityScroll';

test('a hidden activity list is not treated as a reader at the bottom', () => {
  assert.equal(isActivityNearBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 }), false);
});

test('activity follows within its bottom tolerance and preserves a reader higher in history', () => {
  assert.equal(isActivityNearBottom({ scrollTop: 940, scrollHeight: 1500, clientHeight: 500 }), true);
  assert.equal(isActivityNearBottom({ scrollTop: 700, scrollHeight: 1500, clientHeight: 500 }), false);
  assert.equal(isActivityNearBottom({ scrollTop: 1005, scrollHeight: 1500, clientHeight: 500 }), true);
});

test('unread additions exclude removals, reorder, updated events and empty placeholders', () => {
  assert.equal(countNewActivityIds(['a', 'b'], ['b', 'a']), 0);
  assert.equal(countNewActivityIds(['a', 'b'], ['a']), 0);
  assert.equal(countNewActivityIds(['a'], ['a', 'b', 'c']), 2);
  assert.equal(countNewActivityIds([], ['feed-empty']), 0);
});
