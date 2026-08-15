import type { StoredP2PInviteDraft, StoredP2PSession } from '../../appBrowserStorage';

export const V0_ACTIVE_SESSION_STORAGE_KEY = 'daggerheart-play:p2p-active-session';
export const V0_INVITE_DRAFT_STORAGE_KEY = 'daggerheart-play:p2p-invite-draft';
export const V0_PRIVATE_ROLL_STORAGE_KEY = 'daggerheart-play:private-rolls';
export const V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY = 'daggerheart-play:p2p-room-code-refresh-blocked-until';
export const V0_PLAYER_SEAT_STORAGE_PREFIX = 'daggerheart-play:p2p-seat:';

const STORED_P2P_SESSION_VERSION = 1;

export function toStoredP2PSession(value: unknown): StoredP2PSession | null {
  if (!isRecord(value) ||
    value.version !== STORED_P2P_SESSION_VERSION ||
    (value.role !== 'gm' && value.role !== 'player') ||
    typeof value.roomId !== 'string' ||
    typeof value.participantName !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    version: STORED_P2P_SESSION_VERSION,
    role: value.role,
    roomId: value.roomId,
    participantName: value.participantName,
    ...(typeof value.participantId === 'string' ? { participantId: value.participantId } : {}),
    ...(Array.isArray(value.actorIds) && value.actorIds.every((item) => typeof item === 'string')
      ? { actorIds: value.actorIds }
      : {}),
    ...(value.connectionMode === 'p2p' || value.connectionMode === 'server'
      ? { connectionMode: value.connectionMode }
      : {}),
    updatedAt: value.updatedAt
  };
}

export function toStoredP2PInviteDraft(value: unknown): StoredP2PInviteDraft | null {
  if (!isRecord(value) || typeof value.roomId !== 'string') {
    return null;
  }
  return { roomId: value.roomId };
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function readJson(storage: Storage, key: string): unknown {
  const raw = readString(storage, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readString(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function readNumber(storage: Storage, key: string): number {
  const value = Number(readString(storage, key));
  return Number.isFinite(value) ? value : 0;
}

export function storageKeys(storage: Storage): string[] {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') {
    return [];
  }
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function removeKeys(storage: Storage, keys: string[]): void {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Optional browser storage cleanup should not block reads.
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
