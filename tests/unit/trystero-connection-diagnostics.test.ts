import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrysteroP2PTransport } from '../../src/services/TrysteroSyncTransport';

const trystero = vi.hoisted(() => ({ join: vi.fn(() => ({
  leave: vi.fn(async () => undefined), makeAction: () => ({ send: async () => undefined })
})) }));
vi.mock('trystero', () => ({ joinRoom: trystero.join, selfId: 'test-native-peer' }));
afterEach(() => { vi.useRealTimers(); trystero.join.mockClear(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function flushImports() { await vi.dynamicImportSettled(); for (let i = 0; i < 20; i++) await Promise.resolve(); }

describe('Trystero initialization diagnostics', () => {
  it('bounds TURN initialization and never joins a room after the timeout', async () => {
    vi.useFakeTimers(); const turn = deferred<RTCIceServer[]>();
    const transport = new TrysteroP2PTransport({ turnConfigProvider: () => turn.promise });
    const pending = transport.connect('test-room', 77).catch(error => error); await flushImports();
    expect(transport.getConnectionDiagnostics()[0]).toMatchObject({ id: 'p2p-nostr', status: 'running', attempt: 77 });
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).code).toBe('timeout');
    turn.resolve([]); await flushImports(); expect(trystero.join).not.toHaveBeenCalled();
    expect(transport.getConnectionDiagnostics()[0].status).toBe('timed-out'); await transport.disconnect();
  });
  it('keeps a newer connection intact when a disconnected TURN request resolves', async () => {
    const oldTurn = deferred<RTCIceServer[]>(); let calls = 0;
    const transport = new TrysteroP2PTransport({ turnConfigProvider: () => ++calls === 1 ? oldTurn.promise : Promise.resolve([]) });
    const old = transport.connect('old-room', 1).catch(error => error); await flushImports();
    await transport.disconnect(); await transport.connect('new-room', 2);
    oldTurn.resolve([]); await old; await flushImports();
    expect(trystero.join).toHaveBeenCalledTimes(1);
    expect(transport.getConnectionDiagnostics()[0]).toMatchObject({ status: 'succeeded', attempt: 2 });
    await transport.disconnect();
  });
});

describe('Trystero room lifecycle', () => {
  function room() {
    return {
      leave: vi.fn(async () => undefined),
      makeAction: vi.fn(() => ({ send: vi.fn(async () => undefined) })),
      onPeerJoin: undefined as ((peerId: string) => void) | undefined
    };
  }

  it('waits for departure before rejoining the same room and preserves listeners', async () => {
    const first = room(); const second = room(); const departure = deferred<undefined>();
    first.leave.mockImplementation(() => departure.promise);
    trystero.join.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const transport = new TrysteroP2PTransport();
    const joined = vi.fn(); transport.onPeerJoin(joined);
    await transport.connect('same-room');
    const reconnect = transport.connect('same-room'); await flushImports();
    expect(first.leave).toHaveBeenCalledTimes(1);
    expect(trystero.join).toHaveBeenCalledTimes(1);
    await expect(transport.send({} as never)).rejects.toThrow('not connected');
    departure.resolve(undefined); await reconnect;
    second.onPeerJoin?.('peer'); expect(joined).toHaveBeenCalledWith('peer');
    await transport.disconnect();
  });

  it('only joins the latest reconnect after a shared pending departure', async () => {
    const first = room(); const replacement = room(); const departure = deferred<undefined>();
    first.leave.mockImplementation(() => departure.promise);
    trystero.join.mockReturnValueOnce(first).mockReturnValueOnce(replacement);
    const transport = new TrysteroP2PTransport(); await transport.connect('first');
    const stale = transport.connect('stale').catch(error => error); await flushImports();
    const latest = transport.connect('latest'); await flushImports();
    expect(trystero.join).toHaveBeenCalledTimes(1);
    departure.resolve(undefined); await latest;
    expect((await stale).code).toBe('cancelled');
    expect(trystero.join).toHaveBeenCalledTimes(2);
    expect(trystero.join).toHaveBeenLastCalledWith(expect.anything(), 'latest', expect.anything());
    await transport.disconnect();
  });

  it('does not join after disconnect cancels a reconnect waiting for departure', async () => {
    const first = room(); const departure = deferred<undefined>();
    first.leave.mockImplementation(() => departure.promise); trystero.join.mockReturnValueOnce(first);
    const transport = new TrysteroP2PTransport(); await transport.connect('first');
    const reconnect = transport.connect('cancelled').catch(error => error); await flushImports();
    const disconnect = transport.disconnect(); departure.resolve(undefined);
    await disconnect; expect((await reconnect).code).toBe('cancelled'); await flushImports();
    expect(trystero.join).toHaveBeenCalledTimes(1);
    expect(first.leave).toHaveBeenCalledTimes(1);
  });

  it('leaves a partially initialized room and clears its actions when setup fails', async () => {
    const partial = room(); const failure = new Error('binary action setup failed');
    partial.makeAction.mockImplementationOnce(() => ({ send: vi.fn(async () => undefined) }))
      .mockImplementationOnce(() => { throw failure; });
    trystero.join.mockReturnValueOnce(partial);
    const transport = new TrysteroP2PTransport();
    await expect(transport.connect('broken')).rejects.toBe(failure);
    expect(partial.leave).toHaveBeenCalledTimes(1);
    await expect(transport.send({} as never)).rejects.toThrow('not connected');
    await transport.connect('recovered'); await transport.disconnect();
    expect(partial.leave).toHaveBeenCalledTimes(1);
  });
});
