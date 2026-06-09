import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCallInviteUrl, buildPlayerInviteUrl, createShortRoomCode, inferBasePathFromWorkspacePath, parseCallSessionLocation, parsePlayerSessionLocation } from "../../src/domain/p2p/sessionLinks";
import { parseRoutedPlayerViewState, updateRoutedPlayerViewSearch } from "../../src/ui/vtt/playerView/routedUiState";

test('P2P invite links use path routing and room codes without a prefix', () => {
  const invite = buildPlayerInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: ' 7K2Q '
  });
  assert.equal(invite, 'https://example.test/table/join/7K2Q');
  assert.deepEqual(parsePlayerSessionLocation('/table/join/7K2Q', '/table'), { roomId: '7K2Q' });
  assert.deepEqual(parsePlayerSessionLocation('/table/join/7k2q', '/table'), { roomId: '7K2Q' });
  assert.equal(parsePlayerSessionLocation('/table/player/7K2Q', '/table'), null);
  assert.equal(buildCallInviteUrl({ origin: 'https://example.test', basePath: '/table', roomId: ' 7K2Q ' }), 'https://example.test/table/calls/7K2Q');
  assert.deepEqual(parseCallSessionLocation('/table/calls/7k2q', '/table'), { roomId: '7K2Q' });
  assert.equal(parseCallSessionLocation('/table/call/7k2q', '/table'), null);
  assert.equal(parsePlayerSessionLocation('/table/player', '/table'), null);
  assert.equal(createShortRoomCode().startsWith('DH-'), false);
  assert.equal(inferBasePathFromWorkspacePath('/table/game'), '/table');
  assert.equal(inferBasePathFromWorkspacePath('/table/join/7K2Q'), '/table');
  assert.equal(inferBasePathFromWorkspacePath('/table/calls/7K2Q'), '/table');
});

test('player view routed UI state preserves session params and restores tools tabs', () => {
  assert.deepEqual(parseRoutedPlayerViewState('', 'gm'), { toolsOpen: false, toolsTab: 'scenes' });
  assert.deepEqual(parseRoutedPlayerViewState('?tools=handouts', 'player'), { toolsOpen: true, toolsTab: 'handouts' });
  assert.deepEqual(parseRoutedPlayerViewState('?tools=library', 'player'), { toolsOpen: true, toolsTab: 'library' });
  assert.deepEqual(parseRoutedPlayerViewState('?tools=scenes', 'player'), { toolsOpen: true, toolsTab: 'handouts' });
  assert.deepEqual(parseRoutedPlayerViewState('?tools=games', 'gm'), { toolsOpen: true, toolsTab: 'scenes' });

  assert.equal(updateRoutedPlayerViewSearch('', 'gm', { toolsOpen: true, toolsTab: 'notes' }), '?tools=notes');
  assert.equal(updateRoutedPlayerViewSearch('', 'gm', { toolsOpen: true, toolsTab: 'library' }), '?tools=library');
  assert.equal(updateRoutedPlayerViewSearch('?tools=settings', 'gm', { toolsOpen: false }), '');
  assert.equal(updateRoutedPlayerViewSearch('?tool=notes', 'gm', { toolsOpen: true, toolsTab: 'handouts' }), '?tools=handouts');
});
