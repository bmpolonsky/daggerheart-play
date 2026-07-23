import assert from "node:assert/strict";
import { test } from "vitest";
import { replaceLegacyRoute, routeNavigation } from "../../src/app/routing";
import { buildRoutedPlayerViewLocation, parseRoutedPlayerViewState, sharedToolsTabsForRole } from "../../src/ui/vtt/playerView/routedUiState";

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

test('app routing treats library paths as player view state', () => {
  assert.deepEqual(parseRoutedPlayerViewState('/library/compendium/domain-cards', 'gm'), {
    toolsOpen: true,
    toolsTab: 'library',
    libraryCollection: 'domainCards',
    settingsSection: null
  });

  assert.deepEqual(parseRoutedPlayerViewState('/library/settings/diagnostics', 'gm'), {
    toolsOpen: true,
    toolsTab: 'settings',
    libraryCollection: null,
    settingsSection: 'diagnostics'
  });
});

test('player shared tools expose the owned-character area without GM-only tabs', () => {
  assert.deepEqual(sharedToolsTabsForRole('player'), ['characters', 'handouts', 'library', 'settings']);
  assert.deepEqual(parseRoutedPlayerViewState('/library/characters', 'player'), {
    toolsOpen: true,
    toolsTab: 'characters',
    libraryCollection: null,
    settingsSection: null
  });
  assert.equal(sharedToolsTabsForRole('player').includes('scenes'), false);
  assert.equal(sharedToolsTabsForRole('player').includes('combat'), false);
  assert.equal(sharedToolsTabsForRole('player').includes('notes'), false);
});

test('app routing builds path-based library URLs without query params', () => {
  assert.deepEqual(buildRoutedPlayerViewLocation(
    { hash: '#sheet' },
    'gm',
    { toolsOpen: true, toolsTab: 'library', libraryCollection: 'domainCards' }
  ), {
    hash: '#sheet',
    pathname: '/library/compendium/domain-cards',
    search: '',
    url: '/library/compendium/domain-cards#sheet'
  });

  assert.deepEqual(buildRoutedPlayerViewLocation(
    { hash: '' },
    'gm',
    { toolsOpen: false }
  ), {
    hash: '',
    pathname: '/game',
    search: '',
    url: '/game'
  });
});
