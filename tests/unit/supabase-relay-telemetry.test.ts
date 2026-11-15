import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseRelayTransport } from '../../src/services/SupabaseRelayTransport';
import { reportOperationalError } from '../../src/core/observability/sentry';

vi.mock('../../src/core/observability/sentry', () => ({ reportOperationalError: vi.fn() }));
vi.mock('../../src/services/supabaseClient', () => ({}));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

function fixture(message: string, status: number) {
  const rpc = vi.fn(async () => ({ data: null, error: { message }, status }));
  const transport = new SupabaseRelayTransport(
    { role: 'player', participantId: 'peer', displayName: 'Player', worldId: '' },
    { url: 'https://example.supabase.co', publishableKey: 'public-key' },
    { rpc } as never
  );
  const heartbeat = transport as unknown as { startHeartbeat(): void };
  const errors = vi.fn();
  transport.onError(errors);
  return { transport, heartbeat, errors, rpc };
}

describe('Supabase heartbeat telemetry', () => {
  it.each(['room_not_found', 'master_offline'])('keeps %s visible without reporting it on every heartbeat', async code => {
    vi.useFakeTimers();
    const { transport, heartbeat, errors, rpc } = fixture(code, 400);
    try {
      heartbeat.startHeartbeat();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(rpc).toHaveBeenCalledTimes(240);
      expect(errors).toHaveBeenCalledTimes(240);
      expect(errors).toHaveBeenLastCalledWith(code);
      expect(reportOperationalError).not.toHaveBeenCalled();
    } finally { await transport.disconnect(); }
  });

  it.each([
    ['backend unavailable', 500, 'server_error'],
    ['failed to fetch', 0, 'network_error'],
    ['unauthorized', 401, 'auth_failed'],
    ['too many requests', 429, 'rate_limited']
  ])('still reports unexpected heartbeat failure: %s', async (message, status, code) => {
    vi.useFakeTimers();
    const { transport, heartbeat, errors } = fixture(message, status);
    try {
      heartbeat.startHeartbeat();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(reportOperationalError).toHaveBeenCalledWith(expect.objectContaining({ code }),
        expect.objectContaining({ area: 'network', operation: 'dh_heartbeat' }));
      expect(errors).toHaveBeenCalledWith(message);
    } finally { await transport.disconnect(); }
  });

  it('ignores successful heartbeat completion after disconnect', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const { transport, heartbeat, errors, rpc } = fixture('unused', 500);
    rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve as typeof finish; }));
    heartbeat.startHeartbeat();
    await vi.advanceTimersByTimeAsync(15_000);
    await transport.disconnect();
    finish({ data: null, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).not.toHaveBeenCalled();
    expect(reportOperationalError).not.toHaveBeenCalled();
  });
});
