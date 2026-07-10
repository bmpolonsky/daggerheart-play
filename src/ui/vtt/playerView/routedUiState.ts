import type { SharedToolsTab, TableViewRole } from './types';
import { appBasePath } from '../../../app/routing';
import type { ContentCollectionKey } from '../../../domain/content/types';

export type RoutedPlayerViewState = {
  toolsOpen: boolean;
  toolsTab: SharedToolsTab;
  libraryCollection: ContentCollectionKey | null;
  settingsSection: string | null;
};

const LIBRARY_PATH_PREFIX = '/library';

const COLLECTION_SLUGS: Record<ContentCollectionKey, string> = {
  adversaries: 'adversaries',
  ancestries: 'ancestries',
  beastforms: 'beastforms',
  classes: 'classes',
  communities: 'communities',
  domainCards: 'domain-cards',
  environments: 'environments',
  equipment: 'equipment',
  rules: 'rules',
  subclasses: 'subclasses'
};

const COLLECTION_BY_SLUG = Object.fromEntries(
  Object.entries(COLLECTION_SLUGS).flatMap(([key, slug]) => [
    [slug, key],
    [key, key]
  ])
) as Record<string, ContentCollectionKey | undefined>;

const SETTINGS_SLUGS: Record<string, string> = {
  connection: 'connection',
  diagnostics: 'diagnostics',
  game: 'game',
  players: 'players',
  projectGames: 'project-games'
};

const SETTINGS_BY_SLUG = Object.fromEntries(
  Object.entries(SETTINGS_SLUGS).flatMap(([key, slug]) => [
    [slug, key],
    [key, key]
  ])
) as Record<string, string | undefined>;

export function sharedToolsTabsForRole(role: TableViewRole): SharedToolsTab[] {
  return role === 'gm'
    ? ['scenes', 'characters', 'combat', 'library', 'notes', 'handouts', 'settings']
    : ['handouts', 'library', 'settings'];
}

export function defaultSharedToolsTab(role: TableViewRole): SharedToolsTab {
  return sharedToolsTabsForRole(role)[0] ?? 'handouts';
}

export function normalizeSharedToolsTab(tab: string | null | undefined, role: TableViewRole): SharedToolsTab {
  const tabs = sharedToolsTabsForRole(role);
  return tabs.includes(tab as SharedToolsTab) ? tab as SharedToolsTab : defaultSharedToolsTab(role);
}

export function parseRoutedPlayerViewState(pathname: string, role: TableViewRole): RoutedPlayerViewState {
  const normalized = stripBasePath(pathname).replace(/\/+$/, '') || '/';
  if (normalized !== LIBRARY_PATH_PREFIX && !normalized.startsWith(`${LIBRARY_PATH_PREFIX}/`)) {
    return emptyRoutedPlayerViewState(role);
  }

  const [section, subsection] = normalized
    .slice(LIBRARY_PATH_PREFIX.length)
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (!section || section === 'compendium') {
    return {
      toolsOpen: true,
      toolsTab: 'library',
      libraryCollection: collectionFromSlug(subsection),
      settingsSection: null
    };
  }
  if (section === 'custom') {
    return {
      toolsOpen: true,
      toolsTab: 'library',
      libraryCollection: 'adversaries',
      settingsSection: null
    };
  }
  if (section === 'settings') {
    return {
      toolsOpen: true,
      toolsTab: 'settings',
      libraryCollection: null,
      settingsSection: SETTINGS_BY_SLUG[subsection ?? ''] ?? null
    };
  }

  return {
    toolsOpen: true,
    toolsTab: normalizeSharedToolsTab(section, role),
    libraryCollection: null,
    settingsSection: null
  };
}

export function buildRoutedPlayerViewLocation(
  current: { hash: string },
  role: TableViewRole,
  next: {
    toolsOpen: boolean;
    toolsTab?: SharedToolsTab;
    libraryCollection?: ContentCollectionKey | null;
    settingsSection?: string | null;
  }
): { pathname: string; search: string; hash: string; url: string } {
  const pathname = withBase(next.toolsOpen ? pathForToolsTab(normalizeSharedToolsTab(next.toolsTab, role), next) : '/game');
  return {
    pathname,
    search: '',
    hash: current.hash,
    url: `${pathname}${current.hash}`
  };
}

function emptyRoutedPlayerViewState(role: TableViewRole): RoutedPlayerViewState {
  return {
    toolsOpen: false,
    toolsTab: defaultSharedToolsTab(role),
    libraryCollection: null,
    settingsSection: null
  };
}

function pathForToolsTab(tab: SharedToolsTab, next: { libraryCollection?: ContentCollectionKey | null; settingsSection?: string | null }): string {
  if (tab === 'library') {
    const collectionSlug = next.libraryCollection ? COLLECTION_SLUGS[next.libraryCollection] : '';
    return collectionSlug ? `${LIBRARY_PATH_PREFIX}/compendium/${collectionSlug}` : `${LIBRARY_PATH_PREFIX}/compendium`;
  }
  if (tab === 'settings') {
    const sectionSlug = next.settingsSection ? SETTINGS_SLUGS[next.settingsSection] : '';
    return sectionSlug ? `${LIBRARY_PATH_PREFIX}/settings/${sectionSlug}` : `${LIBRARY_PATH_PREFIX}/settings`;
  }
  return `${LIBRARY_PATH_PREFIX}/${tab}`;
}

function collectionFromSlug(value: string | null | undefined): ContentCollectionKey | null {
  if (!value) return null;
  return COLLECTION_BY_SLUG[value] ?? null;
}

function stripBasePath(pathname: string): string {
  const base = appBasePath();
  if (!base || !pathname.startsWith(base)) return pathname;
  const stripped = pathname.slice(base.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function withBase(pathname: string): string {
  return `${appBasePath()}${pathname}`;
}
