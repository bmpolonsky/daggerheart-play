import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { turnConfigProvider } from '../../src/services/TurnCredentialService';

test('Pages requests TURN credentials from Sites without sending server credentials', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({
      iceServers: [{
        urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'turn-user',
        credential: 'turn-secret'
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const iceServers = await turnConfigProvider('pages-player-test', false)('ROOM1');
    assert.equal(String(requests[0]?.input), 'https://daggerheart-play.bmpolonsky.chatgpt.site/api/turn-credentials?room=ROOM1');
    assert.equal(requests[0]?.init?.credentials, 'omit');
    assert.deepEqual(iceServers, [{
      urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'turn-user',
      credential: 'turn-secret'
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pages continues without TURN when the Sites broker is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  vi.useFakeTimers();
  let wasAborted = false;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    assert.ok(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        wasAborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch;
  try {
    const iceServers = turnConfigProvider('pages-player-timeout-test', false)('ROOM2');
    await vi.advanceTimersByTimeAsync(2_500);
    assert.deepEqual(await iceServers, []);
    assert.equal(wasAborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  }
});

test('Sites direct fallback uses public TURN when the server room is absent', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ input, init });
    if (String(input).startsWith('/api/rooms/')) return new Response(null, { status: 404 });
    return new Response(JSON.stringify({
      iceServers: [{
        urls: 'turns:turn.cloudflare.com:443?transport=tcp',
        username: 'fallback-user',
        credential: 'fallback-secret'
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const iceServers = await turnConfigProvider('sites-player-fallback-test', true)('PAGESROOM');
    assert.equal(String(requests[0]?.input), '/api/rooms/PAGESROOM/turn-credentials');
    assert.equal(String(requests[1]?.input), 'https://daggerheart-play.bmpolonsky.chatgpt.site/api/turn-credentials?room=PAGESROOM');
    assert.equal(requests[1]?.init?.credentials, 'omit');
    assert.deepEqual(iceServers, [{
      urls: 'turns:turn.cloudflare.com:443?transport=tcp',
      username: 'fallback-user',
      credential: 'fallback-secret'
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('empty TURN responses are retried instead of being cached', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  try {
    const provider = turnConfigProvider('sites-player-empty-turn-test', true);
    assert.deepEqual(await provider('EMPTYROOM'), []);
    assert.deepEqual(await provider('EMPTYROOM'), []);
    assert.equal(requests, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
