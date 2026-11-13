import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ getSession: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  getSession: mock.getSession,
  onAuthStateChange: (fn: typeof mock.listener) => { mock.listener = fn; return { data: { subscription: { unsubscribe() {} } } }; }
} }) }));
vi.mock('../../src/core/observability/sentry', () => ({ reportOperationalError: vi.fn() }));
const config = { url: 'https://example.invalid', publishableKey: 'test' };
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); mock.getSession.mockReset(); mock.listener = null; });
afterEach(() => { vi.useRealTimers(); });
describe('master session initialization', () => {
  it('leaves loading when the SDK never responds', async () => {
    mock.getSession.mockReturnValue(new Promise(() => {}));
    const { initializeSupabaseMasterAuth, supabaseMasterAuth$ } = await import('../../src/services/supabaseClient');
    const request = initializeSupabaseMasterAuth(config);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await request).toEqual({ status: 'error', email: '' });
    expect(supabaseMasterAuth$.get().status).toBe('error');
  });
  it('handles a rejected session read and can retry successfully', async () => {
    mock.getSession.mockRejectedValueOnce(new Error('network'));
    const { initializeSupabaseMasterAuth } = await import('../../src/services/supabaseClient');
    expect((await initializeSupabaseMasterAuth(config)).status).toBe('error');
    mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect((await initializeSupabaseMasterAuth(config)).status).toBe('signedOut');
  });
  it('does not overwrite a newer sign-in event with a timed out read', async () => {
    mock.getSession.mockReturnValue(new Promise(() => {}));
    const { initializeSupabaseMasterAuth } = await import('../../src/services/supabaseClient');
    const request = initializeSupabaseMasterAuth(config);
    mock.listener?.('SIGNED_IN', { user: { email: 'test@example.invalid' } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await request).status).toBe('signedIn');
  });
  it('ignores a stale result after changing server config', async () => {
    let finish!: (value: unknown) => void;
    mock.getSession.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue({ data: { session: null }, error: null });
    const { initializeSupabaseMasterAuth } = await import('../../src/services/supabaseClient');
    const old = initializeSupabaseMasterAuth(config);
    await initializeSupabaseMasterAuth({ ...config, url: 'https://other.invalid' });
    finish({ data: { session: { user: { email: 'old@example.invalid' } } }, error: null });
    expect((await old).status).toBe('signedOut');
  });
});
