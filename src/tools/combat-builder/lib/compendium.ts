import { hashRouteLocation } from '../../../app/routing';

export function openAdversaryCompendium(slug?: string, copy = false): void {
  if (typeof window === 'undefined') return;
  const suffix = slug ? `/${encodeURIComponent(slug)}` : '';
  const search = copy && slug ? `copy=${encodeURIComponent(slug)}` : '';
  window.location.assign(hashRouteLocation(`/library/compendium/adversaries${suffix}`, search).url);
}
