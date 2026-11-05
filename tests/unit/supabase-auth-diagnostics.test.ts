import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionDiagnostics } from '../../src/services/p2p/ConnectionDiagnostics';
import { ensureSupabaseGuestSignedIn } from '../../src/services/supabaseClient';
const client = vi.hoisted(() => ({ auth: {
  getUser: vi.fn(), signOut: vi.fn(async () => ({ error: null })),
  signInAnonymously: vi.fn(async () => ({ data: { user: { is_anonymous: true } }, error: null })),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
}, realtime: { setAuth: async () => undefined } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }));
const config = { url: 'https://example.invalid', publishableKey: 'test' };
afterEach(() => { vi.clearAllMocks(); });
describe('guest auth diagnostics', () => {
  it('allows a missing session to use the normal anonymous guest sign-in', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } });
    const stages = new ConnectionDiagnostics(() => undefined);
    await ensureSupabaseGuestSignedIn(config, stages);
    expect(client.auth.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(stages.snapshot().map(stage => stage.status)).toEqual(['succeeded', 'succeeded']);
  });
  it('does not turn a failed network check green or create another anonymous identity', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'private error text' } });
    const stages = new ConnectionDiagnostics(() => undefined);
    await expect(ensureSupabaseGuestSignedIn(config, stages)).rejects.toMatchObject({ status: 0 });
    expect(client.auth.signOut).not.toHaveBeenCalled(); expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(stages.snapshot()[0]).toMatchObject({ id: 'auth-session', status: 'failed', errorCode: 'network_error' });
    expect(stages.snapshot()[0].httpStatus).toBeUndefined();
  });
  it('preserves observed HTTP failure status without copying error text', async () => {
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503, message: 'private error text' } });
    const stages = new ConnectionDiagnostics(() => undefined);
    await ensureSupabaseGuestSignedIn(config, stages).catch(() => undefined);
    expect(stages.snapshot()[0]).toMatchObject({ status: 'failed', errorCode: 'server_error', httpStatus: 503 });
    expect(JSON.stringify(stages.snapshot())).not.toContain('private');
  });
});
