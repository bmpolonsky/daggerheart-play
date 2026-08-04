import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { ServerRelayTransport } from '../../src/services/ServerRelayTransport';
import type { P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';
import { waitFor } from './helpers';

describe('ServerRelayTransport', () => {
  it('keeps the browser fetch receiver when using the default fetcher', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (function (this: typeof globalThis) {
      assert.equal(this, globalThis);
      return Promise.resolve(response({ cursor: 0, peers: [] }));
    }) as typeof fetch;
    const transport = new ServerRelayTransport({
      role: 'gm',
      participantId: 'gm-peer',
      displayName: 'Мастер',
      worldId: 'world-1',
      initialSnapshot: {}
    });

    try {
      await transport.connect('ABC123');
      await transport.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('opens an authenticated master room and receives relayed events', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    let polled = false;
    const incoming = envelope('player-peer', 'player', 'data', { kind: 'snapshotRequest' });
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push({ path, init });
      if (init?.method === 'PUT') return response({ cursor: 0, peers: ['player-peer'] });
      if (path.includes('/events?')) {
        const events = polled ? [] : [{ sequence: 1, envelope: incoming }];
        polled = true;
        return response({ cursor: 1, peers: ['player-peer'], events });
      }
      return response({ sequence: 2 });
    };
    const transport = new ServerRelayTransport({
      role: 'gm',
      participantId: 'gm-peer',
      displayName: 'Мастер',
      worldId: 'world-1',
      initialSnapshot: { game: { name: 'Тестовый мир' } }
    }, fetcher as typeof fetch);
    const joined: string[] = [];
    const received: P2PWireEnvelope[] = [];
    transport.onPeerJoin((peerId) => joined.push(peerId));
    transport.subscribe((message) => received.push(message));

    await transport.connect('ABC123');
    await waitFor(() => assert.equal(received.length, 1));
    await transport.send(envelope('gm-peer', 'gm', 'control', { type: 'gm-pong' }), 'player-peer');
    await transport.disconnect();

    assert.deepEqual(joined, ['player-peer']);
    assert.equal(received[0].sender.peerId, 'player-peer');
    assert.match(calls.find((call) => call.path.includes('/events?'))?.path ?? '', /[?&]wait=15000/);
    const openBody = JSON.parse(String(calls.find((call) => call.init?.method === 'PUT')?.init?.body));
    assert.equal(openBody.worldId, 'world-1');
    assert.equal(openBody.snapshot.game.name, 'Тестовый мир');
  });

  it('uses the anonymous participant token after joining', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = [];
    const received: P2PWireEnvelope[] = [];
    const initialEvent = envelope('gm-peer', 'gm', 'data', {
      id: 'initial-snapshot',
      createdAt: new Date(0).toISOString(),
      authorId: 'gm-peer',
      kind: 'snapshot',
      value: { game: { name: 'Серверный мир' } }
    });
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push({ path, init });
      if (path.endsWith('/join')) return response({ cursor: 0, peers: ['gm-peer'], participantToken: 'secret-player-token', initialEvent });
      if (path.includes('/events?')) return response({ cursor: 0, peers: ['gm-peer'], events: [] });
      return response({ sequence: 1 });
    };
    const transport = new ServerRelayTransport({
      role: 'player',
      participantId: 'player-peer',
      displayName: 'Игрок',
      worldId: 'unused'
    }, fetcher as typeof fetch);
    transport.subscribe((event) => received.push(event));

    await transport.connect('ABC123');
    await transport.send(envelope('player-peer', 'player', 'control', { type: 'player-ping' }));
    await transport.disconnect();

    const eventCall = calls.find((call) => call.init?.method === 'POST' && call.path.endsWith('/events'));
    const headers = new Headers(eventCall?.init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer secret-player-token');
    assert.equal(headers.get('x-daggerheart-peer-id'), 'player-peer');
    assert.equal(received[0]?.id, initialEvent.id);
  });
});

function envelope(peerId: string, role: 'gm' | 'player', channel: 'control' | 'data', payload: unknown): P2PWireEnvelope {
  return {
    version: 2,
    id: `${peerId}-${channel}`,
    channel,
    sender: { peerId, role },
    sentAt: new Date(0).toISOString(),
    payload
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
