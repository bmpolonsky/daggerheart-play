import type { ComponentType } from 'preact';
import { lazy } from 'preact/compat';

const STALE_ROUTE_CHUNK_RELOAD_KEY = `daggerheart-play:stale-route-chunk-reload:${__APP_RELEASE__}`;

export function lazyRoute<T extends { default: ComponentType<any> }>(loader: () => Promise<T>) {
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
