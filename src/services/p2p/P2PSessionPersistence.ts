import { nowIso } from '../../core/utils/date';
import { localAppStorageStore, sessionAppStorageStore } from '../../core/persistence/appBrowserStorage';
import { createShortRoomCode, normalizeSessionRoomId } from '../../domain/p2p/sessionLinks';
import type { P2PInviteDraftState, P2PSessionRole } from '../P2PSessionService';

export interface PersistedP2PSession {
  version: 1;
  role: P2PSessionRole;
  roomId: string;
  participantName: string;
  participantId?: string;
  actorIds?: string[];
  connectionMode?: 'p2p' | 'server';
  updatedAt: string;
}

export function initialInviteDraftState(): P2PInviteDraftState {
  const persisted = localAppStorageStore.getState().p2p?.inviteDraft;
  const persistedRoomId = persisted?.roomId ? normalizeSessionRoomId(persisted.roomId, '') : '';
  const roomId = /^[A-Z0-9]{4}$/.test(persistedRoomId) ? createShortRoomCode() : persistedRoomId || createShortRoomCode();
  if (persistedRoomId && roomId !== persistedRoomId) {
    persistInviteDraft({ roomId });
  }
  return {
    roomId,
    inviteUrl: '',
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

export function shouldResumeActiveSession(role: P2PSessionRole): boolean {
  const active = readActiveSession();
  const resumeRoomId = sessionAppStorageStore.getState().p2p?.resumeRoomId;
  return active?.role === role && Boolean(resumeRoomId && resumeRoomId === active.roomId);
}

export function forgetActiveSession(): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      activeSession: null
    }
  }));
  sessionAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      resumeRoomId: undefined
    }
  }));
}

export function persistActiveSession(input: {
  role: P2PSessionRole;
  roomId: string;
  participantName?: string;
  participantId?: string;
  actorIds?: string[];
  connectionMode?: 'p2p' | 'server';
}): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      activeSession: {
        version: 1,
        role: input.role,
        roomId: input.roomId,
        participantName: input.participantName?.trim() || (input.role === 'gm' ? 'Мастер' : 'Игрок'),
        ...(input.participantId?.trim() ? { participantId: input.participantId.trim() } : {}),
        ...(input.actorIds ? { actorIds: input.actorIds.filter(Boolean) } : {}),
        ...(input.connectionMode ? { connectionMode: input.connectionMode } : {}),
        updatedAt: nowIso()
      } satisfies PersistedP2PSession
    }
  }));
  sessionAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      resumeRoomId: input.roomId
    }
  }));
}

export function persistInviteDraft(draft: Pick<P2PInviteDraftState, 'roomId'>): void {
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      inviteDraft: {
        roomId: draft.roomId
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
