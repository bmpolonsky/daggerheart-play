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

const PLAYER_SEAT_STORAGE_PREFIX = 'daggerheart-play:p2p-seat:';

export function createShortRoomCode(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
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

export function inferBasePathFromWorkspacePath(pathname: string): string {
  return pathname.replace(/\/(?:gm|player|join)(?:\/[^/]+)?\/?$/, '').replace(/\/$/, '');
}

export function readStoredPlayerSeatId(roomId: string): string | null {
  if (typeof window === 'undefined' || !roomId) return null;
  try {
    return window.sessionStorage.getItem(playerSeatStorageKey(roomId));
  } catch {
    return null;
  }
}

export function writeStoredPlayerSeatId(roomId: string, seatId: string): void {
  if (typeof window === 'undefined' || !roomId || !seatId) return;
  try {
    window.sessionStorage.setItem(playerSeatStorageKey(roomId), seatId);
  } catch {
    // Seat selection is local convenience state; the lobby can ask again.
  }
}

function joinRoutePath(basePath = '', roomId: string): string {
  const normalized = basePath.replace(/\/+$/, '');
  const roomSegment = encodeURIComponent(roomId);
  return normalized ? `${normalized}/join/${roomSegment}` : `/join/${roomSegment}`;
}

function stripBasePath(pathname: string, basePath = ''): string {
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (!normalizedBase || !pathname.startsWith(normalizedBase)) return pathname;
  const stripped = pathname.slice(normalizedBase.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function playerSeatStorageKey(roomId: string): string {
  return `${PLAYER_SEAT_STORAGE_PREFIX}${roomId}`;
}
