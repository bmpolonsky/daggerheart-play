import { Store } from '../core/store/Store';
import type { ContentState } from '../domain/content/types';

export function createContentState(): ContentState {
  return {
    isLoading: false,
    error: null,
    lastLoadedAt: null,
    manifest: null,
    sourceMode: 'empty',
    sourceWarnings: [],
    selectedCollection: 'adversaries',
    searchTerm: '',
    sourceFilter: 'all',
    tierFilter: 'all',
    levelFilter: 'all',
    adversaries: [],
    classes: [],
    rules: [],
    environments: [],
    beastforms: [],
    equipment: [],
    generic: {
      ancestries: [],
      communities: [],
      subclasses: [],
      domainCards: []
    }
  };
}

export const contentStore = new Store<ContentState>(createContentState());
