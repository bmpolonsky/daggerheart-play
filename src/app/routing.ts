export type WorkspaceId = 'play' | 'combat' | 'cards';
export type RouteId = 'entry' | 'game' | 'join' | 'call' | 'combat' | 'cards';
export type LegacyRouteId = 'gm' | 'player';
export type NavigableRouteId = RouteId | LegacyRouteId;

const ROUTE_PATHS: Record<RouteId, string> = {
  entry: '/',
  game: '/game',
  join: '/join',
  call: '/calls',
  combat: '/tools/combat',
  cards: '/tools/cards'
};

const WORKSPACE_ROUTES: Record<WorkspaceId, RouteId> = {
  play: 'game',
  combat: 'combat',
  cards: 'cards'
};

export function appBasePath(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/' || base === './') return '';
  return base.replace(/\/+$/, '');
}

export function routeFromLocation(): RouteId {
  if (typeof window === 'undefined') return 'entry';
  if (serverSessionEnabled()) {
    const search = new URLSearchParams(window.location.search);
    if (search.has('join')) return 'join';
    if (search.has('call')) return 'call';
  }
  return routeFromPath(stripBasePath(window.location.pathname));
}

export function replaceLegacyRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const normalized = stripBasePath(window.location.pathname).replace(/\/+$/, '') || '/';
  const nextPath = legacyRouteTarget(normalized);
  if (!nextPath) return false;
  window.history.replaceState({}, '', `${nextPath}${window.location.search}${window.location.hash}`);
  return true;
}

export function locationSignature(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function routeFromWorkspace(workspace: WorkspaceId): RouteId {
  return WORKSPACE_ROUTES[workspace];
}

export function routeNavigation(routeId: NavigableRouteId, hash = '', search = '', roomId?: string, transportMode: SessionTransportMode = sessionTransportMode()) {
  const canonicalRouteId = canonicalRouteIdForNavigation(routeId, roomId);
  let pathname = pathForRoute(canonicalRouteId, roomId);
  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (transportMode === 'server' && roomId && (canonicalRouteId === 'join' || canonicalRouteId === 'call')) {
    pathname = pathWithBase('/');
    searchParams.set(canonicalRouteId, roomId);
  }
  const serializedSearch = searchParams.toString();
  const nextSearch = serializedSearch ? `?${serializedSearch}` : '';
  const url = `${pathname}${nextSearch}${hash}`;
  return {
    hash,
    pathname,
    route: canonicalRouteId,
    search: nextSearch,
    url
  };
}

function routeFromPath(pathname: string): RouteId {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (/^\/join\/[^/]+$/.test(normalized)) return 'join';
  if (/^\/calls(?:\/[^/]+)?$/.test(normalized)) return 'call';
  if (/^\/library(?:\/.*)?$/.test(normalized)) return 'game';
  return (Object.entries(ROUTE_PATHS).find(([, path]) => path === normalized)?.[0] as RouteId | undefined) ?? 'entry';
}

function canonicalRouteIdForNavigation(routeId: NavigableRouteId, roomId?: string): RouteId {
  if (routeId === 'player' && roomId) return 'join';
  if (routeId === 'gm' || routeId === 'player') return 'game';
  return routeId;
}

function legacyRouteTarget(normalizedPathname: string): string | null {
  if (normalizedPathname === '/gm' || normalizedPathname === '/player') {
    return pathWithBase('/game');
  }
  const playerInviteMatch = normalizedPathname.match(/^\/player\/([^/]+)$/);
  if (playerInviteMatch?.[1]) {
    return pathWithBase(`/join/${playerInviteMatch[1]}`);
  }
  return null;
}

function stripBasePath(pathname: string): string {
  const base = appBasePath();
  if (!base || !pathname.startsWith(base)) return pathname;
  const stripped = pathname.slice(base.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function pathWithBase(pathname: string): string {
  return `${appBasePath()}${pathname}`;
}

function pathForRoute(routeId: RouteId, roomId?: string): string {
  if (routeId === 'join' && roomId) {
    return pathWithBase(`/join/${encodeURIComponent(roomId)}`);
  }
  if (routeId === 'call' && roomId) {
    return pathWithBase(`/calls/${encodeURIComponent(roomId)}`);
  }
  return pathWithBase(ROUTE_PATHS[routeId]);
}
import { serverSessionEnabled, sessionTransportMode, type SessionTransportMode } from '../domain/p2p/serverSession';
