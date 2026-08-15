import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { turnConfigProvider } from '../../src/services/TurnCredentialService';

const config = {
  url: 'https://project.supabase.co',
  publishableKey: 'sb_publishable_test'
};

test('requests TURN from the authenticated Supabase Edge Function', async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({
      iceServers: [{
        urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'turn-user',
        credential: 'turn-secret'
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const iceServers = await turnConfigProvider(
    'player-test', 'player', config, fetcher, async (_config, role) => role === 'player' ? 'guest-jwt' : null
  )('ROOM1');

  assert.equal(String(requests[0]?.input), 'https://project.supabase.co/functions/v1/turn-credentials');
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.equal((requests[0]?.init?.headers as Record<string, string>).authorization, 'Bearer guest-jwt');
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), { roomId: 'ROOM1', peerId: 'player-test' });
  assert.deepEqual(iceServers, [{
    urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
    username: 'turn-user',
    credential: 'turn-secret'
  }]);
});

test('does not call the Edge Function before Supabase authentication', async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests += 1;
    return new Response(null, { status: 500 });
  }) as typeof fetch;
  const iceServers = await turnConfigProvider(
    'no-auth-test', 'gm', config, fetcher, async () => null
  )('ROOM2');
  assert.deepEqual(iceServers, []);
  assert.equal(requests, 0);
});

test('continues without TURN when the Edge Function times out', async () => {
  vi.useFakeTimers();
  let wasAborted = false;
  const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      wasAborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  })) as typeof fetch;
  try {
    const result = turnConfigProvider(
      'timeout-test', 'player', config, fetcher, async () => 'guest-jwt'
    )('ROOM3');
    await vi.advanceTimersByTimeAsync(5_000);
    assert.deepEqual(await result, []);
    assert.equal(wasAborted, true);
  } finally {
    vi.useRealTimers();
  }
});

test('empty TURN responses are retried instead of being cached', async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  const provider = turnConfigProvider(
    'retry-test', 'gm', config, fetcher, async () => 'master-jwt'
  );
  assert.deepEqual(await provider('EMPTYROOM'), []);
  assert.deepEqual(await provider('EMPTYROOM'), []);
  assert.equal(requests, 2);
});
