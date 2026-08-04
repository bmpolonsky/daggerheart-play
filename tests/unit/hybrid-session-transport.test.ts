import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HybridSessionTransport } from '../../src/services/p2p/HybridSessionTransport';
import type { P2PTransportAdapter, P2PTransportMessageContext, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

describe('HybridSessionTransport', () => {
  it('accepts the initial cloud snapshot and server fallback events', async () => {
    const originalFetch = globalThis.fetch;
    const initial = envelope('gm-peer', 'initial', { id: 'server-snapshot-ABC123-1', kind: 'snapshot' });
    const fallback = envelope('gm-peer', 'fallback', { id: 'fallback-event', kind: 'snapshot' });
    let polled = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).endsWith('/join')) {
        return response({ cursor: 0, peers: ['gm-peer'], roster: [{ peerId: 'gm-peer', displayName: 'Мастер', role: 'gm' }], participantToken: 'token', initialEvent: initial });
      }
      const events = polled ? [] : [{ sequence: 1, envelope: fallback }];
      polled = true;
      return response({ cursor: 1, peers: ['gm-peer'], roster: [{ peerId: 'gm-peer', displayName: 'Мастер', role: 'gm' }], events });
    }) as typeof fetch;
    const direct = new FakeTransport();
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined });
    const received: string[] = [];
    transport.subscribe((envelope) => received.push(envelope.id));
    try {
      await transport.connect('ABC123');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await transport.disconnect();
      assert.deepEqual(received, [initial.id, fallback.id]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps game events on the direct transport', async () => {
    const originalFetch = globalThis.fetch;
    const direct = new FakeTransport();
    let serverPosts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === 'PUT') return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }] });
      if (init?.method === 'POST' && path.endsWith('/events')) {
        serverPosts += 1;
        return response({ accepted: true });
      }
      return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }], events: [] });
    }) as typeof fetch;
    const transport = new HybridSessionTransport(direct, context());
    try {
      await transport.connect('ABC123');
      direct.join('player-peer');
      await transport.send(envelope('gm-peer'));
      assert.equal(direct.sent, 1);
      assert.equal(serverPosts, 0);
      await transport.disconnect();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the server for game events until a direct peer is available', async () => {
    const originalFetch = globalThis.fetch;
    const direct = new FakeTransport();
    let serverPosts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === 'PUT') return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }] });
      if (init?.method === 'POST' && path.endsWith('/events')) {
        serverPosts += 1;
        return response({ accepted: true });
      }
      return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }], events: [] });
    }) as typeof fetch;
    const transport = new HybridSessionTransport(direct, context());
    try {
      await transport.connect('ABC123');
      await transport.send(envelope('gm-peer'));
      assert.equal(serverPosts, 1);
      assert.equal(direct.sent, 0);

      direct.join('player-peer');
      await transport.send(envelope('gm-peer', 'direct-event'));
      assert.equal(serverPosts, 1);
      assert.equal(direct.sent, 1);
    } finally {
      await transport.disconnect();
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the server roster without creating a second WebRTC connection', async () => {
    const originalFetch = globalThis.fetch;
    const posts: Array<{ envelope?: P2PWireEnvelope; targetPeer?: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === 'PUT') return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }] });
      if (init?.method === 'POST' && path.endsWith('/events')) {
        posts.push(JSON.parse(String(init.body)));
        return response({ accepted: true });
      }
      return response({ cursor: 0, peers: ['player-peer'], roster: [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }], events: [] });
    }) as typeof fetch;
    const transport = new HybridSessionTransport(new FakeTransport(), context());
    try {
      await transport.connect('ABC123');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const signal = posts.find((post) => (post.envelope?.payload as { type?: unknown } | undefined)?.type === 'webrtc-signal');
      assert.equal(signal, undefined);
      assert.deepEqual(transport.getRoster(), [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }]);
      assert.deepEqual(transport.getDirectPeerIds(), []);
    } finally {
      await transport.disconnect();
      globalThis.fetch = originalFetch;
    }
  });
});

class FakeTransport implements P2PTransportAdapter {
  readonly id = 'fake';
  readonly label = 'Fake';
  peerId = 'gm-peer';
  sent = 0;
  private messages = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private joins = new Set<(peerId: string) => void>();
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async send(): Promise<void> { this.sent += 1; }
  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void) { this.messages.add(listener); return () => this.messages.delete(listener); }
  onPeerJoin(listener: (peerId: string) => void) { this.joins.add(listener); return () => this.joins.delete(listener); }
  onPeerLeave() { return () => undefined; }
  onError() { return () => undefined; }
  deliver(message: P2PWireEnvelope) { this.messages.forEach((listener) => listener(message)); }
  join(peerId: string) { this.joins.forEach((listener) => listener(peerId)); }
}

function context() {
  return { role: 'gm' as const, participantId: 'gm-peer', displayName: 'Мастер', worldId: 'world-1', initialSnapshot: {} };
}

function envelope(peerId: string, id = 'same-event', payload: unknown = {}): P2PWireEnvelope {
  return { version: 2, id, channel: 'data', sender: { peerId, role: peerId === 'gm-peer' ? 'gm' : 'player' }, sentAt: new Date(0).toISOString(), payload };
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
