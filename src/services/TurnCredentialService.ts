import type { SupabaseSessionConfig } from '../domain/p2p/supabaseSession';
import { readSupabaseSessionConfig } from '../domain/p2p/supabaseSession';
import { readSupabaseAccessToken } from './supabaseClient';

const CACHE_MS = 10 * 60 * 60_000;
const TURN_FETCH_TIMEOUT_MS = 5_000;
const cachedCredentials = new Map<string, { expiresAt: number; promise: Promise<RTCIceServer[]> }>();

export function turnConfigProvider(
  participantId: string,
  role: 'gm' | 'player',
  config = readSupabaseSessionConfig(),
  fetcher: typeof fetch = fetch,
  tokenReader: typeof readSupabaseAccessToken = readSupabaseAccessToken
): (roomId: string) => Promise<RTCIceServer[]> {
  return async (roomId) => {
    if (!config) return [];
    const cacheKey = `${config.url}:${roomId}:${participantId}`;
    const cached = cachedCredentials.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = fetchTurnConfig(roomId, participantId, role, config, fetcher, tokenReader)
      .catch(() => [])
      .then((iceServers) => {
        if (iceServers.length === 0) cachedCredentials.delete(cacheKey);
        return iceServers;
      })
      .catch(() => {
        cachedCredentials.delete(cacheKey);
        return [];
      });
    cachedCredentials.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, promise });
    return promise;
  };
}

async function fetchTurnConfig(
  roomId: string,
  participantId: string,
  role: 'gm' | 'player',
  config: SupabaseSessionConfig,
  fetcher: typeof fetch,
  tokenReader: typeof readSupabaseAccessToken
): Promise<RTCIceServer[]> {
  const accessToken = await tokenReader(config, role === 'gm' ? 'master' : 'player');
  if (!accessToken) return [];
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(`${config.url}/functions/v1/turn-credentials`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: config.publishableKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ roomId, peerId: participantId }),
      signal: controller.signal
    });
    if (!response.ok) return [];
    const body = await response.json() as { iceServers?: unknown };
    return validIceServers(body.iceServers);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function validIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is RTCIceServer => {
    if (!entry || typeof entry !== 'object') return false;
    const urls = (entry as { urls?: unknown }).urls;
    return typeof urls === 'string' || Array.isArray(urls) && urls.every((url) => typeof url === 'string');
  });
}
