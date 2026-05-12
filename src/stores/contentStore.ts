import { ReactiveStore } from '../core/store/ReactiveStore';
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
    tierFilter: 'all',
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

export const contentStore = new ReactiveStore<ContentState>(createContentState());
