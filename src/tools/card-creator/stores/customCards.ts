import type { CustomCardRecord } from "@cards/services/customCardsService";
import { Store } from "@cards/lib/store";

export interface CustomCardsState {
  items: CustomCardRecord[];
  lastUpdatedAt: number | null;
}

export const customCardsStore = new Store<CustomCardsState>({
  items: [],
  lastUpdatedAt: null,
});
