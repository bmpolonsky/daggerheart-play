import { nowIso } from '../../core/utils/date';
import { localAppStorageStore, sessionAppStorageStore } from '../../core/persistence/appBrowserStorage';
import { createShortRoomCode, normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import type { P2PInviteDraftState, P2PSessionRole } from '../P2PSessionService';

export interface PersistedP2PSession {
  version: 1;
  role: P2PSessionRole;
  roomId: string;
  password: string;
  participantName: string;
  updatedAt: string;
}

export function initialInviteDraftState(): P2PInviteDraftState {
  const persisted = localAppStorageStore.getState().p2p?.inviteDraft;
  return {
    roomId: persisted?.roomId ? normalizeSessionRoomId(persisted.roomId, createShortRoomCode()) : createShortRoomCode(),
    password: persisted?.password ?? '',
    inviteUrl: '',
    message: '',
    roomCodeRefreshBlockedUntil: readSessionNumber()
  };
}

export function readActiveSession(): PersistedP2PSession | null {
  const session = localAppStorageStore.getState().p2p?.activeSession;
  if (!session || session.version !== 1 || !session.role || !session.roomId) {
    return null;
  }
  return session;
}

export function forgetActiveSession(): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      activeSession: null
    }
  }));
}

export function persistActiveSession(input: { role: P2PSessionRole; roomId: string; password: string; participantName?: string }): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      activeSession: {
        version: 1,
        role: input.role,
        roomId: input.roomId,
        password: input.password,
        participantName: input.participantName?.trim() || (input.role === 'gm' ? 'Мастер' : 'Игрок'),
        updatedAt: nowIso()
      } satisfies PersistedP2PSession
    }
  }));
}

export function persistInviteDraft(draft: Pick<P2PInviteDraftState, 'roomId' | 'password'>): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      inviteDraft: {
        roomId: draft.roomId,
        password: draft.password
      }
    }
  }));
}

export function persistRoomCodeRefreshBlockedUntil(value: number): void {
  sessionAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      roomCodeRefreshBlockedUntil: value > Date.now() ? value : undefined
    }
  }));
}

function readSessionNumber(): number {
  const value = sessionAppStorageStore.getState().p2p?.roomCodeRefreshBlockedUntil ?? 0;
  return Number.isFinite(value) && value > Date.now() ? value : 0;
}
