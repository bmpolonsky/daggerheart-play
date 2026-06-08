import { localAppStorageStore, sessionAppStorageStore } from '../../core/persistence/appBrowserStorage';

export interface PlayerInviteUrlInput {
  origin: string;
  basePath?: string;
  roomId: string;
  password?: string;
}

export interface PlayerSessionParams {
  roomId: string;
  password: string;
}

export interface StoredCallSessionSummary {
  role: 'gm' | 'player';
  roomId: string;
  password: string;
  participantName: string;
}

export function createShortRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function createFallbackRoomId(): string {
  return `daggerheart-${Date.now().toString(36)}`;
}

export function normalizeSessionRoomId(roomId: string, fallback = createFallbackRoomId()): string {
  return (roomId.trim() || fallback).toUpperCase();
}

export function buildPlayerInviteUrl(input: PlayerInviteUrlInput): string {
  const invite = new URL(joinRoutePath(input.basePath, normalizeSessionRoomId(input.roomId)), input.origin);
  return invite.toString();
}

export function buildCallInviteUrl(input: PlayerInviteUrlInput): string {
  const invite = new URL(callRoutePath(input.basePath, normalizeSessionRoomId(input.roomId)), input.origin);
  return invite.toString();
}

export function parsePlayerSessionLocation(pathname: string, basePath = ''): PlayerSessionParams | null {
  const normalized = stripBasePath(pathname, basePath).replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/(?:join|player)\/([^/]+)$/);
  const roomId = match?.[1] ? normalizeSessionRoomId(decodeURIComponent(match[1]), '') : '';
  if (!roomId) {
    return null;
  }
  return {
    roomId,
    password: ''
  };
}

export function parseCallSessionLocation(pathname: string, basePath = ''): PlayerSessionParams | null {
  const normalized = stripBasePath(pathname, basePath).replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/calls\/([^/]+)$/);
  const roomId = match?.[1]
    ? normalizeSessionRoomId(decodeURIComponent(match[1]), '')
    : normalized === '/calls'
      ? readStoredCallRoomId()
      : '';
  if (!roomId) {
    return null;
  }
  return {
    roomId,
    password: ''
  };
}

export function inferBasePathFromWorkspacePath(pathname: string): string {
  return pathname.replace(/\/(?:gm|player|join|calls)(?:\/[^/]+)?\/?$/, '').replace(/\/$/, '');
}

export function readStoredPlayerSeatId(roomId: string): string | null {
  if (!roomId) return null;
  return sessionAppStorageStore.getState().p2p?.seats?.[roomId] ?? null;
}

export function writeStoredPlayerSeatId(roomId: string, seatId: string): void {
  if (!roomId || !seatId) return;
  sessionAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      seats: {
        ...state.p2p?.seats,
        [roomId]: seatId
      }
    }
  }));
}

export function readStoredCallName(roomId: string): string {
  if (!roomId) return '';
  const p2p = localAppStorageStore.getState().p2p;
  return p2p?.callNames?.[roomId] ?? (p2p?.activeSession?.roomId === roomId ? p2p.activeSession.participantName : '');
}

export function writeStoredCallName(roomId: string, name: string): void {
  const trimmedName = name.trim();
  if (!roomId || !trimmedName) return;
  localAppStorageStore.update((state) => ({
    p2p: {
      ...state.p2p,
      callNames: {
        ...state.p2p?.callNames,
        [roomId]: trimmedName
      }
    }
  }));
}

export function readStoredCallRoomId(): string {
  const p2p = localAppStorageStore.getState().p2p;
  return normalizeSessionRoomId(p2p?.activeSession?.roomId ?? p2p?.inviteDraft?.roomId ?? '', '');
}

export function readStoredCallSession(roomId: string): StoredCallSessionSummary | null {
  const session = localAppStorageStore.getState().p2p?.activeSession;
  if (!session || session.version !== 1 || session.roomId !== roomId) return null;
  return {
    role: session.role,
    roomId: session.roomId,
    password: session.password,
    participantName: session.participantName
  };
}

function joinRoutePath(basePath = '', roomId: string): string {
  const normalized = basePath.replace(/\/+$/, '');
  const roomSegment = encodeURIComponent(roomId);
  return normalized ? `${normalized}/join/${roomSegment}` : `/join/${roomSegment}`;
}

function callRoutePath(basePath = '', roomId: string): string {
  const normalized = basePath.replace(/\/+$/, '');
  const roomSegment = encodeURIComponent(roomId);
  return normalized ? `${normalized}/calls/${roomSegment}` : `/calls/${roomSegment}`;
}

function stripBasePath(pathname: string, basePath = ''): string {
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (!normalizedBase || !pathname.startsWith(normalizedBase)) return pathname;
  const stripped = pathname.slice(normalizedBase.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}
