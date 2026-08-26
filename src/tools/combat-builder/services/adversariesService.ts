import { fetchAdversaryCollection, type Adversary } from "@combat/lib/api";
import {
  buildCustomAdversaryExport,
  customAdversaryToRaw,
  extractCustomAdversaryItems,
  normalizeRawCustomAdversary,
} from "@combat/lib/customAdversaries";
import { encounterService } from "@combat/services/encounterService";
import { adversariesStore } from "@combat/stores/adversaries";
import { loadCustomAdversaries, saveCustomAdversaries, subscribeCustomContentChanges } from "../../../core/persistence/browserProjectContent";

const isBrowser = () => typeof window !== "undefined";

function sortAdversaries(items: Adversary[]) {
  return [...items].sort((left, right) => {
    if (left.isCustom !== right.isCustom) {
      return left.isCustom ? -1 : 1;
    }
    if (left.tier !== right.tier) {
      return left.tier - right.tier;
    }
    return left.name.localeCompare(right.name, "ru");
  });
}

export class AdversariesService {
  readonly adversaries$ = adversariesStore.toStream();
  private bootstrapped = false;
  private currentRequestId = 0;
  private customLoaded = false;
  private customLoadingPromise: Promise<void> | null = null;
  private customRevision = 0;
  private remoteItems: Adversary[] = [];
  private customItems: Adversary[] = [];
  private unsubscribeCustomChanges: (() => void) | null = null;

  ensureLoaded() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    adversariesStore.update((state) => ({ ...state, isLoading: true, error: null }));
    this.subscribeCustomChanges();
    void this.ensureCustomLoaded().then(() => this.reload());
  }

  private subscribeCustomChanges() {
    if (this.unsubscribeCustomChanges || !isBrowser()) return;
    this.unsubscribeCustomChanges = subscribeCustomContentChanges("adversaries", () => {
      this.customLoaded = false;
      this.customLoadingPromise = null;
      void this.ensureCustomLoaded();
    });
  }

  private ensureCustomLoaded(): Promise<void> {
    if (this.customLoaded || !isBrowser()) {
      this.customLoaded = true;
      return Promise.resolve();
    }

    if (!this.customLoadingPromise) {
      const loadRevision = this.customRevision;
      this.customLoadingPromise = loadCustomAdversaries()
        .then((items) => {
          if (this.customRevision !== loadRevision) return;
          const source = extractCustomAdversaryItems(items);
          if (!source) {
            this.customLoaded = true;
            this.publishItems();
            return;
          }
          const ids = new Set<number>();
          this.customItems = source
            .map((item) => normalizeRawCustomAdversary(item, ids, { keepId: true }))
            .filter((item): item is Adversary => Boolean(item));
          this.customLoaded = true;
          this.publishItems();
        })
        .catch(() => {
          this.customLoaded = true;
          this.publishItems();
        });
    }
    return this.customLoadingPromise;
  }

  private persistCustom() {
    if (!isBrowser()) return;
    this.customRevision += 1;
    saveCustomAdversaries(this.customItems.map(customAdversaryToRaw));
  }

  private publishItems() {
    adversariesStore.update((state) => ({
      ...state,
      items: sortAdversaries([...this.customItems, ...this.remoteItems]),
    }));
  }

  async reload() {
    const requestId = ++this.currentRequestId;
    await this.ensureCustomLoaded();

    adversariesStore.update((state) => ({
      ...state,
      isLoading: true,
      error: null,
    }));

    try {
      const payload = await fetchAdversaryCollection();
      if (requestId !== this.currentRequestId) return;

      this.remoteItems = payload.items;
      adversariesStore.update((state) => ({
        ...state,
        items: sortAdversaries([...this.customItems, ...this.remoteItems]),
        lastFetchedAt: payload.fetchedAt,
      }));
    } catch (error) {
      if (requestId !== this.currentRequestId) return;

      adversariesStore.update((state) => ({
        ...state,
        error: error instanceof Error ? error.message : "Не удалось загрузить противников",
      }));
    } finally {
      if (requestId !== this.currentRequestId) return;

      adversariesStore.update((state) => ({
        ...state,
        isLoading: false,
      }));
    }
  }

  setSearchTerm(searchTerm: string) {
    adversariesStore.update((state) => ({
      ...state,
      searchTerm,
    }));
  }

  setTierFilter(tierFilter: number | "all") {
    adversariesStore.update((state) => ({
      ...state,
      tierFilter,
    }));
  }

  setRoleFilter(roleFilter: string) {
    adversariesStore.update((state) => ({
      ...state,
      roleFilter,
    }));
  }

  openDetails(id: number) {
    adversariesStore.update((state) => ({
      ...state,
      selectedAdversaryId: id,
    }));
  }

  closeDetails() {
    adversariesStore.update((state) => ({
      ...state,
      selectedAdversaryId: null,
    }));
  }

  getById(id: number | null) {
    if (!id) return null;
    return adversariesStore.get().items.find((item) => item.id === id) ?? null;
  }

  async exportCustomAdversaries() {
    await this.ensureCustomLoaded();
    return JSON.stringify(buildCustomAdversaryExport(this.customItems), null, 2);
  }

  async importCustomAdversaries(raw: string) {
    await this.ensureCustomLoaded();
    const source = extractCustomAdversaryItems(JSON.parse(raw));
    if (!source) {
      throw new Error("Некорректный формат файла");
    }

    const ids = new Set(this.remoteItems.map((item) => item.id));
    const imported = source
      .map((item) => normalizeRawCustomAdversary(item, ids, { keepId: true }))
      .filter((item): item is Adversary => Boolean(item));

    if (imported.length === 0) {
      throw new Error("В файле нет валидных противников");
    }

    const byId = new Map(this.customItems.map((item) => [item.id, item]));
    for (const item of imported) {
      byId.set(item.id, item);
    }
    this.customItems = Array.from(byId.values());
    this.persistCustom();
    this.publishItems();

    return imported.length;
  }

  buildBrowserView() {
    const { items, searchTerm, tierFilter, roleFilter } = adversariesStore.get();
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredItems = sortAdversaries(
      items.filter((item) => {
        const matchesSearch = normalizedSearch
          ? item.name.toLowerCase().includes(normalizedSearch) ||
            item.roleName.toLowerCase().includes(normalizedSearch) ||
            item.summary.toLowerCase().includes(normalizedSearch)
          : true;
        const matchesTier = tierFilter === "all" || item.tier === tierFilter;
        const matchesRole = roleFilter === "all" || item.roleId === roleFilter;

        return matchesSearch && matchesTier && matchesRole;
      })
    );

    const roleOptions = Array.from(
      new Map(
        items.map((item) => [item.roleId, { id: item.roleId, name: item.roleName }])
      ).values()
    ).sort((left, right) => left.name.localeCompare(right.name, "ru"));

    return {
      filteredItems,
      roleOptions,
    };
  }
}

export const adversariesService = new AdversariesService();
