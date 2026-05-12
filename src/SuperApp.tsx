/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Crown, GalleryHorizontalEnd, LayoutDashboard, MonitorPlay, Swords } from 'lucide-react';
import { TabletopApp } from './ui/vtt/TabletopApp';
import { PlayerViewApp } from './ui/vtt/PlayerViewApp';
import { CardCreatorTool } from './tools/CardCreatorTool';
import { CombatBuilderTool } from './tools/CombatBuilderTool';
import { parsePlayerSessionLocation } from './domain/p2p/sessionLinks';
import { PlayerJoinLobby, SessionLobby } from './ui/lobby/SessionLobby';

type WorkspaceId = 'play' | 'combat' | 'cards';
type RouteId = 'entry' | 'gm' | 'join' | 'player' | 'combat' | 'cards';
type OpenWorkspaceEvent = CustomEvent<{ workspace: WorkspaceId; hash?: string }>;

const ROUTES: Array<{
  id: RouteId;
  path: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: 'entry',
    path: '/',
    label: 'Вход',
    description: 'Выбор локальной роли',
    icon: LayoutDashboard
  },
  {
    id: 'gm',
    path: '/gm',
    label: 'Игра',
    description: 'Сцены, персонажи, броски и библиотека',
    icon: Crown
  },
  {
    id: 'join',
    path: '/join',
    label: 'Подключение',
    description: 'Лобби игрока перед входом в игру',
    icon: MonitorPlay
  },
  {
    id: 'player',
    path: '/player',
    label: 'Игрок',
    description: 'Публичная сцена без мастерских панелей',
    icon: MonitorPlay
  },
  {
    id: 'combat',
    path: '/tools/combat',
    label: 'Бои',
    description: 'Конструктор столкновений и противников',
    icon: Swords
  },
  {
    id: 'cards',
    path: '/tools/cards',
    label: 'Карты',
    description: 'Редактор и экспорт карточек',
    icon: GalleryHorizontalEnd
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
        {activeRoute === 'entry' && <RoleEntry key={activeLocation} onSelectRole={navigateToRoute} />}
        {activeRoute === 'join' && <RoleEntry key={activeLocation} onSelectRole={navigateToRoute} />}
        {activeRoute === 'gm' && <TabletopApp />}
        {activeRoute === 'player' && <PlayerViewApp key={activeLocation} />}
        {activeRoute === 'combat' && <CombatBuilderTool />}
        {activeRoute === 'cards' && <CardCreatorTool />}
      </main>
    </div>
  );
}

function RoleEntry({ onSelectRole }: { onSelectRole: (route: RouteId, hash?: string, search?: string, roomId?: string) => void }) {
  const sessionParams = typeof window === 'undefined' ? null : parsePlayerSessionLocation(window.location.pathname, appBasePath());

  if (sessionParams) {
    return (
      <PlayerJoinLobby
        roomId={sessionParams.roomId}
        password={sessionParams.password}
        onBackToLobby={() => onSelectRole('entry')}
        onEnterPlayerRoom={(roomId) => onSelectRole('player', '', '', roomId)}
      />
    );
  }

  return (
    <SessionLobby
      inviteContext={lobbyInviteContext()}
      onEnterGm={() => onSelectRole('gm')}
      onJoinRoom={(roomId) => onSelectRole('join', '', '', roomId)}
    />
  );
}

function lobbyInviteContext() {
  if (typeof window === 'undefined') {
    return { origin: 'http://localhost', basePath: appBasePath() };
  }
  return {
    origin: window.location.origin,
    basePath: appBasePath()
  };
}
