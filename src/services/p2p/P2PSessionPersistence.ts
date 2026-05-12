import { nowIso } from '../../core/utils/date';
import { createShortRoomCode, normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import type { P2PInviteDraftState, P2PSessionRole } from '../P2PSessionService';

const ACTIVE_SESSION_STORAGE_KEY = 'daggerheart-play:p2p-active-session';
const INVITE_DRAFT_STORAGE_KEY = 'daggerheart-play:p2p-invite-draft';

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
    message: ''
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
