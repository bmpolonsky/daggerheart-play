/** @jsxImportSource preact */
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { RoleEntry } from './ui/lobby/RoleEntry';

type WorkspaceId = 'play' | 'combat' | 'cards';
type RouteId = 'entry' | 'gm' | 'join' | 'player' | 'combat' | 'cards';
type OpenWorkspaceEvent = CustomEvent<{ workspace: WorkspaceId; hash?: string }>;

const PlayerViewApp = lazy(async () => {
  const { PlayerViewApp } = await import('./ui/vtt/PlayerViewApp');
  return { default: PlayerViewApp };
});

const CombatBuilderTool = lazy(async () => {
  const { CombatBuilderTool } = await import('./tools/CombatBuilderTool');
  return { default: CombatBuilderTool };
});

const CardCreatorTool = lazy(async () => {
  const { CardCreatorTool } = await import('./tools/CardCreatorTool');
  return { default: CardCreatorTool };
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
  if ((routeId === 'join' || routeId === 'player') && roomId) {
    return pathWithBase(`/${routeId}/${encodeURIComponent(roomId)}`);
  }
  return pathWithBase(routeById(routeId).path);
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
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('daggerheart-play:open-workspace', handleOpenWorkspace);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('daggerheart-play:open-workspace', handleOpenWorkspace);
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
          {activeRoute === 'combat' && <CombatBuilderTool />}
          {activeRoute === 'cards' && <CardCreatorTool />}
        </Suspense>
      </main>
    </div>
  );
}

function RouteFallback() {
  return <div className="app-loading">Загрузка...</div>;
}
