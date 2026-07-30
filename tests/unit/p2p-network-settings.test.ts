import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  readTrysteroSupabaseConfig,
  readP2PNetworkSettings,
  trysteroOptionsForNetworkSettings,
  writeP2PNetworkSettings
} from '../../src/domain/p2p/networkSettings';
import { MultiStrategyP2PTransport, resolveTrysteroCandidates } from '../../src/services/p2p/MultiStrategyP2PTransport';
import type { P2PTransportAdapter, P2PTransportMessageContext, P2PTransportStrategy, P2PWireEnvelope } from '../../src/services/p2p/P2PTransportAdapter';

test('P2P network settings always use auto strategy', () => {
  writeP2PNetworkSettings({ strategy: 'auto' });
  assert.equal(readP2PNetworkSettings().strategy, 'auto');
  assert.deepEqual(trysteroOptionsForNetworkSettings(readP2PNetworkSettings(), {}), { strategy: 'auto' });
  const settings = writeP2PNetworkSettings({ strategy: 'nostr' as never });
  assert.equal(readP2PNetworkSettings().strategy, 'auto');
  assert.deepEqual(trysteroOptionsForNetworkSettings(settings, {}), { strategy: 'auto' });
});

test('P2P network settings include Supabase env without exposing a manual Supabase mode', () => {
  assert.deepEqual(readTrysteroSupabaseConfig({}), {});
  assert.deepEqual(readTrysteroSupabaseConfig({
    VITE_TRYSTERO_SUPABASE_URL: ' https://example.supabase.co ',
    VITE_TRYSTERO_SUPABASE_ANON_KEY: ' anon-key '
  }), {
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key'
  });

  const settings = writeP2PNetworkSettings({ strategy: 'supabase' as never });
  assert.equal(readP2PNetworkSettings().strategy, 'auto');
  assert.deepEqual(trysteroOptionsForNetworkSettings(settings, {
    VITE_TRYSTERO_SUPABASE_URL: 'https://example.supabase.co',
    VITE_TRYSTERO_SUPABASE_ANON_KEY: 'anon-key'
  }), {
    strategy: 'auto',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key'
  });
});

test('auto P2P candidates prefer Supabase only when configured', () => {
  assert.deepEqual(resolveTrysteroCandidates({ mode: 'auto' }), ['nostr', 'mqtt', 'torrent']);
  assert.deepEqual(resolveTrysteroCandidates({
    mode: 'auto',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key'
  }), ['supabase', 'nostr', 'mqtt', 'torrent']);
  assert.deepEqual(resolveTrysteroCandidates({ mode: 'mqtt' }), ['mqtt']);
});

test('auto P2P bootstrap resolves after the first ready route while others keep probing', async () => {
  const transport = new MultiStrategyP2PTransport({
    mode: 'auto',
    candidates: ['supabase', 'mqtt'],
    createTransport: (options) => {
      const strategy = options.strategy && options.strategy !== 'auto' ? options.strategy : 'mqtt';
      return strategy === 'supabase'
        ? new TestP2PTransport('supabase', 'hang')
        : new TestP2PTransport(strategy, 'ready');
    }
  });

  await Promise.race([
    transport.connect('dynamic-room'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('connect timed out')), 100))
  ]);

  assert.equal(transport.getRouteDiagnostics().find((route) => route.strategy === 'supabase')?.status, 'probing');
  assert.equal(transport.getRouteDiagnostics().find((route) => route.strategy === 'mqtt')?.status, 'ready');
});

test('auto P2P disconnect cleans up a route that resolves after it became stale', async () => {
  let resolveSupabase: (() => void) | undefined;
  const supabase = new TestP2PTransport('supabase', 'deferred', (resolve) => {
    resolveSupabase = resolve;
  });
  const mqtt = new TestP2PTransport('mqtt', 'ready');
  const transport = new MultiStrategyP2PTransport({
    mode: 'auto',
    candidates: ['supabase', 'mqtt'],
    createTransport: (options) => options.strategy === 'supabase' ? supabase : mqtt
  });

  await transport.connect('stale-route-room');
  await transport.disconnect();
  resolveSupabase?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(supabase.disconnects, 3);
  assert.equal(mqtt.disconnects, 2);
  assert.equal(transport.getRouteDiagnostics().find((route) => route.strategy === 'supabase')?.status, 'probing');
});

test('auto P2P exposes verified physical source separately from claimed logical peer id', async () => {
  const mqtt = new TestP2PTransport('mqtt', 'ready');
  const transport = new MultiStrategyP2PTransport({
    mode: 'auto',
    candidates: ['mqtt'],
    createTransport: () => mqtt
  });
  const receivedSources: Array<string | undefined> = [];
  transport.subscribe((_envelope, context) => {
    receivedSources.push(context?.sourcePeerId);
    receivedSources.push(context?.verifiedSourcePeerId);
  });

  await transport.connect('spoof-room');
  const envelope = (id: string): P2PWireEnvelope => ({
    version: 2,
    id,
    channel: 'data',
    sender: {
      peerId: 'logical-owner',
      role: 'player'
    },
    sentAt: '2026-05-26T00:00:00.000Z',
    payload: {
      id: `sync-${id}`,
      kind: 'snapshotRequest',
      createdAt: '2026-05-26T00:00:00.000Z',
      authorId: 'player',
      value: {
        requestedAt: '2026-05-26T00:00:00.000Z',
        reason: 'manual'
      }
    }
  });

  mqtt.emit(envelope('from-owner'), 'physical-owner');
  mqtt.emit(envelope('from-rogue'), 'physical-rogue');

  assert.deepEqual(receivedSources, [
    'logical-owner',
    'mqtt:physical-owner',
    'logical-owner',
    'mqtt:physical-rogue'
  ]);
  assert.deepEqual(transport.getPeerDiagnostics().map((peer) => peer.peerId), ['logical-owner']);
});

test('auto P2P accepts replacement media after an active route switch and ignores the stale route', async () => {
  const mqtt = new TestP2PTransport('mqtt', 'ready');
  const nostr = new TestP2PTransport('nostr', 'ready');
  const transport = new MultiStrategyP2PTransport({
    mode: 'auto',
    candidates: ['mqtt', 'nostr'],
    createTransport: (options) => options.strategy === 'nostr' ? nostr : mqtt
  });
  const received: MediaStream[] = [];
  transport.subscribeMediaStreams((stream) => received.push(stream));
  const envelope = (id: string): P2PWireEnvelope => ({
    version: 2,
    id,
    channel: 'data',
    sender: {
      peerId: 'logical-owner',
      role: 'player'
    },
    sentAt: '2026-05-26T00:00:00.000Z',
    payload: { type: 'media-route-probe', id }
  });
  const firstStream = { id: 'stable-stream-id' } as MediaStream;
  const replacementStream = { id: 'stable-stream-id' } as MediaStream;

  await transport.connect('media-route-room');
  mqtt.emit(envelope('mqtt-active'), 'physical-mqtt');
  mqtt.emitMediaStream(firstStream, 'physical-mqtt', { kind: 'call' });
  nostr.emit(envelope('nostr-active'), 'physical-nostr');
  nostr.emitMediaStream(replacementStream, 'physical-nostr', { kind: 'call' });
  mqtt.emitMediaStream(firstStream, 'physical-mqtt', { kind: 'call' });

  assert.deepEqual(received, [firstStream, replacementStream]);
});

class TestP2PTransport implements P2PTransportAdapter {
  readonly id = 'test-p2p';
  readonly label = 'Test P2P';
  peerId = '';
  disconnects = 0;
  private readonly listeners = new Set<(envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void>();
  private readonly mediaListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();

  constructor(
    private readonly strategy: P2PTransportStrategy,
    private readonly connectMode: 'ready' | 'hang' | 'deferred',
    private readonly onDeferredConnect?: (resolve: () => void) => void
  ) {}

  async connect(): Promise<void> {
    if (this.connectMode === 'hang') {
      await new Promise(() => undefined);
      return;
    }
    if (this.connectMode === 'deferred') {
      await new Promise<void>((resolve) => this.onDeferredConnect?.(resolve));
    }
    this.peerId = `test-peer-${this.strategy}`;
  }

  async disconnect(): Promise<void> {
    this.disconnects += 1;
    this.peerId = '';
  }

  async send(_envelope: P2PWireEnvelope): Promise<void> {}

  subscribe(listener: (envelope: P2PWireEnvelope, context?: P2PTransportMessageContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPeerJoin(): () => void {
    return () => undefined;
  }

  onPeerLeave(): () => void {
    return () => undefined;
  }

  onError(): () => void {
    return () => undefined;
  }

  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void {
    this.mediaListeners.add(listener);
    return () => this.mediaListeners.delete(listener);
  }

  emit(envelope: P2PWireEnvelope, sourcePeerId: string): void {
    this.listeners.forEach((listener) => listener(envelope, { sourcePeerId }));
  }

  emitMediaStream(stream: MediaStream, peerId: string, metadata?: unknown): void {
    this.mediaListeners.forEach((listener) => listener(stream, peerId, metadata));
  }
}
