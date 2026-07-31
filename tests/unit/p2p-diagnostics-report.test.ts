import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildP2PDiagnosticsReport } from '../../src/services/p2p/P2PDiagnosticsReport';

test('P2P technical report contains correlation data for disconnected runtimes', () => {
  const report = JSON.parse(buildP2PDiagnosticsReport({
    generatedAt: '2026-07-31T18:00:00.000Z',
    userAgent: 'YandexBrowser test',
    url: 'https://example.test/join/ROOM42',
    media: [],
    session: {
      connected: true,
      status: 'connected',
      role: 'player',
      roomId: 'ROOM42',
      peerId: 'logical-player',
      peers: [],
      lastSnapshotAt: null,
      latestRollAnimationId: null,
      lastRequestAt: null,
      message: 'Ждем данные игры от мастера.',
      routes: [{ strategy: 'nostr', status: 'ready', activePeers: [], lastSeenAt: null, rttMs: null }],
      routePeers: []
    }
  }));

  assert.equal(report.generatedAt, '2026-07-31T18:00:00.000Z');
  assert.equal(report.browser, 'YandexBrowser test');
  assert.equal(report.session.roomId, 'ROOM42');
  assert.equal(report.session.peerId, 'logical-player');
  assert.equal(report.routes[0].status, 'ready');
});
