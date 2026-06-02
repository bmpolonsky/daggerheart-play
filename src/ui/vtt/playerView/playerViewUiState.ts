import { Store } from '../../../core/store/Store';
import type { TableFeedItem } from '../../../domain/tabletop/feed';

interface PlayerViewUiState {
  completedDiceRollIds: Set<string>;
  ephemeralActivity: TableFeedItem | null;
}

export const playerViewUiStore = new Store<PlayerViewUiState>({
  completedDiceRollIds: new Set(),
  ephemeralActivity: null
});

export const playerViewUiActions = {
  reset(): void {
    playerViewUiStore.set({
      completedDiceRollIds: new Set(),
      ephemeralActivity: null
    });
  },

  completeDiceRoll(rollId: string): void {
    playerViewUiStore.update((current) => {
      if (current.completedDiceRollIds.has(rollId)) return current;
      const completedDiceRollIds = new Set(current.completedDiceRollIds);
      completedDiceRollIds.add(rollId);
      return { ...current, completedDiceRollIds };
    });
  },

  setEphemeralActivity(ephemeralActivity: TableFeedItem | null): void {
    playerViewUiStore.update((current) => ({ ...current, ephemeralActivity }));
  }
};
