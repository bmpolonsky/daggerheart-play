/** @jsxImportSource preact */
import { useLayoutEffect } from 'preact/hooks';
import { AppRouteRenderer } from './app/AppRouteRenderer';
import { useAppRouting } from './app/useAppRouting';
import { ToastViewport } from './ui/components/common';

export function App() {
  const { activeLocation, activeRoute, navigateToRoute } = useAppRouting();

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const query = window.matchMedia('(max-width: 920px)');
    const root = document.documentElement;
    const resetDocumentScroll = () => {
      root.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    const syncEntryScroll = () => {
      const enabled = query.matches && (activeRoute === 'entry' || activeRoute === 'join');
      const wasEnabled = root.classList.contains('dh-mobile-entry-scroll');
      if (!enabled && wasEnabled) resetDocumentScroll();
      root.classList.toggle('dh-mobile-entry-scroll', enabled);
    };
    syncEntryScroll();
    query.addEventListener('change', syncEntryScroll);
    return () => {
      query.removeEventListener('change', syncEntryScroll);
      if (root.classList.contains('dh-mobile-entry-scroll')) resetDocumentScroll();
      root.classList.remove('dh-mobile-entry-scroll');
    };
  }, [activeRoute]);

  return (
    <div className={`superapp-shell superapp-shell--${activeRoute}`}>
      <main className="superapp-content">
        <AppRouteRenderer
          activeLocation={activeLocation}
          activeRoute={activeRoute}
          onNavigateRoute={navigateToRoute}
        />
      </main>
      <ToastViewport />
    </div>
  );
}
