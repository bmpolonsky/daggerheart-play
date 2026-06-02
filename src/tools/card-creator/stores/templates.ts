import type { TemplateGroup } from "@cards/lib/api";
import { Store } from "../../../core/store/Store";

export interface TemplatesState {
  templateGroups: TemplateGroup[];
  expandedGroups: Record<string, boolean>;
  searchTerm: string;
  lastFetchedAt: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: TemplatesState = {
  templateGroups: [],
  expandedGroups: {},
  searchTerm: "",
  lastFetchedAt: null,
  isLoading: false,
  error: null,
};

export const templatesStore = new Store<TemplatesState>(initialState);
