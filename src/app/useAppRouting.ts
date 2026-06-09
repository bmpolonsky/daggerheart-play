import { useEffect, useState } from 'preact/hooks';
import {
  locationSignature,
  replaceLegacyRoute,
  routeFromLocation,
  routeFromWorkspace,
  routeNavigation,
  type NavigableRouteId,
  type WorkspaceId
} from './routing';

type OpenWorkspaceEvent = CustomEvent<{ workspace: WorkspaceId; hash?: string }>;
type NavigateRouteEvent = CustomEvent<{ route: NavigableRouteId; hash?: string; search?: string; roomId?: string }>;

export function useAppRouting() {
  const [activeRoute, setActiveRoute] = useState(routeFromLocation);
  const [activeLocation, setActiveLocation] = useState(locationSignature);

  const navigateToRoute = (routeId: NavigableRouteId, hash = '', search = '', roomId?: string) => {
    const navigation = routeNavigation(routeId, hash, search, roomId);
    if (
      window.location.pathname !== navigation.pathname ||
      window.location.search !== navigation.search ||
      window.location.hash !== navigation.hash
    ) {
      window.history.pushState({}, '', navigation.url);
    }
    setActiveRoute(navigation.route);
    setActiveLocation(locationSignature());
  };

  useEffect(() => {
    syncCurrentRoute();

    const handlePopState = () => {
      syncCurrentRoute();
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

  function syncCurrentRoute() {
    replaceLegacyRoute();
    setActiveRoute(routeFromLocation());
    setActiveLocation(locationSignature());
  }

  return {
    activeLocation,
    activeRoute,
    navigateToRoute
  };
}
