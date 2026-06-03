import type { TemplateCard, TemplateCollectionResponse, TemplateGroup } from "@cards/lib/api";
import { fetchTemplateCollection } from "@cards/lib/api";
import { templatesStore, type TemplatesState } from "@cards/stores/templates";

export interface TemplateGroupView extends TemplateGroup {
  filteredItems: TemplateCard[];
  expanded: boolean;
  toggle: () => void;
}

type TemplateGroupViewState = Pick<
  TemplatesState,
  "templateGroups" | "expandedGroups" | "searchTerm"
>;

function applyTemplatePayload({ templateGroups, fetchedAt }: TemplateCollectionResponse) {
  templatesStore.update((prev) => {
    const nextExpanded: Record<string, boolean> = {};

    templateGroups.forEach((group, index) => {
      nextExpanded[group.id] = prev.expandedGroups[group.id] ?? index === 0;
    });

    return {
      ...prev,
      templateGroups,
      lastFetchedAt: fetchedAt,
      expandedGroups: nextExpanded,
    };
  });
}

export class TemplatesService {
  readonly templates$ = templatesStore.toStream();
  private currentRequestId = 0;
  private bootstrapped = false;

  ensureLoaded() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    void this.reload();
  }

  setSearchTerm(value: string) {
    templatesStore.update((state) => ({
      ...state,
      searchTerm: value,
    }));
  }

  toggleGroup(groupId: string) {
    templatesStore.update((state) => ({
      ...state,
      expandedGroups: {
        ...state.expandedGroups,
        [groupId]: !(state.expandedGroups[groupId] ?? false),
      },
    }));
  }

  buildGroupViews(state: TemplateGroupViewState): TemplateGroupView[] {
    const { templateGroups, expandedGroups, searchTerm } = state;
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return templateGroups.map((group) => {
      const filteredItems = normalizedSearch
        ? group.items.filter((card) => card.name.toLowerCase().includes(normalizedSearch))
        : group.items;

      return {
        ...group,
        filteredItems,
        expanded: expandedGroups[group.id] ?? false,
        toggle: () => this.toggleGroup(group.id),
      };
    });
  }

  async reload() {
    const requestId = ++this.currentRequestId;

    templatesStore.update((state) => ({
      ...state,
      isLoading: true,
      error: null,
    }));

    try {
      const data = await fetchTemplateCollection();
      if (requestId !== this.currentRequestId) {
        return;
      }
      applyTemplatePayload(data);
    } catch (err) {
      if (requestId !== this.currentRequestId) {
        return;
      }

      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      templatesStore.update((state) => ({
        ...state,
        error: message,
      }));
    } finally {
      if (requestId !== this.currentRequestId) {
        return;
      }

      templatesStore.update((state) => ({
        ...state,
        isLoading: false,
      }));
    }
  }
}

export const templatesService = new TemplatesService();
