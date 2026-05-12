import type { UiState } from '../domain/rules/types';
import { uiStore } from '../stores/gameStores';

export class UiService {
  readonly uiStore = uiStore;

  setActiveScreen(screen: UiState['activeScreen']): void {
    uiStore.update((state) => ({ ...state, activeScreen: screen }));
  }

  toggleSidebar(): void {
    uiStore.update((state) => ({ ...state, sidebarCollapsed: !state.sidebarCollapsed }));
  }
}
