import { createClient } from 'npm:@supabase/supabase-js@2.108.2';

const TURN_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://bmpolonsky.github.io',
  'https://daggerheart-play.bmpolonsky.chatgpt.site',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  const corsHeaders = cors(origin);
  if (!corsHeaders) return json({ error: 'origin_not_allowed' }, 403, { vary: 'Origin' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders);

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'not_authenticated' }, 401, corsHeaders);
  const input = await request.json().catch(() => null) as {
    roomId?: unknown;
    peerId?: unknown;
    sessionMode?: unknown;
    roomRole?: unknown;
  } | null;
  const roomId = typeof input?.roomId === 'string' ? input.roomId.trim().toUpperCase() : '';
  const peerId = typeof input?.peerId === 'string' ? input.peerId.trim() : '';
  const sessionMode = input?.sessionMode === 'p2p' ? 'p2p' : 'server';
  const roomRole = input?.roomRole === 'gm' || input?.roomRole === 'player' ? input.roomRole : null;
  if (!/^[A-Z0-9_-]{4,24}$/.test(roomId) || !peerId || peerId.length > 160 || sessionMode === 'p2p' && !roomRole) {
    return json({ error: 'invalid_request' }, 400, corsHeaders);
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );
  const { data: allowed, error: membershipError } = sessionMode === 'p2p'
    ? await client.rpc('dh_claim_p2p_turn_credentials', {
        p_room_id: roomId,
        p_peer_id: peerId,
        p_role: roomRole
      })
    : await client.rpc('dh_claim_turn_credentials', {
        p_room_id: roomId,
        p_peer_id: peerId
      });
  if (membershipError || allowed !== true) return json({ error: 'room_access_denied' }, 403, corsHeaders);

  const keyId = Deno.env.get('TURN_KEY_ID')?.trim();
  const apiToken = Deno.env.get('TURN_KEY_API_TOKEN')?.trim();
  if (!keyId || !apiToken) return json({ error: 'turn_not_configured' }, 503, corsHeaders);
  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        ttl: TURN_CREDENTIAL_TTL_SECONDS,
        customIdentifier: `${roomId}:${peerId}`
      })
    }
  );
  if (!response.ok) return json({ error: 'turn_unavailable' }, 502, corsHeaders);
  const body = await response.json() as { iceServers?: unknown };
  const iceServers = validIceServers(body.iceServers);
  return iceServers.length > 0
    ? json({ iceServers }, 200, corsHeaders)
    : json({ error: 'turn_invalid_response' }, 502, corsHeaders);
});

function cors(origin: string): HeadersInit | null {
  if (!origin) return { vary: 'Origin' };
  const configured = (Deno.env.get('DAGGERHEART_ALLOWED_ORIGINS') ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  if (![...DEFAULT_ALLOWED_ORIGINS, ...configured].includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin'
  };
}

function json(body: unknown, status: number, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function validIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is RTCIceServer => {
    if (!entry || typeof entry !== 'object') return false;
    const urls = (entry as { urls?: unknown }).urls;
    return typeof urls === 'string' || Array.isArray(urls) && urls.every((url) => typeof url === 'string');
  });
}
