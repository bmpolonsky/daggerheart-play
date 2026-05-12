import type { Adversary } from "@combat/lib/api";
import { Store } from "@combat/lib/store";

export interface AdversariesState {
  items: Adversary[];
  searchTerm: string;
  tierFilter: number | "all";
  roleFilter: string;
  selectedAdversaryId: number | null;
  lastFetchedAt: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AdversariesState = {
  items: [],
  searchTerm: "",
  tierFilter: "all",
  roleFilter: "all",
  selectedAdversaryId: null,
  lastFetchedAt: null,
  isLoading: false,
  error: null,
};

export const adversariesStore = new Store<AdversariesState>(initialState);
