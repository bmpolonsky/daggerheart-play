import { Store } from "@cards/lib/store";

export type DomainSource = "default" | "custom";

export interface DomainTheme {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  source: DomainSource;
}

export interface DomainState {
  domains: DomainTheme[];
  isReady: boolean;
}

const initialState: DomainState = {
  domains: [],
  isReady: false,
};

export const domainStore = new Store<DomainState>(initialState);
