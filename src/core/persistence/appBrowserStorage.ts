import { BrowserStorageStore, type BrowserStorageMigrationResult } from './browserStorageStore';

export const APP_BROWSER_STORAGE_KEY = 'daggerheart-play';

// Migration guide:
// 1. Add legacy keys here, scoped to the storage that originally owned them.
// 2. Read and validate legacy values inside the matching migrateLegacy* function.
// 3. Merge into `state` without overwriting an already-present value in the new shape.
// 4. Return `migrated: true`; BrowserStorageStore will persist the merged state under APP_BROWSER_STORAGE_KEY.
// 5. Delete only the legacy keys that were inspected by that migration.
const LEGACY_ACTIVE_SESSION_STORAGE_KEY = 'daggerheart-play:p2p-active-session';
const LEGACY_INVITE_DRAFT_STORAGE_KEY = 'daggerheart-play:p2p-invite-draft';
const LEGACY_PRIVATE_ROLL_STORAGE_KEY = 'daggerheart-play:private-rolls';
const LEGACY_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY = 'daggerheart-play:p2p-room-code-refresh-blocked-until';
const LEGACY_PLAYER_SEAT_STORAGE_PREFIX = 'daggerheart-play:p2p-seat:';

export interface StoredP2PSession {
  version: 1;
  role: 'gm' | 'player';
  roomId: string;
  participantName: string;
  updatedAt: string;
}

export interface StoredP2PInviteDraft {
  roomId: string;
}

export interface AppLocalStorageState {
  version: 1;
  p2p?: {
    activeSession?: StoredP2PSession | null;
    inviteDraft?: StoredP2PInviteDraft | null;
    callNames?: Record<string, string>;
  };
  preferences?: {
    privateRolls?: boolean;
  };
}

export interface AppSessionStorageState {
  version: 1;
  p2p?: {
    roomCodeRefreshBlockedUntil?: number;
    seats?: Record<string, string>;
  };
}

export const localAppStorageStore = new BrowserStorageStore<AppLocalStorageState>({
  key: APP_BROWSER_STORAGE_KEY,
  storage: () => browserStorage('localStorage'),
  initialState: emptyLocalStorageState,
  normalize: normalizeLocalStorageState,
  migrate: migrateLegacyLocalStorage
});

export const sessionAppStorageStore = new BrowserStorageStore<AppSessionStorageState>({
  key: APP_BROWSER_STORAGE_KEY,
  storage: () => browserStorage('sessionStorage'),
  initialState: emptySessionStorageState,
  normalize: normalizeSessionStorageState,
  migrate: migrateLegacySessionStorage
});

function emptyLocalStorageState(): AppLocalStorageState {
  return { version: 1 };
}

function emptySessionStorageState(): AppSessionStorageState {
  return { version: 1 };
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}

function migrateLegacyLocalStorage({ storage, state }: { storage: Storage; state: AppLocalStorageState }): BrowserStorageMigrationResult<AppLocalStorageState> {
  let next = state;
  let migrated = false;

  // Keep every migration idempotent: legacy data should fill missing fields, never replace
  // a value that was already written to the consolidated `daggerheart-play` object.
  const activeSession = readJson(storage, LEGACY_ACTIVE_SESSION_STORAGE_KEY);
  if (isStoredP2PSession(activeSession)) {
    next = {
      ...next,
      p2p: {
        ...next.p2p,
        activeSession: next.p2p?.activeSession ?? activeSession
      }
    };
    migrated = true;
  }

  const inviteDraft = readJson(storage, LEGACY_INVITE_DRAFT_STORAGE_KEY);
  if (isStoredP2PInviteDraft(inviteDraft)) {
    next = {
      ...next,
      p2p: {
        ...next.p2p,
        inviteDraft: next.p2p?.inviteDraft ?? inviteDraft
      }
    };
    migrated = true;
  }

  const privateRolls = readString(storage, LEGACY_PRIVATE_ROLL_STORAGE_KEY);
  if (privateRolls !== null) {
    next = {
      ...next,
      preferences: {
        ...next.preferences,
        privateRolls: next.preferences?.privateRolls ?? privateRolls === '1'
      }
    };
    migrated = true;
  }

  if (migrated) {
    removeKeys(storage, [
      LEGACY_ACTIVE_SESSION_STORAGE_KEY,
      LEGACY_INVITE_DRAFT_STORAGE_KEY,
      LEGACY_PRIVATE_ROLL_STORAGE_KEY
    ]);
  }

  return { state: next, migrated };
}

function migrateLegacySessionStorage({ storage, state }: { storage: Storage; state: AppSessionStorageState }): BrowserStorageMigrationResult<AppSessionStorageState> {
  let next = state;
  let migrated = false;

  // Session migrations follow the same pattern as local migrations, but only for
  // short-lived tab/session state. Do not move durable local preferences here.
  const blockedUntil = readNumber(storage, LEGACY_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY);
  if (blockedUntil > Date.now()) {
    next = {
      ...next,
      p2p: {
        ...next.p2p,
        roomCodeRefreshBlockedUntil: next.p2p?.roomCodeRefreshBlockedUntil ?? blockedUntil
      }
    };
    migrated = true;
  } else if (readString(storage, LEGACY_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY) !== null) {
    migrated = true;
  }

  const legacySeatKeys = storageKeys(storage).filter((key) => key.startsWith(LEGACY_PLAYER_SEAT_STORAGE_PREFIX));
  if (legacySeatKeys.length > 0) {
    const seats = { ...next.p2p?.seats };
    for (const key of legacySeatKeys) {
      const roomId = key.slice(LEGACY_PLAYER_SEAT_STORAGE_PREFIX.length);
      const seatId = readString(storage, key);
      if (roomId && seatId && !seats[roomId]) {
        seats[roomId] = seatId;
      }
    }
    next = {
      ...next,
      p2p: {
        ...next.p2p,
        seats
      }
    };
    migrated = true;
  }

  if (migrated) {
    removeKeys(storage, [LEGACY_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY, ...legacySeatKeys]);
  }

  return { state: next, migrated };
}

function normalizeLocalStorageState(value: unknown): AppLocalStorageState | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  const p2p = isRecord(value.p2p) ? value.p2p : undefined;
  const preferences = isRecord(value.preferences) ? value.preferences : undefined;
  return {
    version: 1,
    p2p: p2p ? {
      activeSession: isStoredP2PSession(p2p.activeSession) ? p2p.activeSession : p2p.activeSession === null ? null : undefined,
      inviteDraft: isStoredP2PInviteDraft(p2p.inviteDraft) ? p2p.inviteDraft : p2p.inviteDraft === null ? null : undefined,
      callNames: isStringRecord(p2p.callNames) ? p2p.callNames : undefined
    } : undefined,
    preferences: preferences ? {
      privateRolls: typeof preferences.privateRolls === 'boolean' ? preferences.privateRolls : undefined
    } : undefined
  };
}

function normalizeSessionStorageState(value: unknown): AppSessionStorageState | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  const p2p = isRecord(value.p2p) ? value.p2p : undefined;
  return {
    version: 1,
    p2p: p2p ? {
      roomCodeRefreshBlockedUntil: typeof p2p.roomCodeRefreshBlockedUntil === 'number' ? p2p.roomCodeRefreshBlockedUntil : undefined,
      seats: isStringRecord(p2p.seats) ? p2p.seats : undefined
    } : undefined
  };
}

function isStoredP2PSession(value: unknown): value is StoredP2PSession {
  return isRecord(value) &&
    value.version === 1 &&
    (value.role === 'gm' || value.role === 'player') &&
    typeof value.roomId === 'string' &&
    typeof value.participantName === 'string' &&
    typeof value.updatedAt === 'string';
}

function isStoredP2PInviteDraft(value: unknown): value is StoredP2PInviteDraft {
  return isRecord(value) &&
    typeof value.roomId === 'string';
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function readJson(storage: Storage, key: string): unknown {
  const raw = readString(storage, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readString(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function readNumber(storage: Storage, key: string): number {
  const value = Number(readString(storage, key));
  return Number.isFinite(value) ? value : 0;
}

function storageKeys(storage: Storage): string[] {
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

function removeKeys(storage: Storage, keys: string[]): void {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      // Optional browser storage cleanup should not block reads.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
