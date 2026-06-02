import type { CustomCardRecord } from "@cards/services/customCardsService";
import { Store } from "../../../core/store/Store";

export interface CustomCardsState {
  items: CustomCardRecord[];
  lastUpdatedAt: number | null;
}

export const customCardsStore = new Store<CustomCardsState>({
  items: [],
  lastUpdatedAt: null,
});
