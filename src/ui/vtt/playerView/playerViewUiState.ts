import { Store } from '../../../core/store/Store';
import { buildCountdownComposerFeedItem, type TableFeedItem } from '../../../domain/tabletop/feed';
import { createId } from '../../../core/utils/id';
import { nowIso } from '../../../core/utils/date';

interface PlayerViewUiState {
  completedDiceRollIds: Set<string>;
  ephemeralFeedItem: TableFeedItem | null;
}

export const playerViewUiStore = new Store<PlayerViewUiState>({
  completedDiceRollIds: new Set(),
  ephemeralFeedItem: null
});

export const playerViewUiActions = {
  reset(): void {
    playerViewUiStore.set({
      completedDiceRollIds: new Set(),
      ephemeralFeedItem: null
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

  setEphemeralFeedItem(ephemeralFeedItem: TableFeedItem | null): void {
    playerViewUiStore.update((current) => ({ ...current, ephemeralFeedItem }));
  },

  openCountdownComposer(): void {
    playerViewUiActions.setEphemeralFeedItem(buildCountdownComposerFeedItem({
      id: createId('ephemeral-countdown'),
      createdAt: nowIso()
    }));
  }
};
