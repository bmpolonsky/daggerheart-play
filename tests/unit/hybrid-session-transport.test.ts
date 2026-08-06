import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HybridSessionTransport } from '../../src/services/p2p/HybridSessionTransport';
import type { P2PBinaryPayload, P2PTransportAdapter, P2PTransportMessageContext, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

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

  it('passes binary assets and media to direct cross-build peers', async () => {
    const originalFetch = globalThis.fetch;
    const direct = new FakeTransport();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') return response({ cursor: 0, peers: ['pages-player'], roster: [{ peerId: 'pages-player', displayName: 'Игрок', role: 'player' }] });
      return response({ cursor: 0, peers: ['pages-player'], roster: [{ peerId: 'pages-player', displayName: 'Игрок', role: 'player' }], events: [] });
    }) as typeof fetch;
    const transport = new HybridSessionTransport(direct, context());
    const received: Array<{ peerId: string; metadata?: unknown }> = [];
    const receivedMedia: Array<{ peerId: string; metadata?: unknown }> = [];
    transport.subscribeBinary?.((_data, peerId, metadata) => received.push({ peerId, metadata }));
    transport.subscribeMediaStreams?.((_stream, peerId, metadata) => receivedMedia.push({ peerId, metadata }));
    try {
      await transport.connect('ABC123');
      direct.join('pages-player');
      await transport.sendBinary?.(new Uint8Array([1, 2, 3]), 'pages-player', { type: 'asset' });
      direct.deliverBinary(new Uint8Array([4, 5, 6]).buffer, 'pages-player', { type: 'asset-response' });
      const stream = {} as MediaStream;
      await transport.publishMediaStream?.(stream, { type: 'call' });
      direct.deliverMedia(stream, 'pages-player', { type: 'call-response' });

      assert.deepEqual(direct.binaryTargets, ['pages-player']);
      assert.deepEqual(received, [{ peerId: 'pages-player', metadata: { type: 'asset-response' } }]);
      assert.deepEqual(direct.publishedStreams, [stream]);
      assert.deepEqual(receivedMedia, [{ peerId: 'pages-player', metadata: { type: 'call-response' } }]);
    } finally {
      await transport.disconnect();
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

  it('falls back to direct P2P only when the server room is absent', async () => {
    const originalFetch = globalThis.fetch;
    const direct = new FakeTransport();
    globalThis.fetch = (async () => response({ error: 'room_not_found', message: 'Комната не найдена.' }, 404)) as typeof fetch;
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined });
    try {
      await transport.connect('ABC123');
      assert.equal(transport.sessionMode, 'p2p');
      assert.deepEqual(direct.connectedRooms, ['ABC123']);
    } finally {
      await transport.disconnect();
      globalThis.fetch = originalFetch;
    }
  });

  it('does not hide other server errors behind P2P fallback', async () => {
    const originalFetch = globalThis.fetch;
    const direct = new FakeTransport();
    globalThis.fetch = (async () => response({ error: 'master_offline', message: 'Мастер не в сети.' }, 409)) as typeof fetch;
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined });
    try {
      await assert.rejects(() => transport.connect('ABC123'), /Мастер не в сети/);
      assert.deepEqual(direct.connectedRooms, []);
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
  binaryTargets: Array<string | undefined> = [];
  publishedStreams: MediaStream[] = [];
  connectedRooms: string[] = [];
  private messages = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: unknown) => void>();
  private mediaListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();
  private joins = new Set<(peerId: string) => void>();
  async connect(roomId: string): Promise<void> { this.connectedRooms.push(roomId); }
  async disconnect(): Promise<void> {}
  async send(): Promise<void> { this.sent += 1; }
  async sendBinary(_data: P2PBinaryPayload, targetPeer?: string): Promise<void> { this.binaryTargets.push(targetPeer); }
  async publishMediaStream(stream: MediaStream): Promise<void> { this.publishedStreams.push(stream); }
  removeMediaStream(): void {}
  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void) { this.messages.add(listener); return () => this.messages.delete(listener); }
  subscribeBinary(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void) { this.binaryListeners.add(listener); return () => this.binaryListeners.delete(listener); }
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void) { this.mediaListeners.add(listener); return () => this.mediaListeners.delete(listener); }
  onPeerJoin(listener: (peerId: string) => void) { this.joins.add(listener); return () => this.joins.delete(listener); }
  onPeerLeave() { return () => undefined; }
  onError() { return () => undefined; }
  deliver(message: P2PWireEnvelope) { this.messages.forEach((listener) => listener(message)); }
  deliverBinary(data: ArrayBuffer, peerId: string, metadata?: unknown) { this.binaryListeners.forEach((listener) => listener(data, peerId, metadata)); }
  deliverMedia(stream: MediaStream, peerId: string, metadata?: unknown) { this.mediaListeners.forEach((listener) => listener(stream, peerId, metadata)); }
  join(peerId: string) { this.joins.forEach((listener) => listener(peerId)); }
}

function context() {
  return { role: 'gm' as const, participantId: 'gm-peer', displayName: 'Мастер', worldId: 'world-1', initialSnapshot: {} };
}

function envelope(peerId: string, id = 'same-event', payload: unknown = {}): P2PWireEnvelope {
  return { version: 2, id, channel: 'data', sender: { peerId, role: peerId === 'gm-peer' ? 'gm' : 'player' }, sentAt: new Date(0).toISOString(), payload };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
