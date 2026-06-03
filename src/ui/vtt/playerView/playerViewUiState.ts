import { Store } from '../../../core/store/Store';
import { buildCountdownComposerFeedItem, buildHandoutDraftFeedItem, type TableFeedItem } from '../../../domain/tabletop/feed';
import { createId } from '../../../core/utils/id';
import { nowIso } from '../../../core/utils/date';
import type { GameHandout } from '../../../domain/rules/types';

interface PlayerViewUiState {
  completedDiceRollIds: Set<string>;
  ephemeralFeedItem: TableFeedItem | null;
}

export const playerViewUiStore = new Store<PlayerViewUiState>({
  completedDiceRollIds: new Set(),
  ephemeralFeedItem: null
});

export const playerViewUi$ = playerViewUiStore.toStream();

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
  },

  openHandoutDraft(handout: Pick<GameHandout, 'id' | 'title' | 'body' | 'imageUrl'>): void {
    playerViewUiActions.setEphemeralFeedItem(buildHandoutDraftFeedItem({
      id: createId('ephemeral-handout'),
      createdAt: nowIso(),
      handout
    }));
  }
};
