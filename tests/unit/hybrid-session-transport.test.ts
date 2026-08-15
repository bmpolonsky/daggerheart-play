import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { HybridSessionTransport } from '../../src/services/p2p/HybridSessionTransport';
import { RelayTransportError } from '../../src/services/p2p/RelayTransportError';
import type { P2PBinaryPayload, P2PTransportAdapter, P2PTransportMessageContext, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

describe('HybridSessionTransport', () => {
  it('can keep game state server-first while leaving binary media direct', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(direct, context(), {
      server,
      serverFirst: true,
      fallbackToDirect: false
    });
    await transport.connect('ABC123');
    direct.join('player-peer');

    await transport.send(envelope('gm-peer'));

    assert.equal(server.sent, 1);
    assert.equal(direct.sent, 0);
    await transport.disconnect();
  });

  it('falls back to an established direct route when the server fails after connect', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(direct, context(), {
      server,
      serverFirst: true,
      fallbackToDirect: false
    });
    await transport.connect('ABC123');
    direct.join('player-peer');
    server.sendError = new Error('server unavailable');

    const message = envelope('gm-peer', 'direct-fallback');
    await transport.send(message);
    direct.deliver(message);

    assert.equal(server.sent, 1);
    assert.equal(direct.sent, 1);
    assert.equal(transport.sessionMode, 'p2p');
    await transport.disconnect();
  });

  it('accepts the initial cloud snapshot and server fallback events', async () => {
    const initial = envelope('gm-peer', 'initial', { id: 'server-snapshot-ABC123-1', kind: 'snapshot' });
    const fallback = envelope('gm-peer', 'fallback', { id: 'fallback-event', kind: 'snapshot' });
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(
      direct,
      { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined },
      { server }
    );
    const received: string[] = [];
    transport.subscribe((envelope) => received.push(envelope.id));
    await transport.connect('ABC123');
    server.deliver(initial);
    server.deliver(fallback);
    await transport.disconnect();
    assert.deepEqual(received, [initial.id, fallback.id]);
  });

  it('keeps game events on the direct transport', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(direct, context(), { server });
    await transport.connect('ABC123');
    direct.join('player-peer');
    await transport.send(envelope('gm-peer'));
    assert.equal(direct.sent, 1);
    assert.equal(server.sent, 0);
    await transport.disconnect();
  });

  it('passes binary assets and media to direct cross-build peers', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(direct, context(), { server });
    const received: Array<{ peerId: string; metadata?: unknown }> = [];
    const receivedMedia: Array<{ peerId: string; metadata?: unknown }> = [];
    transport.subscribeBinary?.((_data, peerId, metadata) => received.push({ peerId, metadata }));
    transport.subscribeMediaStreams?.((_stream, peerId, metadata) => receivedMedia.push({ peerId, metadata }));
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
    await transport.disconnect();
  });

  it('uses the server for game events until a direct peer is available', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    const transport = new HybridSessionTransport(direct, context(), { server });
    await transport.connect('ABC123');
    await transport.send(envelope('gm-peer'));
    assert.equal(server.sent, 1);
    assert.equal(direct.sent, 0);
    direct.join('player-peer');
    await transport.send(envelope('gm-peer', 'direct-event'));
    assert.equal(server.sent, 1);
    assert.equal(direct.sent, 1);
    await transport.disconnect();
  });

  it('uses the server roster without creating a second WebRTC connection', async () => {
    const server = new FakeTransport();
    server.roster = [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }];
    const transport = new HybridSessionTransport(new FakeTransport(), context(), { server });
    await transport.connect('ABC123');
    assert.equal(server.sent, 0);
    assert.deepEqual(transport.getRoster(), [{ peerId: 'player-peer', displayName: 'Игрок', role: 'player' }]);
    assert.deepEqual(transport.getDirectPeerIds(), []);
    await transport.disconnect();
  });

  it('falls back to direct P2P only when the server room is absent', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    server.connectError = new RelayTransportError('Комната не найдена.', 'room_not_found', 404);
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined }, { server });
    await transport.connect('ABC123');
    assert.deepEqual(direct.connectedRooms, ['ABC123']);
  });

  it('does not hide other server errors behind P2P fallback', async () => {
    const direct = new FakeTransport();
    const server = new FakeTransport();
    server.connectError = new Error('Мастер не в сети.');
    const transport = new HybridSessionTransport(direct, { ...context(), role: 'player', participantId: 'player-peer', initialSnapshot: undefined }, { server });
    await assert.rejects(() => transport.connect('ABC123'), /Мастер не в сети/);
    assert.deepEqual(direct.connectedRooms, []);
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
  connectError: Error | null = null;
  sendError: Error | null = null;
  roster: Array<{ peerId: string; displayName: string; role: 'gm' | 'player' }> = [];
  private messages = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: unknown) => void>();
  private mediaListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();
  private joins = new Set<(peerId: string) => void>();
  async connect(roomId: string): Promise<void> { if (this.connectError) throw this.connectError; this.connectedRooms.push(roomId); }
  async disconnect(): Promise<void> {}
  async send(): Promise<void> { this.sent += 1; if (this.sendError) throw this.sendError; }
  async sendBinary(_data: P2PBinaryPayload, targetPeer?: string): Promise<void> { this.binaryTargets.push(targetPeer); }
  async publishMediaStream(stream: MediaStream): Promise<void> { this.publishedStreams.push(stream); }
  removeMediaStream(): void {}
  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void) { this.messages.add(listener); return () => this.messages.delete(listener); }
  subscribeBinary(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void) { this.binaryListeners.add(listener); return () => this.binaryListeners.delete(listener); }
  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void) { this.mediaListeners.add(listener); return () => this.mediaListeners.delete(listener); }
  onPeerJoin(listener: (peerId: string) => void) { this.joins.add(listener); return () => this.joins.delete(listener); }
  onPeerLeave() { return () => undefined; }
  onError() { return () => undefined; }
  onRosterChange(listener: (roster: Array<{ peerId: string; displayName: string; role: 'gm' | 'player' }>) => void) {
    listener(this.roster);
    return () => undefined;
  }
  getRoster() { return this.roster; }
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
