import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCallInviteUrl, buildPlayerInviteUrl, createShortRoomCode, inferBasePathFromWorkspacePath, parseCallSessionLocation, parsePlayerInviteRoomCode, parsePlayerSessionLocation, rebasePlayerInviteRoomCode } from "../../src/domain/p2p/sessionLinks";
import { resolveTrysteroRoom } from "../../src/services/TrysteroSyncTransport";

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

test('server invite links keep room codes in the query so Sites does not redirect them away', () => {
  assert.equal(buildPlayerInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: '7K2Q',
    transportMode: 'server'
  }), 'https://example.test/?join=7K2Q');
  assert.deepEqual(parsePlayerSessionLocation('/', '', '?join=7k2q'), { roomId: '7K2Q' });
  assert.equal(buildCallInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: '7K2Q',
    transportMode: 'server'
  }), 'https://example.test/?call=7K2Q');
  assert.deepEqual(parseCallSessionLocation('/', '', '?call=7k2q'), { roomId: '7K2Q' });
});

test('P2P invite links keep room codes transport-agnostic for players', () => {
  const nostrInvite = buildPlayerInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: '7K2QAB',
    networkSettings: {
      strategy: 'nostr' as never
    }
  });
  assert.equal(nostrInvite, 'https://example.test/table/join/7K2QAB');

  const invite = buildPlayerInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: '7K2QAB',
    networkSettings: {
      strategy: 'torrent' as never
    }
  });
  assert.equal(invite, 'https://example.test/table/join/7K2QAB');
  assert.deepEqual(parsePlayerSessionLocation('/table/join/T7K2QAB', '/table'), { roomId: '7K2QAB' });
  assert.deepEqual(parsePlayerInviteRoomCode('N7K2QAB'), {
    roomId: '7K2QAB'
  });
  assert.deepEqual(parsePlayerInviteRoomCode('M7K2QAB'), { roomId: '7K2QAB' });
  assert.deepEqual(parsePlayerInviteRoomCode('S7K2QAB'), { roomId: '7K2QAB' });
  assert.equal(buildPlayerInviteUrl({
    origin: 'https://example.test',
    basePath: '/table',
    roomId: 'T7K2QAB',
    networkSettings: { strategy: 'auto' }
  }), 'https://example.test/table/join/7K2QAB');
  assert.equal(buildCallInviteUrl({ origin: 'https://example.test', basePath: '/table', roomId: 'N7K2QAB' }), 'https://example.test/table/calls/7K2QAB');
  assert.deepEqual(parsePlayerInviteRoomCode('7K2QAB'), { roomId: '7K2QAB' });
  assert.deepEqual(parsePlayerInviteRoomCode('ROOM123'), { roomId: 'OOM123' });
  assert.deepEqual(resolveTrysteroRoom('T7K2QAB', 'nostr'), { roomId: '7K2QAB', strategy: 'nostr' });
  assert.deepEqual(resolveTrysteroRoom('M7K2QAB', 'nostr'), { roomId: '7K2QAB', strategy: 'nostr' });
  assert.deepEqual(resolveTrysteroRoom('N7K2QAB', 'torrent'), { roomId: '7K2QAB', strategy: 'torrent' });
  assert.deepEqual(resolveTrysteroRoom('S7K2QAB', 'torrent'), { roomId: '7K2QAB', strategy: 'torrent' });
  assert.deepEqual(resolveTrysteroRoom('7K2QAB', 'torrent'), { roomId: '7K2QAB', strategy: 'torrent' });
  assert.deepEqual(resolveTrysteroRoom('ROOM123', 'torrent'), { roomId: 'OOM123', strategy: 'torrent' });
});

test('P2P room codes can be rebased when signaling changes at runtime', () => {
  assert.equal(rebasePlayerInviteRoomCode('T7K2QAB', { strategy: 'nostr' as never }), '7K2QAB');
  assert.equal(rebasePlayerInviteRoomCode('N7K2QAB', { strategy: 'torrent' as never }), '7K2QAB');
  assert.equal(rebasePlayerInviteRoomCode('T7K2QAB', { strategy: 'auto' }), '7K2QAB');
  assert.equal(rebasePlayerInviteRoomCode('T7K2QAB', { strategy: 'mqtt' as never }), '7K2QAB');
  assert.equal(rebasePlayerInviteRoomCode('7K2QAB', { strategy: 'torrent' as never }), '7K2QAB');
  assert.equal(rebasePlayerInviteRoomCode('CUSTOM-ROOM', { strategy: 'torrent' as never }), 'CUSTOM-ROOM');
});
