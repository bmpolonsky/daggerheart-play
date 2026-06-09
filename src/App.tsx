/** @jsxImportSource preact */
import { AppRouteRenderer } from './app/AppRouteRenderer';
import { useAppRouting } from './app/useAppRouting';
import { ToastViewport } from './ui/components/common';

export function App() {
  const { activeLocation, activeRoute, navigateToRoute } = useAppRouting();

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
