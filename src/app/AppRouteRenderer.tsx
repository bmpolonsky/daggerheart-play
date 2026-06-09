/** @jsxImportSource preact */
import { Suspense } from 'preact/compat';
import { appBasePath, type NavigableRouteId, type RouteId } from './routing';
import { lazyRoute } from './lazyRoute';
import { RoleEntry } from '../ui/lobby/RoleEntry';

const PlayerViewApp = lazyRoute(async () => {
  const { PlayerViewApp } = await import('../ui/vtt/PlayerViewApp');
  return { default: PlayerViewApp };
});

const CombatBuilderTool = lazyRoute(async () => {
  const { CombatBuilderTool } = await import('../tools/CombatBuilderTool');
  return { default: CombatBuilderTool };
});

const CardCreatorTool = lazyRoute(async () => {
  const { CardCreatorTool } = await import('../tools/CardCreatorTool');
  return { default: CardCreatorTool };
});

const CallRoomApp = lazyRoute(async () => {
  const { CallRoomApp } = await import('../ui/call/CallRoomApp');
  return { default: CallRoomApp };
});

interface AppRouteRendererProps {
  activeLocation: string;
  activeRoute: RouteId;
  onNavigateRoute: (route: NavigableRouteId, hash?: string, search?: string, roomId?: string) => void;
}

export function AppRouteRenderer({ activeLocation, activeRoute, onNavigateRoute }: AppRouteRendererProps) {
  const basePath = appBasePath();

  return (
    <Suspense fallback={<RouteFallback />}>
      {(activeRoute === 'entry' || activeRoute === 'join') && (
        <RoleEntry key={activeLocation} basePath={basePath} onSelectRole={onNavigateRoute} />
      )}
      {activeRoute === 'game' && <PlayerViewApp key={activeLocation} />}
      {activeRoute === 'call' && <CallRoomApp key={activeLocation} basePath={basePath} />}
      {activeRoute === 'combat' && <CombatBuilderTool />}
      {activeRoute === 'cards' && <CardCreatorTool />}
    </Suspense>
  );
}

function RouteFallback() {
  return <div className="app-loading">Загрузка...</div>;
}
