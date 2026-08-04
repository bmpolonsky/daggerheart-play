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
    const iceServers = await turnConfigProvider('pages-player-test', false)('MEDIA-ROOM1');
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
    const iceServers = turnConfigProvider('pages-player-timeout-test', false)('MEDIA-ROOM2');
    await vi.advanceTimersByTimeAsync(2_500);
    assert.deepEqual(await iceServers, []);
    assert.equal(wasAborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  }
});
