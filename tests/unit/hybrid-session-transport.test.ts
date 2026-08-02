import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HybridSessionTransport } from '../../src/services/p2p/HybridSessionTransport';
import type { P2PTransportAdapter, P2PTransportMessageContext, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

describe('HybridSessionTransport', () => {
  it('accepts the initial cloud snapshot but does not replay server event history', async () => {
    const originalFetch = globalThis.fetch;
    const initial = envelope('gm-peer', 'initial', { id: 'server-snapshot-ABC123-1', kind: 'snapshot' });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).endsWith('/join')) {
        return response({ cursor: 0, peers: ['gm-peer'], roster: [{ peerId: 'gm-peer', displayName: 'Мастер', role: 'gm' }], participantToken: 'token', initialEvent: initial });
      }
      return response({ cursor: 1, peers: ['gm-peer'], roster: [{ peerId: 'gm-peer', displayName: 'Мастер', role: 'gm' }], events: [{ sequence: 1, envelope: envelope('gm-peer', 'history') }] });
    }) as typeof fetch;
    const direct = new FakeTransport();
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined });
    const received: string[] = [];
    transport.subscribe((envelope) => received.push(envelope.id));
    try {
      await transport.connect('ABC123');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await transport.disconnect();
      assert.deepEqual(received, [initial.id]);
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

  it('uses the server to exchange WebRTC signaling only', async () => {
    const originalFetch = globalThis.fetch;
    const originalRtc = globalThis.RTCPeerConnection;
    const posts: Array<{ envelope?: P2PWireEnvelope; targetPeer?: string }> = [];
    globalThis.RTCPeerConnection = FakePeerConnection as unknown as typeof RTCPeerConnection;
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
      assert.equal(signal?.targetPeer, 'player-peer');
      assert.equal(signal?.envelope?.channel, 'control');
    } finally {
      await transport.disconnect();
      globalThis.fetch = originalFetch;
      globalThis.RTCPeerConnection = originalRtc;
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

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  remoteDescription: RTCSessionDescription | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  createDataChannel() { return { readyState: 'connecting', close() {}, send() {} } as unknown as RTCDataChannel; }
  async createOffer() { return { type: 'offer' as const, sdp: 'offer' }; }
  async createAnswer() { return { type: 'answer' as const, sdp: 'answer' }; }
  async setLocalDescription() {}
  async setRemoteDescription(description: RTCSessionDescriptionInit) { this.remoteDescription = description as RTCSessionDescription; }
  async addIceCandidate() {}
  close() { this.connectionState = 'closed'; }
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
