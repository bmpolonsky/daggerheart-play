import { readServerParticipantToken } from './ServerRelayTransport';

const PAGES_TURN_ENDPOINT = 'https://daggerheart-play.bmpolonsky.chatgpt.site/api/turn-credentials';
const CACHE_MS = 10 * 60 * 60_000;
const cachedCredentials = new Map<string, { expiresAt: number; promise: Promise<RTCIceServer[]> }>();

export function turnConfigProvider(participantId: string, serverMode: boolean): (roomId: string) => Promise<RTCIceServer[]> {
  return async (roomId) => {
    const serverRoomId = roomId.replace(/^MEDIA-/i, '');
    const cacheKey = `${serverMode ? 'server' : 'pages'}:${serverRoomId}:${participantId}`;
    const cached = cachedCredentials.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = fetchTurnConfig(serverRoomId, participantId, serverMode).catch((error) => {
      cachedCredentials.delete(cacheKey);
      throw error;
    });
    cachedCredentials.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, promise });
    return promise;
  };
}

async function fetchTurnConfig(roomId: string, participantId: string, serverMode: boolean): Promise<RTCIceServer[]> {
  const headers = new Headers({ accept: 'application/json' });
  if (serverMode) {
    const participantToken = readServerParticipantToken(roomId, participantId);
    if (participantToken) {
      headers.set('authorization', `Bearer ${participantToken}`);
      headers.set('x-daggerheart-peer-id', participantId);
    }
  }
  const endpoint = serverMode
    ? `/api/rooms/${encodeURIComponent(roomId)}/turn-credentials`
    : `${PAGES_TURN_ENDPOINT}?room=${encodeURIComponent(roomId)}`;
  const response = await fetch(endpoint, {
    credentials: serverMode ? 'same-origin' : 'omit',
    headers
  });
  if (!response.ok) return [];
  const body = await response.json() as { iceServers?: unknown };
  return validIceServers(body.iceServers);
}

function validIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is RTCIceServer => {
    if (!entry || typeof entry !== 'object') return false;
    const urls = (entry as { urls?: unknown }).urls;
    return typeof urls === 'string' || Array.isArray(urls) && urls.every((url) => typeof url === 'string');
  });
}
