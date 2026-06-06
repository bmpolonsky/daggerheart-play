import { nowIso } from '../../core/utils/date';
import { createShortRoomCode, normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import type { P2PInviteDraftState, P2PSessionRole } from '../P2PSessionService';

const ACTIVE_SESSION_STORAGE_KEY = 'daggerheart-play:p2p-active-session';
const INVITE_DRAFT_STORAGE_KEY = 'daggerheart-play:p2p-invite-draft';
const ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY = 'daggerheart-play:p2p-room-code-refresh-blocked-until';

export interface PersistedP2PSession {
  version: 1;
  role: P2PSessionRole;
  roomId: string;
  password: string;
  participantName: string;
  updatedAt: string;
}

export function initialInviteDraftState(): P2PInviteDraftState {
  const persisted = readJson<Partial<P2PInviteDraftState>>(INVITE_DRAFT_STORAGE_KEY);
  return {
    roomId: persisted?.roomId ? normalizeSessionRoomId(persisted.roomId, createShortRoomCode()) : createShortRoomCode(),
    password: persisted?.password ?? '',
    inviteUrl: '',
    message: '',
    roomCodeRefreshBlockedUntil: readSessionNumber(ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY)
  };
}

export function readActiveSession(): PersistedP2PSession | null {
  const session = readJson<PersistedP2PSession>(ACTIVE_SESSION_STORAGE_KEY);
  if (!session || session.version !== 1 || !session.role || !session.roomId) {
    return null;
  }
  return session;
}

export function forgetActiveSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Reconnect persistence is optional.
  }
}

export function persistActiveSession(input: { role: P2PSessionRole; roomId: string; password: string; participantName?: string }): void {
  writeJson(ACTIVE_SESSION_STORAGE_KEY, {
    version: 1,
    role: input.role,
    roomId: input.roomId,
    password: input.password,
    participantName: input.participantName?.trim() || (input.role === 'gm' ? 'Мастер' : 'Игрок'),
    updatedAt: nowIso()
  } satisfies PersistedP2PSession);
}

export function persistInviteDraft(draft: Pick<P2PInviteDraftState, 'roomId' | 'password'>): void {
  writeJson(INVITE_DRAFT_STORAGE_KEY, {
    roomId: draft.roomId,
    password: draft.password
  });
}

export function persistRoomCodeRefreshBlockedUntil(value: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (value > Date.now()) {
      window.sessionStorage.setItem(ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY, String(value));
    } else {
      window.sessionStorage.removeItem(ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY);
    }
  } catch {
    // Cooldown persistence is optional.
  }
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Reconnect persistence is optional.
  }
}

function readSessionNumber(key: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) && value > Date.now() ? value : 0;
  } catch {
    return 0;
  }
}
