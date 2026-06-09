import assert from "node:assert/strict";
import { test } from "vitest";
import { replaceLegacyRoute, routeNavigation } from "../../src/app/routing";

test('app route navigation canonicalizes legacy route events', () => {
  assert.deepEqual(routeNavigation('gm'), {
    hash: '',
    pathname: '/game',
    route: 'game',
    search: '',
    url: '/game'
  });
  assert.deepEqual(routeNavigation('player', '', '', '7K2Q'), {
    hash: '',
    pathname: '/join/7K2Q',
    route: 'join',
    search: '',
    url: '/join/7K2Q'
  });
});

test('app routing redirects legacy URLs at the compatibility boundary', () => {
  const originalWindow = globalThis.window;
  let replacedUrl = '';
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        hash: '#sheet',
        pathname: '/player/7K2Q',
        search: '?sig=torrent-library'
      },
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          replacedUrl = url;
        }
      }
    },
    configurable: true
  });
  try {
    assert.equal(replaceLegacyRoute(), true);
    assert.equal(replacedUrl, '/join/7K2Q?sig=torrent-library#sheet');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});
