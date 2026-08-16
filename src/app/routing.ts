import type { SessionConnectionMode } from '../domain/p2p/serverSession';

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

interface LocationLike {
  hash: string;
  pathname: string;
  search: string;
}

export function appBasePath(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/' || base === './') return '';
  return base.replace(/\/+$/, '');
}

export function routeFromLocation(): RouteId {
  if (typeof window === 'undefined') return 'entry';
  return routeFromPath(routePathFromLocation(window.location));
}

export function routePathFromLocation(location: LocationLike, basePath = appBasePath()): string {
  const hashPath = routePathFromHash(location.hash);
  if (hashPath) return hashPath;

  const path = normalizeRoutePath(stripBasePath(location.pathname, basePath));
  return legacyRouteTarget(path) ?? path;
}

export function currentRoutePathname(): string {
  if (typeof window === 'undefined') return '/';
  return routePathFromLocation(window.location);
}

export function routePathFromHash(hash: string): string | null {
  const value = hash.replace(/^#/, '');
  return value.startsWith('/') ? normalizeRoutePath(value) : null;
}

export function replaceLegacyRoute(): boolean {
  if (typeof window === 'undefined' || routePathFromHash(window.location.hash)) return false;
  const originalPath = normalizeRoutePath(stripBasePath(window.location.pathname));
  let routePath = routePathFromLocation(window.location);
  const legacyTarget = legacyRouteTarget(originalPath);
  const hasLegacyCardHash = /^#(?:card|custom)\//.test(window.location.hash);

  if (hasLegacyCardHash && (originalPath === '/' || originalPath === '/tools/cards')) {
    routePath = `/tools/cards/${window.location.hash.slice(1)}`;
  }

  if (originalPath === '/' && !legacyTarget && !hasLegacyCardHash) return false;
  if (!isKnownRoutePath(routePath) && !legacyTarget) return false;
  const navigation = hashRouteLocation(routePath, window.location.search);
  window.history.replaceState({}, '', navigation.url);
  return true;
}

export function locationSignature(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function routeFromWorkspace(workspace: WorkspaceId): RouteId {
  return WORKSPACE_ROUTES[workspace];
}

export function hashRouteLocation(routePath: string, search = '') {
  const normalizedPath = normalizeRoutePath(routePath);
  const nextSearch = search && !search.startsWith('?') ? `?${search}` : search;
  const pathname = `${appBasePath()}/`;
  const hash = normalizedPath === '/' ? '' : `#${normalizedPath}`;
  return {
    hash,
    pathname,
    routePath: normalizedPath,
    search: nextSearch,
    url: `${pathname}${nextSearch}${hash}`
  };
}

export function routeNavigation(
  routeId: NavigableRouteId,
  legacyHash = '',
  search = '',
  roomId?: string,
  _transportMode?: SessionConnectionMode
) {
  const route = canonicalRouteIdForNavigation(routeId, roomId);
  let routePath = pathForRoute(route, roomId);
  if (route === 'cards' && /^#(?:card|custom)\//.test(legacyHash)) {
    routePath += `/${legacyHash.slice(1)}`;
  }
  return {
    ...hashRouteLocation(routePath, search),
    route
  };
}

function routeFromPath(pathname: string): RouteId {
  const normalized = normalizeRoutePath(pathname);
  if (/^\/join\/[^/]+$/.test(normalized)) return 'join';
  if (/^\/calls(?:\/[^/]+)?$/.test(normalized)) return 'call';
  if (/^\/library(?:\/.*)?$/.test(normalized)) return 'game';
  if (/^\/tools\/cards(?:\/.*)?$/.test(normalized)) return 'cards';
  return (Object.entries(ROUTE_PATHS).find(([, path]) => path === normalized)?.[0] as RouteId | undefined) ?? 'entry';
}

function isKnownRoutePath(pathname: string): boolean {
  const normalized = normalizeRoutePath(pathname);
  return normalized === '/'
    || normalized === '/game'
    || normalized === '/tools/combat'
    || /^\/tools\/cards(?:\/.*)?$/.test(normalized)
    || /^\/join\/[^/]+$/.test(normalized)
    || /^\/calls(?:\/[^/]+)?$/.test(normalized)
    || /^\/library(?:\/.*)?$/.test(normalized);
}

function canonicalRouteIdForNavigation(routeId: NavigableRouteId, roomId?: string): RouteId {
  if (routeId === 'player' && roomId) return 'join';
  if (routeId === 'gm' || routeId === 'player') return 'game';
  return routeId;
}

function legacyRouteTarget(pathname: string): string | null {
  if (pathname === '/gm' || pathname === '/player') return '/game';
  const playerInviteMatch = pathname.match(/^\/player\/([^/]+)$/);
  return playerInviteMatch?.[1] ? `/join/${playerInviteMatch[1]}` : null;
}

function stripBasePath(pathname: string, basePath = appBasePath()): string {
  const base = basePath.replace(/\/+$/, '');
  if (!base || (pathname !== base && !pathname.startsWith(`${base}/`))) return pathname;
  const stripped = pathname.slice(base.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function pathForRoute(routeId: RouteId, roomId?: string): string {
  if (routeId === 'join' && roomId) return `/join/${encodeURIComponent(roomId)}`;
  if (routeId === 'call' && roomId) return `/calls/${encodeURIComponent(roomId)}`;
  return ROUTE_PATHS[routeId];
}

function normalizeRoutePath(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, '') || '/';
}
