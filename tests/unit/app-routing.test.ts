import assert from "node:assert/strict";
import { test } from "vitest";
import { replaceLegacyRoute, routeNavigation, routePathFromLocation } from "../../src/app/routing";
import { buildRoutedPlayerViewLocation, parseRoutedPlayerViewState, sharedToolsTabsForRole } from "../../src/ui/vtt/playerView/routedUiState";
import { buildCardEditorHash, parseCardEditorHash } from "../../src/tools/card-creator/services/editorService";

test('app route navigation canonicalizes legacy route events', () => {
  assert.deepEqual(routeNavigation('gm'), {
    hash: '#/game',
    pathname: '/',
    route: 'game',
    routePath: '/game',
    search: '',
    url: '/#/game'
  });
  assert.deepEqual(routeNavigation('player', '', '', '7K2Q'), {
    hash: '#/join/7K2Q',
    pathname: '/',
    route: 'join',
    routePath: '/join/7K2Q',
    search: '',
    url: '/#/join/7K2Q'
  });
});

test('all transports use the same reload-safe hash routes', () => {
  assert.deepEqual(routeNavigation('player', '', '', '7K2Q', 'server'), {
    hash: '#/join/7K2Q',
    pathname: '/',
    route: 'join',
    routePath: '/join/7K2Q',
    search: '',
    url: '/#/join/7K2Q'
  });
  assert.deepEqual(routeNavigation('call', '', '', '7K2Q', 'server'), {
    hash: '#/calls/7K2Q',
    pathname: '/',
    route: 'call',
    routePath: '/calls/7K2Q',
    search: '',
    url: '/#/calls/7K2Q'
  });
});

test('hash routes survive a reload because the logical path comes from the fragment', () => {
  assert.equal(routePathFromLocation({ pathname: '/', search: '', hash: '#/library/settings/connection' }), '/library/settings/connection');
  assert.equal(routePathFromLocation({ pathname: '/daggerheart-play/', search: '', hash: '#/join/D8MX4M' }, '/daggerheart-play'), '/join/D8MX4M');
  assert.equal(routePathFromLocation({ pathname: '/', search: '?join=OLD123', hash: '' }), '/');
  assert.equal(routePathFromLocation({ pathname: '/tools/cards', search: '', hash: '#card/domain-card%3Alegacy' }), '/tools/cards');
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
    assert.equal(replacedUrl, '/?sig=torrent-library#/join/7K2Q');
  } finally {
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  }
});

test('app routing treats library paths as player view state', () => {
  assert.deepEqual(parseRoutedPlayerViewState('/library/compendium/domain-cards', 'gm'), {
    toolsOpen: true,
    toolsTab: 'library',
    libraryCollection: 'domainCards',
    libraryEntrySlug: null,
    settingsSection: null,
    handoutId: null
  });

  assert.deepEqual(parseRoutedPlayerViewState('/library/compendium/rules/agility', 'player'), {
    toolsOpen: true,
    toolsTab: 'library',
    libraryCollection: 'rules',
    libraryEntrySlug: 'agility',
    settingsSection: null,
    handoutId: null
  });

  assert.deepEqual(parseRoutedPlayerViewState('/library/settings/diagnostics', 'gm'), {
    toolsOpen: true,
    toolsTab: 'settings',
    libraryCollection: null,
    libraryEntrySlug: null,
    settingsSection: 'diagnostics',
    handoutId: null
  });
});

test('player shared tools expose the owned-character area without GM-only tabs', () => {
  assert.deepEqual(sharedToolsTabsForRole('player'), ['characters', 'handouts', 'library', 'settings']);
  assert.deepEqual(parseRoutedPlayerViewState('/library/characters', 'player'), {
    toolsOpen: true,
    toolsTab: 'characters',
    libraryCollection: null,
    libraryEntrySlug: null,
    settingsSection: null,
    handoutId: null
  });
  assert.equal(sharedToolsTabsForRole('player').includes('scenes'), false);
  assert.equal(sharedToolsTabsForRole('player').includes('combat'), false);
  assert.equal(sharedToolsTabsForRole('player').includes('notes'), false);
});

test('handout routes preserve the selected editor through Back and Forward state', () => {
  assert.deepEqual(parseRoutedPlayerViewState('/library/handouts/handout%3Aclue', 'gm'), {
    toolsOpen: true,
    toolsTab: 'handouts',
    libraryCollection: null,
    libraryEntrySlug: null,
    settingsSection: null,
    handoutId: 'handout:clue'
  });
  assert.equal(buildRoutedPlayerViewLocation('gm', {
    toolsOpen: true,
    toolsTab: 'handouts',
    handoutId: 'handout:clue'
  }).hash, '#/library/handouts/handout%3Aclue');
});

test('app routing builds slash-based library hash URLs without query params', () => {
  assert.deepEqual(buildRoutedPlayerViewLocation(
    'gm',
    { toolsOpen: true, toolsTab: 'library', libraryCollection: 'domainCards' }
  ), {
    hash: '#/library/compendium/domain-cards',
    pathname: '/',
    routePath: '/library/compendium/domain-cards',
    search: '',
    url: '/#/library/compendium/domain-cards'
  });

  assert.deepEqual(buildRoutedPlayerViewLocation(
    'player',
    { toolsOpen: true, toolsTab: 'library', libraryCollection: 'rules', libraryEntrySlug: 'action-roll' }
  ), {
    hash: '#/library/compendium/rules/action-roll',
    pathname: '/',
    routePath: '/library/compendium/rules/action-roll',
    search: '',
    url: '/#/library/compendium/rules/action-roll'
  });

  assert.deepEqual(buildRoutedPlayerViewLocation(
    'gm',
    { toolsOpen: false }
  ), {
    hash: '#/game',
    pathname: '/',
    routePath: '/game',
    search: '',
    url: '/#/game'
  });
});

test('card editor state fits into slash-based hash routes', () => {
  assert.equal(buildCardEditorHash({ type: 'card', value: 'domain-card:fireball' }), '#/tools/cards/card/domain-card%3Afireball');
  assert.deepEqual(parseCardEditorHash('#/tools/cards/card/domain-card%3Afireball'), { type: 'card', value: 'domain-card:fireball' });
  assert.equal(buildCardEditorHash({ type: 'custom', value: 'custom/id' }), '#/tools/cards/custom/custom%2Fid');
  assert.deepEqual(parseCardEditorHash('#/tools/cards/custom/custom%2Fid'), { type: 'custom', value: 'custom/id' });
  assert.deepEqual(parseCardEditorHash('#card/domain-card%3Alegacy'), { type: 'card', value: 'domain-card:legacy' });
});
