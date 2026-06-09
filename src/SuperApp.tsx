/** @jsxImportSource preact */
import type { ComponentType } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { ToastViewport } from './ui/components/common';
import { RoleEntry } from './ui/lobby/RoleEntry';

type WorkspaceId = 'play' | 'combat' | 'cards';
type RouteId = 'entry' | 'gm' | 'join' | 'player' | 'call' | 'combat' | 'cards';
type OpenWorkspaceEvent = CustomEvent<{ workspace: WorkspaceId; hash?: string }>;
type NavigateRouteEvent = CustomEvent<{ route: RouteId; hash?: string; search?: string; roomId?: string }>;

const STALE_ROUTE_CHUNK_RELOAD_KEY = `daggerheart-play:stale-route-chunk-reload:${__APP_RELEASE__}`;

const PlayerViewApp = lazyRoute(async () => {
  const { PlayerViewApp } = await import('./ui/vtt/PlayerViewApp');
  return { default: PlayerViewApp };
});

const CombatBuilderTool = lazyRoute(async () => {
  const { CombatBuilderTool } = await import('./tools/CombatBuilderTool');
  return { default: CombatBuilderTool };
});

const CardCreatorTool = lazyRoute(async () => {
  const { CardCreatorTool } = await import('./tools/CardCreatorTool');
  return { default: CardCreatorTool };
});

const CallRoomApp = lazyRoute(async () => {
  const { CallRoomApp } = await import('./ui/call/CallRoomApp');
  return { default: CallRoomApp };
});

const ROUTES: Array<{
  id: RouteId;
  path: string;
}> = [
  {
    id: 'entry',
    path: '/'
  },
  {
    id: 'gm',
    path: '/gm'
  },
  {
    id: 'join',
    path: '/join'
  },
  {
    id: 'player',
    path: '/player'
  },
  {
    id: 'call',
    path: '/calls'
  },
  {
    id: 'combat',
    path: '/tools/combat'
  },
  {
    id: 'cards',
    path: '/tools/cards'
  }
];

function routeFromLocation(): RouteId {
  if (typeof window === 'undefined') return 'entry';
  return routeFromPath(stripBasePath(window.location.pathname)).id;
}

function isLegacyLocalPlayerPath(): boolean {
  if (typeof window === 'undefined') return false;
  const normalized = stripBasePath(window.location.pathname).replace(/\/+$/, '') || '/';
  return normalized === '/player';
}

function replaceLegacyLocalPlayerPath(): boolean {
  if (!isLegacyLocalPlayerPath()) return false;
  window.history.replaceState({}, '', pathWithBase('/'));
  return true;
}

function locationSignature(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function routeFromPath(pathname: string): (typeof ROUTES)[number] {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (/^\/join\/[^/]+$/.test(normalized)) return routeById('join');
  if (/^\/player\/[^/]+$/.test(normalized)) return routeById('player');
  if (/^\/calls(?:\/[^/]+)?$/.test(normalized)) return routeById('call');
  if (normalized === '/player') return routeById('entry');
  return ROUTES.find((route) => route.path === normalized) ?? ROUTES[0];
}

function routeFromWorkspace(workspace: WorkspaceId): RouteId {
  const routes: Record<WorkspaceId, RouteId> = {
    play: 'gm',
    combat: 'combat',
    cards: 'cards'
  };
  return routes[workspace];
}

function routeById(routeId: RouteId): (typeof ROUTES)[number] {
  return ROUTES.find((route) => route.id === routeId) ?? ROUTES[0];
}

function appBasePath(): string {
  const base = import.meta.env.BASE_URL;
  if (!base || base === '/' || base === './') return '';
  return base.replace(/\/+$/, '');
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
  if ((routeId === 'join' || routeId === 'player' || routeId === 'call') && roomId) {
    return pathWithBase(`/${routeId === 'call' ? 'calls' : routeId}/${encodeURIComponent(roomId)}`);
  }
  return pathWithBase(routeById(routeId).path);
}

function lazyRoute<T extends { default: ComponentType<any> }>(loader: () => Promise<T>) {
  return lazy(() => loader().catch(handleLazyRouteImportError));
}

function handleLazyRouteImportError(error: unknown): Promise<never> {
  if (isLikelyStaleRouteChunkError(error) && reloadOnceForStaleRouteChunk()) {
    return new Promise(() => {});
  }
  throw error;
}

function isLikelyStaleRouteChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|failed to fetch|error loading dynamically imported module|chunkloaderror/i.test(message);
}

function reloadOnceForStaleRouteChunk(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(STALE_ROUTE_CHUNK_RELOAD_KEY) === '1') return false;
    window.sessionStorage.setItem(STALE_ROUTE_CHUNK_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function SuperApp() {
  const [activeRoute, setActiveRoute] = useState<RouteId>(routeFromLocation);
  const [activeLocation, setActiveLocation] = useState(locationSignature);

  const navigateToRoute = (routeId: RouteId, hash = '', search = '', roomId?: string) => {
    const route = routeById(routeId);
    const nextPath = pathForRoute(routeId, roomId);
    const nextSearch = search ? (search.startsWith('?') ? search : `?${search}`) : '';
    const nextUrl = `${nextPath}${nextSearch}${hash}`;
    if (window.location.pathname !== nextPath || window.location.search !== nextSearch || window.location.hash !== hash) {
      window.history.pushState({}, '', nextUrl);
    }
    setActiveRoute(route.id);
    setActiveLocation(locationSignature());
  };

  useEffect(() => {
    if (replaceLegacyLocalPlayerPath()) {
      setActiveRoute('entry');
      setActiveLocation(locationSignature());
    }
    const handlePopState = () => {
      if (replaceLegacyLocalPlayerPath()) {
        setActiveRoute('entry');
        setActiveLocation(locationSignature());
        return;
      }
      setActiveRoute(routeFromLocation());
      setActiveLocation(locationSignature());
    };
    const handleOpenWorkspace = (event: Event) => {
      const detail = (event as OpenWorkspaceEvent).detail;
      if (!detail) return;
      navigateToRoute(routeFromWorkspace(detail.workspace), detail.hash ?? '');
    };
    const handleNavigateRoute = (event: Event) => {
      const detail = (event as NavigateRouteEvent).detail;
      if (!detail) return;
      navigateToRoute(detail.route, detail.hash ?? '', detail.search ?? '', detail.roomId);
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('daggerheart-play:open-workspace', handleOpenWorkspace);
    window.addEventListener('daggerheart-play:navigate-route', handleNavigateRoute);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('daggerheart-play:open-workspace', handleOpenWorkspace);
      window.removeEventListener('daggerheart-play:navigate-route', handleNavigateRoute);
    };
  }, []);

  return (
    <div className={`superapp-shell superapp-shell--${activeRoute}`}>
      <main className="superapp-content">
        <Suspense fallback={<RouteFallback />}>
          {activeRoute === 'entry' && <RoleEntry key={activeLocation} basePath={appBasePath()} onSelectRole={navigateToRoute} />}
          {activeRoute === 'join' && <RoleEntry key={activeLocation} basePath={appBasePath()} onSelectRole={navigateToRoute} />}
          {activeRoute === 'gm' && <PlayerViewApp role="gm" />}
          {activeRoute === 'player' && <PlayerViewApp key={activeLocation} />}
          {activeRoute === 'call' && <CallRoomApp key={activeLocation} basePath={appBasePath()} />}
          {activeRoute === 'combat' && <CombatBuilderTool />}
          {activeRoute === 'cards' && <CardCreatorTool />}
        </Suspense>
      </main>
      <ToastViewport />
    </div>
  );
}

function RouteFallback() {
  return <div className="app-loading">Загрузка...</div>;
}
