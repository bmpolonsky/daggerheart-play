import { localAppStorageStore, sessionAppStorageStore } from '../../core/persistence/appBrowserStorage';
import type { P2PNetworkSettings } from './networkSettings';

export interface PlayerInviteUrlInput {
  origin: string;
  basePath?: string;
  roomId: string;
  networkSettings?: P2PNetworkSettings;
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
  const invite = new URL(baseRootPath(input.basePath), input.origin);
  invite.hash = `/join/${encodeURIComponent(roomId)}`;
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
  const invite = new URL(baseRootPath(input.basePath), input.origin);
  invite.hash = `/calls/${encodeURIComponent(roomId)}`;
  return invite.toString();
}

export function parsePlayerSessionLocation(pathname: string, basePath = '', search = '', hash = ''): PlayerSessionParams | null {
  const queryRoomId = new URLSearchParams(search).get('join');
  if (queryRoomId) return parsePlayerInviteRoomCode(queryRoomId);
  const normalized = sessionRoutePath(pathname, basePath, hash);
  const match = normalized.match(/^\/join\/([^/]+)$/);
  return match?.[1] ? parsePlayerInviteRoomCode(decodeURIComponent(match[1])) : null;
}

export function parsePlayerInviteRoomCode(value: string): PlayerSessionParams | null {
  const roomId = normalizeLogicalRoomId(value, '');
  if (!roomId) return null;
  return { roomId };
}

export function parseCallSessionLocation(pathname: string, basePath = '', search = '', hash = ''): PlayerSessionParams | null {
  const queryRoomId = normalizeLogicalRoomId(new URLSearchParams(search).get('call') ?? '', '');
  if (queryRoomId) return { roomId: queryRoomId };
  const normalized = sessionRoutePath(pathname, basePath, hash);
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

function baseRootPath(basePath = ''): string {
  const normalized = basePath.replace(/\/+$/, '');
  return normalized ? `${normalized}/` : '/';
}

function stripBasePath(pathname: string, basePath = ''): string {
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (!normalizedBase || !pathname.startsWith(normalizedBase)) return pathname;
  const stripped = pathname.slice(normalizedBase.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function sessionRoutePath(pathname: string, basePath: string, hash: string): string {
  const hashPath = hash.replace(/^#/, '');
  if (hashPath.startsWith('/')) return hashPath.replace(/\/+$/, '') || '/';
  return stripBasePath(pathname, basePath).replace(/\/+$/, '') || '/';
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
