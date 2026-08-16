import type { P2PWireEnvelope } from '../../services/p2p/P2PTransportAdapter';
import { readSupabaseSessionConfig } from './supabaseSession';

export type SessionConnectionMode = 'p2p' | 'server';

const PLAYER_EVENT_KINDS = new Set([
  'actor',
  'asset',
  'callPresence',
  'feed',
  'playerActivation',
  'playerCharacterCreate',
  'playerCharacterUpdateAck',
  'playerDecision',
  'playerRequest',
  'playerRestChoice',
  'playerRollIntent',
  'playerTokenMove',
  'presence',
  'snapshotRequest'
]);

export function serverSessionAvailable(env: Partial<ImportMetaEnv> = import.meta.env): boolean {
  return readSupabaseSessionConfig(env) !== null;
}

export function shouldUseServerSession(
  role: 'gm' | 'player',
  env?: Partial<ImportMetaEnv>,
  connectionMode?: SessionConnectionMode
): boolean {
  return connectionMode !== 'p2p' && serverSessionAvailable(env) && (role === 'gm' || role === 'player');
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
