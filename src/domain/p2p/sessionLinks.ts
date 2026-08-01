import { localAppStorageStore, sessionAppStorageStore } from '../../core/persistence/appBrowserStorage';
import type { P2PNetworkSettings } from './networkSettings';
import { sessionTransportMode, type SessionTransportMode } from './serverSession';

export interface PlayerInviteUrlInput {
  origin: string;
  basePath?: string;
  roomId: string;
  networkSettings?: P2PNetworkSettings;
  transportMode?: SessionTransportMode;
}

export interface PlayerSessionParams {
  roomId: string;
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
  const roomId = buildPlayerInviteRoomCode(input.roomId, input.networkSettings);
  const serverRoute = (input.transportMode ?? sessionTransportMode()) === 'server';
  const invite = new URL(serverRoute
    ? input.basePath || '/'
    : joinRoutePath(input.basePath, roomId), input.origin);
  if (serverRoute) invite.searchParams.set('join', roomId);
  return invite.toString();
}

export function buildPlayerInviteRoomCode(roomId: string, networkSettings?: P2PNetworkSettings): string {
  void networkSettings;
  return normalizeLogicalRoomId(roomId);
}

export function rebasePlayerInviteRoomCode(roomId: string, networkSettings: P2PNetworkSettings): string {
  return buildPlayerInviteRoomCode(normalizeLogicalRoomId(roomId), networkSettings);
}

export function buildCallInviteUrl(input: PlayerInviteUrlInput): string {
  const roomId = normalizeLogicalRoomId(input.roomId);
  const serverRoute = (input.transportMode ?? sessionTransportMode()) === 'server';
  const invite = new URL(serverRoute
    ? input.basePath || '/'
    : callRoutePath(input.basePath, roomId), input.origin);
  if (serverRoute) invite.searchParams.set('call', roomId);
  return invite.toString();
}

export function parsePlayerSessionLocation(pathname: string, basePath = '', search = ''): PlayerSessionParams | null {
  const queryRoomId = new URLSearchParams(search).get('join');
  if (queryRoomId) return parsePlayerInviteRoomCode(queryRoomId);
  const normalized = stripBasePath(pathname, basePath).replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/join\/([^/]+)$/);
  return match?.[1] ? parsePlayerInviteRoomCode(decodeURIComponent(match[1])) : null;
}

export function parsePlayerInviteRoomCode(value: string): PlayerSessionParams | null {
  const roomId = normalizeLogicalRoomId(value, '');
  if (!roomId) return null;
  return { roomId };
}

export function parseCallSessionLocation(pathname: string, basePath = '', search = ''): PlayerSessionParams | null {
  const queryRoomId = normalizeLogicalRoomId(new URLSearchParams(search).get('call') ?? '', '');
  if (queryRoomId) return { roomId: queryRoomId };
  const normalized = stripBasePath(pathname, basePath).replace(/\/+$/, '') || '/';
  const match = normalized.match(/^\/calls\/([^/]+)$/);
  const roomId = match?.[1] ? normalizeLogicalRoomId(decodeURIComponent(match[1]), '') : '';
  if (!roomId) {
    return null;
  }
  return {
    roomId
  };
}

export function inferBasePathFromWorkspacePath(pathname: string): string {
  return pathname.replace(/\/(?:game|join|calls)(?:\/[^/]+)?\/?$/, '').replace(/\/$/, '');
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
  return p2p?.callNames?.[roomId] ?? '';
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

export function normalizeLogicalRoomId(roomId: string, fallback = createFallbackRoomId()): string {
  const normalizedRoomId = normalizeSessionRoomId(roomId, fallback);
  return stripPrefixedShortRoomCode(normalizedRoomId);
}

export function stripPrefixedShortRoomCode(roomId: string): string {
  if (/^[A-Z0-9]{7}$/.test(roomId)) {
    return roomId.slice(1);
  }
  return roomId;
}
