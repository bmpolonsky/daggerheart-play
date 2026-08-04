import type { P2PWireEnvelope } from '../../services/p2p/P2PTransportAdapter';

export type SessionTransportMode = 'p2p' | 'server';
export type ActiveSessionTransportMode = 'p2p' | 'hybrid';

let masterAuthenticated = false;
let activeTransportMode: ActiveSessionTransportMode = 'p2p';

const PLAYER_EVENT_KINDS = new Set([
  'actor',
  'asset',
  'callPresence',
  'feed',
  'playerActivation',
  'playerCharacterCreate',
  'playerDecision',
  'playerRequest',
  'playerRestChoice',
  'playerRollIntent',
  'playerTokenMove',
  'presence',
  'snapshotRequest'
]);

export function sessionTransportMode(env: Partial<ImportMetaEnv> = import.meta.env): SessionTransportMode {
  return env.VITE_SESSION_MODE === 'server' ? 'server' : 'p2p';
}

export function serverSessionEnabled(env?: Partial<ImportMetaEnv>): boolean {
  return env ? serverSessionAvailable(env) : activeTransportMode === 'hybrid';
}

export function serverSessionAvailable(env?: Partial<ImportMetaEnv>): boolean {
  return sessionTransportMode(env) === 'server';
}

export function setMasterServerAuthenticated(authenticated: boolean): void {
  masterAuthenticated = authenticated;
}

export function shouldUseServerSession(role: 'gm' | 'player', env?: Partial<ImportMetaEnv>): boolean {
  return serverSessionAvailable(env) && (role === 'player' || masterAuthenticated);
}

export function setActiveSessionTransportMode(mode: ActiveSessionTransportMode): void {
  activeTransportMode = mode;
}

export function normalizeServerRoomId(value: string): string | null {
  const roomId = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{4,24}$/.test(roomId) ? roomId : null;
}

export function isPlayerEnvelopeAllowed(envelope: P2PWireEnvelope): boolean {
  if (envelope.sender.role !== 'player') return false;
  if (envelope.channel === 'control') {
    const type = controlType(envelope.payload);
    return type === 'hello' || type === 'player-ping' || type === 'heartbeat' || type === 'goodbye';
  }
  const kind = eventKind(envelope.payload);
  return Boolean(kind && PLAYER_EVENT_KINDS.has(kind));
}

export function isMasterLeaseActive(activeUntil: number, now = Date.now()): boolean {
  return Number.isFinite(activeUntil) && activeUntil > now;
}

function controlType(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
    ? (value as { type: string }).type
    : null;
}

function eventKind(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string'
    ? (value as { kind: string }).kind
    : null;
}
