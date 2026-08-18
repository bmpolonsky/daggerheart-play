import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Store } from '../core/store/Store';
import type { SupabaseSessionConfig } from '../domain/p2p/supabaseSession';
import { reportOperationalError } from '../core/observability/sentry';

export interface SupabaseMasterAuthState {
  status: 'loading' | 'signedOut' | 'signedIn' | 'error';
  email: string;
}

let authClient: SupabaseClient | null = null;
let guestClient: SupabaseClient | null = null;
let dataClient: SupabaseClient | null = null;
let sharedConfigKey = '';
let dataRole: 'master' | 'player' = 'master';
let masterAuthUnsubscribe: (() => void) | null = null;
const masterAuthStore = new Store<SupabaseMasterAuthState>({ status: 'loading', email: '' });
export const supabaseMasterAuth$ = masterAuthStore.toStream();

export function getSupabaseAuthClient(config: SupabaseSessionConfig): SupabaseClient {
  ensureClients(config);
  return authClient!;
}

export function getSupabaseClient(config: SupabaseSessionConfig): SupabaseClient {
  ensureClients(config);
  return dataClient!;
}

export async function setSupabaseDataRole(role: 'master' | 'player'): Promise<void> {
  dataRole = role;
  await dataClient?.realtime.setAuth();
}

export async function readSupabaseAccessToken(
  config: SupabaseSessionConfig,
  role: 'master' | 'player'
): Promise<string | null> {
  ensureClients(config);
  const source = role === 'player' ? guestClient! : authClient!;
  const { data } = await source.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function ensureSupabaseGuestSignedIn(config: SupabaseSessionConfig): Promise<void> {
  ensureClients(config);
  const current = await guestClient!.auth.getUser();
  if (current.data.user?.is_anonymous && !current.error) return;
  await guestClient!.auth.signOut({ scope: 'local' });
  const { data, error } = await guestClient!.auth.signInAnonymously();
  if (error || !data.user?.is_anonymous) {
    const failure = error ?? new Error('anonymous_sign_in_failed');
    reportOperationalError(failure, { area: 'auth', operation: 'sign-in-anonymous', tags: { provider: 'supabase' } });
    throw failure;
  }
}

export async function supabaseMasterSignedIn(config: SupabaseSessionConfig): Promise<boolean> {
  const state = await initializeSupabaseMasterAuth(config);
  return state.status === 'signedIn';
}

export async function initializeSupabaseMasterAuth(config: SupabaseSessionConfig): Promise<SupabaseMasterAuthState> {
  const { data, error } = await getSupabaseAuthClient(config).auth.getSession();
  if (error) {
    reportOperationalError(error, { area: 'auth', operation: 'read-master-session', tags: { provider: 'supabase' } });
    const state: SupabaseMasterAuthState = { status: 'error', email: '' };
    masterAuthStore.set(state);
    return state;
  }
  const state = masterAuthState(data.session);
  masterAuthStore.set(state);
  return state;
}

export async function signInSupabaseMaster(config: SupabaseSessionConfig, redirectTo: string): Promise<void> {
  const { error } = await getSupabaseAuthClient(config).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });
  if (error) {
    reportOperationalError(error, { area: 'auth', operation: 'sign-in-google', tags: { provider: 'supabase' } });
    throw error;
  }
}

export async function signInSupabaseMasterByEmail(
  config: SupabaseSessionConfig,
  email: string,
  redirectTo: string
): Promise<void> {
  const { error } = await getSupabaseAuthClient(config).auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo }
  });
  if (error) {
    reportOperationalError(error, { area: 'auth', operation: 'sign-in-email', tags: { provider: 'supabase' } });
    throw error;
  }
}

export async function signOutSupabaseMaster(config: SupabaseSessionConfig): Promise<void> {
  const { error } = await getSupabaseAuthClient(config).auth.signOut();
  if (error) {
    reportOperationalError(error, { area: 'auth', operation: 'sign-out-master', tags: { provider: 'supabase' } });
    throw error;
  }
}

function ensureClients(config: SupabaseSessionConfig): void {
  const configKey = `${config.url}\n${config.publishableKey}`;
  if (!authClient || !guestClient || !dataClient || sharedConfigKey !== configKey) {
    masterAuthUnsubscribe?.();
    masterAuthUnsubscribe = null;
    masterAuthStore.set({ status: 'loading', email: '' });
    dataRole = 'master';
    authClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'daggerheart-supabase-master'
      }
    });
    guestClient = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'daggerheart-supabase-player'
      }
    });
    dataClient = createClient(config.url, config.publishableKey, {
      accessToken: async () => {
        const source = dataRole === 'player' ? guestClient! : authClient!;
        const { data } = await source.auth.getSession();
        return data.session?.access_token ?? null;
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    const { data: authListener } = authClient.auth.onAuthStateChange((_event, session) => {
      masterAuthStore.set(masterAuthState(session));
    });
    masterAuthUnsubscribe = () => authListener.subscription.unsubscribe();
    sharedConfigKey = configKey;
  }
}

function masterAuthState(session: { user?: { email?: string; is_anonymous?: boolean } } | null): SupabaseMasterAuthState {
  return session?.user && !session.user.is_anonymous
    ? { status: 'signedIn', email: session.user.email ?? '' }
    : { status: 'signedOut', email: '' };
}
