import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { isMasterLeaseActive, isPlayerEnvelopeAllowed, normalizeServerRoomId } from '../../src/domain/p2p/serverSession';
import type { P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

describe('server session policy', () => {
  it('opens human room codes only during the master lease', () => {
    assert.equal(normalizeServerRoomId(' 4xzcsu '), '4XZCSU');
    assert.equal(normalizeServerRoomId('../room'), null);
    assert.equal(isMasterLeaseActive(10_001, 10_000), true);
    assert.equal(isMasterLeaseActive(10_000, 10_000), false);
  });

  it('lets anonymous players send intents but not authoritative snapshots', () => {
    assert.equal(isPlayerEnvelopeAllowed(envelope('data', { kind: 'playerTokenMove' })), true);
    assert.equal(isPlayerEnvelopeAllowed(envelope('data', { kind: 'snapshot' })), false);
    assert.equal(isPlayerEnvelopeAllowed(envelope('control', { type: 'player-ping' })), true);
    assert.equal(isPlayerEnvelopeAllowed(envelope('control', { type: 'webrtc-signal', signal: {} })), true);
  });
});

function envelope(channel: P2PWireEnvelope['channel'], payload: unknown): P2PWireEnvelope {
  return {
    version: 2,
    id: 'event-1',
    channel,
    sender: { peerId: 'player-1', role: 'player' },
    sentAt: new Date(0).toISOString(),
    payload
  };
}
