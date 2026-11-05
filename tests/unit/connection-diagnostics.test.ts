import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionDiagnostics } from '../../src/services/p2p/ConnectionDiagnostics';
import { SupabaseRelayTransport } from '../../src/services/SupabaseRelayTransport';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';
import { HybridSessionTransport } from '../../src/services/p2p/HybridSessionTransport';
import type { P2PTransportAdapter } from '../../src/services/p2p/P2PTransportAdapter';

const auth = vi.hoisted(() => ({ run: vi.fn(async (): Promise<void> => undefined) }));
vi.mock('../../src/services/supabaseClient', () => ({
  ensureSupabaseGuestSignedIn: async (_config: unknown, diagnostics: ConnectionDiagnostics) => diagnostics.run('auth-session', () => auth.run()),
  setSupabaseDataRole: async () => undefined
}));
afterEach(() => { vi.useRealTimers(); auth.run.mockReset(); auth.run.mockResolvedValue(undefined); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const response = { incarnation: 'test-incarnation', cursor: 0, ownerId: 'test-owner', worldId: 'test-world', roster: [], stateRows: [] };
function createRelay(options: { join?: Promise<unknown>; realtime?: string; state?: Promise<unknown> } = {}) {
  let status: ((value: string) => void) | undefined;
  const signals: AbortSignal[] = [];
  function abortable<T>(promise: Promise<T>) { return Object.assign(promise, { abortSignal(signal: AbortSignal) { signals.push(signal); return promise; } }); }
  const client = {
    rpc: vi.fn((name: string) => abortable(name === 'dh_join_room' ? options.join ?? Promise.resolve({ data: response, error: null }) : Promise.resolve({ data: null, error: null }))),
    channel: () => ({ on() { return this; }, subscribe(callback: (value: string) => void) { status = callback; if (options.realtime !== 'pending') callback(options.realtime ?? 'SUBSCRIBED'); } }),
    removeChannel: vi.fn(async () => undefined),
    from: (table: string) => {
      const promise = table === 'dh_world_state' ? options.state ?? Promise.resolve({ data: [], error: null }) : Promise.resolve({ data: [], error: null });
      return { select() { return this; }, eq() { return this; }, gt() { return this; }, order() { return this; }, abortSignal(signal: AbortSignal) { signals.push(signal); return this; }, then: promise.then.bind(promise) };
    }
  };
  const relay = new SupabaseRelayTransport({ role: 'player', participantId: 'test-player', displayName: 'test', worldId: 'test-world' }, { url: 'https://example.invalid', publishableKey: 'test' }, client as never);
  return { relay, client, signals, status: (value: string) => status?.(value) };
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }

describe('connection stage diagnostics', () => {
  it('measures successful stages without storing their result', async () => {
    vi.useFakeTimers();
    const changed = vi.fn(); const diagnostics = new ConnectionDiagnostics(changed);
    diagnostics.reset(['room-join']);
    const result = deferred<string>();
    const pending = diagnostics.run('room-join', () => result.promise, 100);
    await vi.advanceTimersByTimeAsync(32); result.resolve('private-game-state');
    expect(await pending).toBe('private-game-state');
    expect(diagnostics.snapshot()[0]).toMatchObject({ id: 'room-join', status: 'succeeded' });
    const stage = diagnostics.snapshot()[0]; expect(stage.finishedAt! - stage.startedAt!).toBe(32);
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain('private-game-state');
  });
  it('bounds stalled stages and aborts their request, retaining the terminal cause', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const diagnostics = new ConnectionDiagnostics(() => undefined);
    const pending = diagnostics.run('room-join', current => { signal = current; return new Promise(() => undefined); }, 100).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending as { code: string }).code).toBe('timeout'); expect(signal?.aborted).toBe(true);
    diagnostics.cancel();
    expect(diagnostics.snapshot()[0]).toMatchObject({ status: 'timed-out', errorCode: 'timeout' });
  });
  it('does not allow an old completion to overwrite a replacement attempt', async () => {
    const diagnostics = new ConnectionDiagnostics(() => undefined); const old = deferred<void>();
    const pending = diagnostics.run('room-join', () => old.promise).catch(error => error);
    await flush(); diagnostics.reset(['room-join']);
    await diagnostics.run('room-join', async () => undefined); old.resolve(); await pending;
    expect(diagnostics.snapshot()[0].status).toBe('succeeded');
  });
  it('does not store arbitrary backend error messages or codes', async () => {
    const diagnostics = new ConnectionDiagnostics(() => undefined);
    await diagnostics.run('room-join', async () => { throw { message: 'secret-url-and-token', code: 'secret-code' }; }).catch(() => undefined);
    expect(diagnostics.snapshot()[0]).toMatchObject({ status: 'failed', errorCode: 'server_error' });
    expect(JSON.stringify(diagnostics.snapshot())).not.toContain('secret');
  });
  it('does not even start the operation if synchronously cancelled by a diagnostic listener', async () => {
    let diagnostics: ConnectionDiagnostics; const operation = vi.fn(async () => undefined);
    diagnostics = new ConnectionDiagnostics(() => { if (diagnostics.snapshot().some(stage => stage.status === 'running')) diagnostics.cancel(); });
    await diagnostics.run('room-join', operation).catch(() => undefined);
    expect(operation).not.toHaveBeenCalled();
  });
});

describe('cloud connection stages', () => {
  it('exposes a stalled auth check before any room RPC or P2P attempt', async () => {
    vi.useFakeTimers(); auth.run.mockImplementation(() => new Promise(() => undefined));
    const { relay, client } = createRelay();
    const pending = relay.connect('test-room').catch(error => error); await flush();
    expect(relay.getConnectionDiagnostics().find(stage => stage.id === 'auth-session')?.status).toBe('running');
    expect(client.rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).code).toBe('timeout');
    expect(relay.getConnectionDiagnostics().find(stage => stage.id === 'auth-session')?.status).toBe('timed-out');
    await relay.disconnect();
  });
  it('aborts a timed-out join, ignores its late response, and retains failure after disconnect', async () => {
    vi.useFakeTimers(); const join = deferred<unknown>(); const { relay, client, signals } = createRelay({ join: join.promise });
    const pending = relay.connect('test-room').catch(error => error); await flush();
    expect(relay.getConnectionDiagnostics().find(stage => stage.id === 'room-join')?.status).toBe('running');
    await vi.advanceTimersByTimeAsync(15_000); expect((await pending).code).toBe('timeout');
    expect(signals[0].aborted).toBe(true);
    join.resolve({ data: { ...response, roster: [{ peerId: 'late-peer', displayName: 'late', role: 'gm' }] }, error: null }); await flush();
    expect(relay.getRoster()).toEqual([]); expect(client.removeChannel).not.toHaveBeenCalled();
    await relay.disconnect();
    expect(relay.getConnectionDiagnostics().find(stage => stage.id === 'room-join')?.status).toBe('timed-out');
  });
  it('reports a closed initial websocket instead of hanging forever', async () => {
    const { relay } = createRelay({ realtime: 'CLOSED' });
    await expect(relay.connect('test-room')).rejects.toMatchObject({ code: 'realtime_closed' });
    expect(relay.getConnectionDiagnostics().find(stage => stage.id === 'realtime')).toMatchObject({ status: 'failed', errorCode: 'realtime_closed' });
    await relay.disconnect();
  });
  it('identifies exactly the HTTP read still pending after realtime succeeded', async () => {
    vi.useFakeTimers(); const state = deferred<unknown>(); const { relay } = createRelay({ state: state.promise });
    const pending = relay.connect('test-room').catch(error => error); await flush();
    const stages = relay.getConnectionDiagnostics();
    expect(stages.find(stage => stage.id === 'realtime')?.status).toBe('succeeded');
    expect(stages.find(stage => stage.id === 'state')?.status).toBe('running');
    expect(stages.find(stage => stage.id === 'roster')?.status).toBe('succeeded');
    await vi.advanceTimersByTimeAsync(15_000); await pending; state.resolve({ data: [], error: null }); await flush(); await relay.disconnect();
  });
  it('cancels auth without issuing a join when its delayed result finally arrives', async () => {
    const authentication = deferred<void>(); auth.run.mockImplementation(() => authentication.promise);
    const { relay, client } = createRelay();
    const pending = relay.connect('test-room').catch(error => error); await flush();
    await relay.disconnect(); authentication.resolve(); await pending;
    expect(client.rpc).not.toHaveBeenCalled(); expect(relay.getRoster()).toEqual([]);
  });
  it('passes server diagnostics through hybrid while P2P is explicitly waiting for cloud', async () => {
    const authentication = deferred<void>(); auth.run.mockImplementation(() => authentication.promise);
    const { relay } = createRelay();
    const direct = { peerId: '', connect: vi.fn(async () => undefined), disconnect: async () => undefined,
      subscribe: () => () => undefined, onPeerJoin: () => () => undefined, onPeerLeave: () => () => undefined, onError: () => () => undefined,
      getRouteDiagnostics: () => [{ strategy: 'nostr', status: 'probing', activePeers: [], lastSeenAt: null, rttMs: null }]
    } as unknown as P2PTransportAdapter;
    const hybrid = new HybridSessionTransport(direct, { role: 'player', participantId: 'test-player', displayName: 'test', worldId: '' }, { server: relay });
    const changed = vi.fn(); hybrid.onDiagnosticsChange(changed);
    const pending = hybrid.connect('test-room').catch(error => error); await flush();
    expect(hybrid.getRouteDiagnostics()[0].status).toBe('waiting');
    expect(hybrid.getConnectionDiagnostics().find(stage => stage.id === 'auth-session')?.status).toBe('running');
    expect(direct.connect).not.toHaveBeenCalled(); expect(changed).toHaveBeenCalled();
    await hybrid.disconnect(); authentication.resolve(); await pending; expect(direct.connect).not.toHaveBeenCalled();
  });
});

it('retains the exact failed cloud stage through the real player session catch and cleanup', async () => {
  const restore = installTimerWindow();
  const { relay } = createRelay({ realtime: 'CLOSED' });
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), { transportFactory: () => relay });
  try {
    await expect(session.startPlayerRoom({ roomId: 'test-room', participantName: 'test', connectionMode: 'server' })).rejects.toMatchObject({ code: 'realtime_closed' });
    expect(session.session$.get().status).toBe('error');
    expect(session.session$.get().connectionDiagnostics?.find(stage => stage.id === 'realtime')).toMatchObject({ status: 'failed', errorCode: 'realtime_closed' });
  } finally { await session.stop(); restore(); }
});
