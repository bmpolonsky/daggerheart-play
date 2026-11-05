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
