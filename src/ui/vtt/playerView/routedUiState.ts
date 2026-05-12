import type { SharedToolsTab, TableViewRole } from './types';

export type RoutedPlayerViewState = {
  toolsOpen: boolean;
  toolsTab: SharedToolsTab;
};

const TOOLS_QUERY_PARAM = 'tools';
const LEGACY_TOOLS_QUERY_PARAM = 'tool';

export function sharedToolsTabsForRole(role: TableViewRole): SharedToolsTab[] {
  return role === 'gm'
    ? ['scenes', 'characters', 'library', 'notes', 'handouts', 'settings']
    : ['handouts', 'library', 'settings'];
}

export function defaultSharedToolsTab(role: TableViewRole): SharedToolsTab {
  return sharedToolsTabsForRole(role)[0] ?? 'handouts';
}

export function normalizeSharedToolsTab(tab: string | null | undefined, role: TableViewRole): SharedToolsTab {
  const tabs = sharedToolsTabsForRole(role);
  return tabs.includes(tab as SharedToolsTab) ? tab as SharedToolsTab : defaultSharedToolsTab(role);
}

export function parseRoutedPlayerViewState(search: string, role: TableViewRole): RoutedPlayerViewState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hasToolsParam = params.has(TOOLS_QUERY_PARAM) || params.has(LEGACY_TOOLS_QUERY_PARAM);
  const rawTab = params.get(TOOLS_QUERY_PARAM) ?? params.get(LEGACY_TOOLS_QUERY_PARAM);
  return {
    toolsOpen: hasToolsParam,
    toolsTab: normalizeSharedToolsTab(rawTab, role)
  };
}

export function updateRoutedPlayerViewSearch(search: string, role: TableViewRole, next: { toolsOpen: boolean; toolsTab?: SharedToolsTab }): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(LEGACY_TOOLS_QUERY_PARAM);
  if (next.toolsOpen) {
    params.set(TOOLS_QUERY_PARAM, normalizeSharedToolsTab(next.toolsTab, role));
  } else {
    params.delete(TOOLS_QUERY_PARAM);
  }
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}
