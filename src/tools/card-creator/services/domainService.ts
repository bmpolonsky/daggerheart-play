import { domainStore, type DomainTheme } from "@cards/stores/domains";
import { DEFAULT_DOMAINS } from "@cards/data/domainDefaults";
import { loadCustomCardDomains, saveCustomCardDomains } from "../../../core/persistence/browserProjectContent";

const isBrowser = () => typeof window !== "undefined";

const isDataUrl = (value: string) => value.startsWith("data:");

const stripLeadingSlash = (value: string) => value.replace(/^\/+/, "");

function resolveAssetUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
    return path;
  }

  const base = import.meta.env.BASE_URL || "/";
  const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
  if (path.startsWith("/")) {
    return `${baseWithSlash}${stripLeadingSlash(path)}`;
  }
  return `${baseWithSlash}${path}`;
}

async function toDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}


function normalizeDomainId(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTheme(theme: DomainTheme): DomainTheme {
  return {
    ...theme,
    id: normalizeDomainId(theme.id),
    name: theme.name?.trim() || theme.id,
    color: theme.color?.trim() || "#6b7280",
    icon: theme.icon?.trim() || null,
  };
}

const DEFAULT_DOMAIN_IDS = new Set(
  DEFAULT_DOMAINS.map((theme) => normalizeDomainId(theme.id))
);

function isDefaultDomainId(id: string) {
  return DEFAULT_DOMAIN_IDS.has(normalizeDomainId(id));
}

function filterCustomDomains(domains: DomainTheme[]) {
  return domains
    .filter((theme) => {
      if (!theme?.id) return false;
      if (isDefaultDomainId(theme.id)) return false;
      if (theme.source === "custom") return true;
      if (theme.source === "default") return false;
      return true;
    })
    .map((theme) => normalizeTheme({ ...theme, source: "custom" }));
}

async function readStorage(): Promise<DomainTheme[] | null> {
  if (!isBrowser()) return null;
  try {
    const parsed = await loadCustomCardDomains();
    if (!Array.isArray(parsed)) return null;
    return filterCustomDomains(parsed.filter((item) => item && typeof item === "object") as DomainTheme[]);
  } catch {
    return null;
  }
}

function writeStorage(domains: DomainTheme[]) {
  if (!isBrowser()) return;
  const custom = filterCustomDomains(domains);
  saveCustomCardDomains(custom);
}

export class DomainService {
  private bootstrapped = false;
  private loadRevision = 0;

  ensureLoaded() {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    const defaults = DEFAULT_DOMAINS.map((theme) =>
      normalizeTheme({ ...theme, source: "default" as const })
    );
    domainStore.update((state) => ({
      ...state,
      domains: defaults,
      isReady: true,
    }));

    void this.loadCustomDomains(defaults);
  }

  private async loadCustomDomains(defaults: DomainTheme[]) {
    const revision = this.loadRevision;
    const stored = await readStorage();
    if (revision !== this.loadRevision) return;
    const domains = stored ? [...defaults, ...stored] : defaults;

    domainStore.update((state) => ({
      ...state,
      domains,
      isReady: true,
    }));
    void this.hydrateIcons(domains);
  }

  getTheme(id: string | null | undefined) {
    if (!id) return null;
    const normalized = normalizeDomainId(id);
    const { domains } = domainStore.getState();
    const direct = domains.find((theme) => theme.id === normalized);
    if (direct) return direct;
    const trimmed = normalized.replace(/^playtest-/, "");
    return domains.find((theme) => theme.id === trimmed) ?? null;
  }

  updateDomain(id: string, patch: Partial<DomainTheme>) {
    this.loadRevision += 1;
    domainStore.update((state) => {
      const target = state.domains.find((theme) => theme.id === id);
      if (!target || target.source !== "custom") return state;
      const nextDomains = state.domains.map((theme) =>
        theme.id === id ? normalizeTheme({ ...theme, ...patch }) : theme
      );
      writeStorage(nextDomains);
      return { ...state, domains: nextDomains };
    });
  }

  addDomain(theme: Omit<DomainTheme, "source">) {
    this.loadRevision += 1;
    const normalized = normalizeTheme({ ...theme, source: "custom" });
    domainStore.update((state) => {
      if (isDefaultDomainId(normalized.id)) {
        return state;
      }
      if (state.domains.some((item) => item.id === normalized.id)) {
        return state;
      }
      const nextDomains = [...state.domains, normalized];
      writeStorage(nextDomains);
      return { ...state, domains: nextDomains };
    });
  }

  removeDomain(id: string) {
    this.loadRevision += 1;
    domainStore.update((state) => {
      const target = state.domains.find((item) => item.id === id);
      if (!target || target.source !== "custom") return state;
      const nextDomains = state.domains.filter((item) => item.id !== id);
      writeStorage(nextDomains);
      return { ...state, domains: nextDomains };
    });
  }

  resetToDefaults() {
    this.loadRevision += 1;
    const defaults = DEFAULT_DOMAINS.map((theme) =>
      normalizeTheme({ ...theme, source: "default" as const })
    );
    domainStore.update((state) => ({ ...state, domains: defaults, isReady: true }));
    writeStorage(defaults);
    void this.hydrateIcons(defaults);
  }

  exportDomains() {
    const { domains } = domainStore.getState();
    return JSON.stringify(filterCustomDomains(domains), null, 2);
  }

  importDomains(raw: string) {
    this.loadRevision += 1;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Некорректный формат файла");
    }
    const defaults = DEFAULT_DOMAINS.map((theme) =>
      normalizeTheme({ ...theme, source: "default" as const })
    );
    const imported = parsed
      .filter((item) => item && typeof item.id === "string")
      .map((item) =>
        normalizeTheme({
          id: item.id,
          name: item.name ?? item.id,
          color: item.color ?? "#6b7280",
          icon: item.icon ?? null,
          source: item.source === "custom" ? "custom" : "default",
        })
      );
    const custom = filterCustomDomains(imported);
    const nextDomains = [...defaults, ...custom];

    domainStore.update((state) => ({
      ...state,
      domains: nextDomains,
      isReady: true,
    }));

    writeStorage(nextDomains);
    void this.hydrateIcons(nextDomains);
  }

  async hydrateIcons(domains: DomainTheme[]) {
    if (!isBrowser()) return;

    const updates: DomainTheme[] = [];

    for (const theme of domains) {
      if (!theme.icon || isDataUrl(theme.icon)) {
        updates.push(theme);
        continue;
      }

      try {
        const url = resolveAssetUrl(theme.icon);
        const dataUrl = await toDataUrl(url);
        updates.push({ ...theme, icon: dataUrl });
      } catch {
        updates.push(theme);
      }
    }

    domainStore.update((state) => ({
      ...state,
      domains: updates,
    }));
    writeStorage(updates);
  }

}

export const domainService = new DomainService();
