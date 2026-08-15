import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { SupabaseRelayTransport } from '../../src/services/SupabaseRelayTransport';
import type { P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

describe('SupabaseRelayTransport', () => {
  it('delivers only current-room events addressed to this peer', () => {
    const transport = createTransport();
    const received: Array<{ id: string; verifiedSourcePeerId?: string }> = [];
    transport.subscribe((message, context) => received.push({
      id: message.id,
      verifiedSourcePeerId: context?.verifiedSourcePeerId
    }));

    const relay = transport as unknown as {
      incarnation: string;
      handleEventRow(row: unknown): void;
    };
    relay.incarnation = 'current-room';
    relay.handleEventRow(eventRow(1, envelope('gm-peer', 'broadcast')));
    relay.handleEventRow(eventRow(2, envelope('gm-peer', 'other-player'), 'other-player'));
    relay.handleEventRow(eventRow(3, envelope('player-peer', 'own-echo')));
    relay.handleEventRow({ ...eventRow(4, envelope('gm-peer', 'old-room')), incarnation: 'old-room' });
    relay.handleEventRow(eventRow(5, envelope('gm-peer', 'direct'), 'player-peer'));

    assert.deepEqual(received, [
      { id: 'broadcast', verifiedSourcePeerId: 'supabase:gm-peer' },
      { id: 'direct', verifiedSourcePeerId: 'supabase:gm-peer' }
    ]);
  });

  it('serializes snapshot writes and coalesces queued snapshots to the newest state', async () => {
    const transport = createTransport() as unknown as {
      queueSnapshot(state: unknown): Promise<void>;
      saveSnapshot(state: unknown): Promise<void>;
    };
    const started: unknown[] = [];
    const releases: Array<() => void> = [];
    transport.saveSnapshot = async (state) => {
      started.push(state);
      await new Promise<void>((resolve) => releases.push(resolve));
    };

    const first = transport.queueSnapshot('first');
    const second = transport.queueSnapshot('second');
    const third = transport.queueSnapshot('third');
    assert.deepEqual(started, ['first']);

    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(started, ['first', 'third']);
    releases.shift()?.();
    await Promise.all([first, second, third]);
  });

  it('keeps a newer realtime fragment when an older refresh finishes later', () => {
    const transport = createTransport() as unknown as {
      fragments: Record<string, unknown>;
      revisions: Map<string, number>;
      mergeState(rows: Array<{ key: string; value: unknown; revision: number }>): void;
    };
    transport.fragments = { game: { name: 'new' } };
    transport.revisions = new Map([['game', 3]]);

    transport.mergeState([{ key: 'game', value: { name: 'old' }, revision: 2 }]);

    assert.deepEqual(transport.fragments.game, { name: 'new' });
    assert.equal(transport.revisions.get('game'), 3);
  });
});

function createTransport(): SupabaseRelayTransport {
  return new SupabaseRelayTransport(
    {
      role: 'player',
      participantId: 'player-peer',
      displayName: 'Игрок',
      worldId: '',
      initialSnapshot: undefined
    },
    { url: 'https://example.supabase.co', publishableKey: 'public-key' },
    {} as never
  );
}

function envelope(peerId: string, id: string): P2PWireEnvelope {
  return {
    version: 2,
    id,
    channel: 'data',
    sender: { peerId, role: peerId === 'gm-peer' ? 'gm' : 'player' },
    sentAt: new Date(0).toISOString(),
    payload: { kind: 'notice' }
  };
}

function eventRow(sequence: number, message: P2PWireEnvelope, targetPeerId: string | null = null) {
  return {
    sequence,
    room_id: 'ABC123',
    incarnation: 'current-room',
    author_peer_id: message.sender.peerId,
    target_peer_id: targetPeerId,
    envelope: message
  };
}
