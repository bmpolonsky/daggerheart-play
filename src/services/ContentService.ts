import { nowIso } from '../core/utils/date';
import { reloadBrowserCustomContent, subscribeCustomContentChanges } from '../core/persistence/browserProjectContent';
import { contentStore } from '../stores/contentStore';
import { readRawCustomCardCollections } from '../domain/content/customCardLibrary';
import { encounterStore } from '../stores/gameStores';
import { mapGenericItem, mapRawAdversary, createAdversaryFromLibrary, createEnvironmentFromLibrary, mapRawBeastformItem, mapRawClassItem, mapRawEnvironmentItem, mapRawEquipmentItem, mapRawRuleItem } from '../domain/content/mappers';
import {
  buildApiCollectionUrl,
  CONTENT_COLLECTIONS,
  createContentManifest,
  normalizeContentLanguage,
  normalizeContentSourceUrl,
  summarizeContentSources,
  type ContentCollectionConfig,
  type LoadedContentPayload
} from '../domain/content/source';
import type {
  ApiPayload,
  ContentCollectionKey,
  ContentManifest,
  ContentSourceFilter,
  ContentState,
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEquipmentItem,
  LibraryEnvironment,
  LibraryRuleEntry,
  RawAdversary,
  RawBeastformItem,
  RawClassItem,
  RawContentItem,
  RawEnvironmentItem,
  RawEquipmentItem,
  RawRuleItem
} from '../domain/content/types';

type GenericCollectionKey = Exclude<ContentCollectionKey, 'adversaries' | 'classes' | 'rules' | 'environments' | 'beastforms' | 'equipment'>;

const GENERIC_KEYS: GenericCollectionKey[] = ['ancestries', 'communities', 'subclasses', 'domainCards'];

export interface ContentLibraryView {
  selectedCollection: ContentCollectionKey;
  title: string;
  searchTerm: string;
  sourceFilter: ContentSourceFilter;
  tierFilter: number | 'all';
  levelFilter: number | 'all';
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
  manifest: ContentManifest | null;
  sourceMode: 'api' | 'cache' | 'mixed' | 'empty';
  sourceWarnings: string[];
  adversaries: LibraryAdversary[];
  classes: LibraryClassItem[];
  rules: LibraryRuleEntry[];
  environments: LibraryEnvironment[];
  beastforms: LibraryBeastform[];
  equipment: LibraryEquipmentItem[];
  genericItems: GenericLibraryItem[];
  collectionCounts: Record<ContentCollectionKey, number>;
  tierOptions: number[];
  levelOptions: number[];
}

export class ContentService {
  readonly content$ = contentStore.toStream();
  private bootstrapped = false;
  private currentRequestId = 0;
  private contentSource = normalizeContentSourceUrl(import.meta.env?.VITE_CONTENT_SOURCE);
  private contentLanguage = normalizeContentLanguage(import.meta.env?.VITE_CONTENT_LANG);
  private fetchTimeoutMs = Number(import.meta.env?.VITE_CONTENT_TIMEOUT_MS ?? 4500);
  private unsubscribeCustomContentChanges: (() => void) | null = null;

  ensureLoaded(): void {
    if (!this.unsubscribeCustomContentChanges && typeof window !== 'undefined') {
      this.unsubscribeCustomContentChanges = subscribeCustomContentChanges('all', () => {
        void this.reload();
      });
    }
    if (!this.bootstrapped) {
      this.bootstrapped = true;
      void this.reload();
    }
  }

  async reload(preferLiveApi = false): Promise<void> {
    const requestId = ++this.currentRequestId;
    contentStore.update((state) => ({ ...state, isLoading: true, error: null }));

    try {
      const [loadedCollections, customContent] = await Promise.all([
        Promise.all(CONTENT_COLLECTIONS.map(async (config) => ({ config, loaded: await this.readCollection(config, preferLiveApi) }))),
        reloadBrowserCustomContent()
      ]);
      const payloadFor = <T>(key: ContentCollectionKey): ApiPayload<T> =>
        (loadedCollections.find((entry) => entry.config.key === key)?.loaded.payload ?? { data: [] }) as ApiPayload<T>;

      const adversaryPayload = payloadFor<RawAdversary>('adversaries');
      const classesPayload = payloadFor<RawClassItem>('classes');
      const rulesPayload = payloadFor<RawRuleItem>('rules');
      const environmentsPayload = payloadFor<RawEnvironmentItem>('environments');
      const beastformsPayload = payloadFor<RawBeastformItem>('beastforms');
      const ancestriesPayload = payloadFor<RawContentItem>('ancestries');
      const communitiesPayload = payloadFor<RawContentItem>('communities');
      const subclassesPayload = payloadFor<RawContentItem>('subclasses');
      const domainCardsPayload = payloadFor<RawContentItem>('domainCards');
      const equipmentPayload = payloadFor<RawEquipmentItem>('equipment');
      const manifest = createContentManifest(this.contentSource, this.contentLanguage, loadedCollections);
      const sourceSummary = summarizeContentSources(loadedCollections.map((entry) => entry.loaded as LoadedContentPayload<unknown>));

      if (requestId !== this.currentRequestId) return;

      const customAdversaries = customContent.adversaries
        .filter(isRawAdversary)
        .map(markCustomRawAdversary)
        .map((item) => mapRawAdversary(item));
      const customEnvironments = (customContent.environments ?? [])
        .filter(isRawEnvironment)
        .map(markCustomRawEnvironment)
        .map((item) => mapRawEnvironmentItem(item));
      const customCards = readRawCustomCardCollections(customContent);
      const adversaries = [...customAdversaries, ...(adversaryPayload.data ?? []).map(mapRawAdversary)].sort(sortAdversaries);
      const classes = (classesPayload.data ?? []).map(mapRawClassItem).sort(sortClasses);
      // Hidden rules are still valid reference articles for contextual help.
      // The library view filters them from ordinary browsing below.
      const rules = (rulesPayload.data ?? []).map(mapRawRuleItem).sort(sortRules);
      const environments = [...customEnvironments, ...(environmentsPayload.data ?? []).map(mapRawEnvironmentItem)].sort(sortEnvironments);
      const beastforms = (beastformsPayload.data ?? []).map(mapRawBeastformItem).sort(sortBeastforms);
      const generic = {
        ancestries: [...(ancestriesPayload.data ?? []), ...customCards.ancestries.map(markCustomRawContent)].map((item) => mapGenericItem(item, 'ancestry')).sort(sortGenericItems),
        communities: [...(communitiesPayload.data ?? []), ...customCards.communities.map(markCustomRawContent)].map((item) => mapGenericItem(item, 'community')).sort(sortGenericItems),
        subclasses: [...(subclassesPayload.data ?? []), ...customCards.subclasses.map(markCustomRawContent)].map((item) => mapGenericItem(item, 'subclass')).sort(sortGenericItems),
        domainCards: [...(domainCardsPayload.data ?? []), ...customCards.domainCards.map(markCustomRawContent)].map((item) => mapGenericItem(item, 'domain-card')).sort(sortGenericItems)
      };
      const equipment = (equipmentPayload.data ?? []).map(mapRawEquipmentItem).sort(sortEquipment);

      contentStore.update((state) => ({
        ...state,
        manifest,
        adversaries,
        classes,
        rules,
        environments,
        beastforms,
        equipment,
        generic,
        lastLoadedAt: nowIso(),
        sourceMode: sourceSummary.mode,
        sourceWarnings: sourceSummary.warnings,
        error: null
      }));
    } catch (error) {
      if (requestId !== this.currentRequestId) return;
      contentStore.update((state) => ({
        ...state,
        error: error instanceof Error ? error.message : 'Не удалось загрузить справочники'
      }));
    } finally {
      if (requestId !== this.currentRequestId) return;
      contentStore.update((state) => ({ ...state, isLoading: false }));
    }
  }

  setSelectedCollection(selectedCollection: ContentCollectionKey): void {
    contentStore.update((state) => ({ ...state, selectedCollection, searchTerm: '', sourceFilter: 'all', tierFilter: 'all', levelFilter: 'all' }));
  }

  setSearchTerm(searchTerm: string): void {
    contentStore.update((state) => ({ ...state, searchTerm }));
  }

  setTierFilter(tierFilter: number | 'all'): void {
    contentStore.update((state) => ({ ...state, tierFilter }));
  }

  setLevelFilter(levelFilter: number | 'all'): void {
    contentStore.update((state) => ({ ...state, levelFilter }));
  }

  setSourceFilter(sourceFilter: ContentSourceFilter): void {
    contentStore.update((state) => ({ ...state, sourceFilter, tierFilter: 'all', levelFilter: 'all' }));
  }

  addAdversaryToEncounter(libraryAdversaryId: string): boolean {
    const item = contentStore.get().adversaries.find((adversary) => adversary.id === libraryAdversaryId);
    if (!item) return false;

    const adversary = createAdversaryFromLibrary(item);
    encounterStore.update((state) => ({
      ...state,
      adversaries: { ...state.adversaries, [adversary.id]: adversary },
      order: [...state.order, adversary.id],
      activeAdversaryId: adversary.id,
      updatedAt: nowIso()
    }));
    return true;
  }

  addEnvironmentToEncounter(libraryEnvironmentId: string): boolean {
    const item = contentStore.get().environments.find((environment) => environment.id === libraryEnvironmentId);
    if (!item) return false;

    const environment = createEnvironmentFromLibrary(item);
    encounterStore.update((state) => ({
      ...state,
      environments: { ...state.environments, [environment.id]: environment },
      updatedAt: nowIso()
    }));
    return true;
  }

  buildLibraryView(state: ContentState): ContentLibraryView {
    const normalizedSearch = normalizeSearch(state.searchTerm);
    const visibleRules = state.rules.filter((item) => !item.hidden);
    const collectionCounts: Record<ContentCollectionKey, number> = {
      adversaries: state.adversaries.length,
      classes: state.classes.length,
      rules: visibleRules.length,
      environments: state.environments.length,
      beastforms: state.beastforms.length,
      ancestries: state.generic.ancestries.length,
      communities: state.generic.communities.length,
      subclasses: state.generic.subclasses.length,
      domainCards: state.generic.domainCards.length,
      equipment: state.equipment.length
    };
    const selectedGeneric = GENERIC_KEYS.includes(state.selectedCollection as GenericCollectionKey)
      ? state.generic[state.selectedCollection as GenericCollectionKey]
      : [];
    const selectedTierItems = tierItemsForCollection(state);
    const selectedLevelItems = levelItemsForCollection(state, selectedGeneric);
    const tierOptions = Array.from(new Set(selectedTierItems
      .filter((item) => sourceMatches(item.raw, state.sourceFilter))
      .map((item) => item.tier)
      .filter(isNumber))).sort((left, right) => left - right);
    const levelOptions = Array.from(new Set(selectedLevelItems
      .filter((item) => sourceMatches(item.raw, state.sourceFilter))
      .map((item) => item.level)
      .filter(isNumber))).sort((left, right) => left - right);

    const adversaries = state.adversaries.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.roleName, item.summary, item.motives, item.experiencesText, rawFeaturesText(item.raw.features)].join(' ')).includes(normalizedSearch)
        : true;
      const matchesTier = state.tierFilter === 'all' || item.tier === state.tierFilter;
      return matchesSearch && matchesTier && sourceMatches(item.raw, state.sourceFilter);
    });

    const classes = state.classes.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.domains.join(' '), item.body, item.classItems.join(' '), rawFeaturesText(item.raw.features)].join(' ')).includes(normalizedSearch)
        : true;
      return matchesSearch && sourceMatches(item.raw, state.sourceFilter);
    });
    const rules = visibleRules.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.frameName, item.summary, item.body].join(' ')).includes(normalizedSearch)
        : true;
      return matchesSearch && sourceMatches(item.raw, state.sourceFilter);
    });
    const environments = state.environments.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.typeName, item.summary, item.body, item.featureText, item.impulses].join(' ')).includes(normalizedSearch)
        : true;
      const matchesTier = state.tierFilter === 'all' || item.tier === state.tierFilter;
      return matchesSearch && matchesTier && sourceMatches(item.raw, state.sourceFilter);
    });
    const beastforms = state.beastforms.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.summary, item.examples, item.advantages, item.featureText].join(' ')).includes(normalizedSearch)
        : true;
      const matchesTier = state.tierFilter === 'all' || item.tier === state.tierFilter;
      const matchesLevel = state.levelFilter === 'all' || item.level === state.levelFilter;
      return matchesSearch && matchesTier && matchesLevel && sourceMatches(item.raw, state.sourceFilter);
    });
    const equipment = state.equipment.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.typeName, item.featureText, item.damageFormula, item.range].join(' ')).includes(normalizedSearch)
        : true;
      const matchesTier = state.tierFilter === 'all' || item.tier === state.tierFilter;
      return matchesSearch && matchesTier && sourceMatches(item.raw, state.sourceFilter);
    });

    const genericItems = selectedGeneric.filter((item) => {
      const matchesSearch = normalizedSearch
        ? normalizeSearch([item.name, item.subtitle, item.body, rawFeaturesText([
          ...(item.raw.features ?? []),
          ...(item.raw.foundation_features ?? []),
          ...(item.raw.specialization_features ?? []),
          ...(item.raw.mastery_features ?? [])
        ])].join(' ')).includes(normalizedSearch)
        : true;
      const matchesLevel = state.levelFilter === 'all' || item.level === state.levelFilter;
      return matchesSearch && matchesLevel && sourceMatches(item.raw, state.sourceFilter);
    });

    return {
      selectedCollection: state.selectedCollection,
      title: collectionTitle(state.selectedCollection),
      searchTerm: state.searchTerm,
      sourceFilter: state.sourceFilter,
      tierFilter: state.tierFilter,
      levelFilter: state.levelFilter,
      isLoading: state.isLoading,
      error: state.error,
      lastLoadedAt: state.lastLoadedAt,
      manifest: state.manifest,
      sourceMode: state.sourceMode,
      sourceWarnings: state.sourceWarnings,
      adversaries,
      classes,
      rules,
      environments,
      beastforms,
      equipment,
      genericItems,
      collectionCounts,
      tierOptions,
      levelOptions
    };
  }

  private async readCollection<T>(config: ContentCollectionConfig, preferLiveApi: boolean): Promise<LoadedContentPayload<T>> {
    const apiUrl = buildApiCollectionUrl(this.contentSource, config.endpoint, this.contentLanguage);
    const localUrl = this.publicDataUrl(config.file);
    if (!preferLiveApi) {
      return {
        payload: await this.fetchPayload<T>(localUrl),
        source: 'cache',
        sourceUrl: localUrl
      };
    }

    try {
      return {
        payload: await this.fetchPayload<T>(apiUrl),
        source: 'api',
        sourceUrl: apiUrl
      };
    } catch (apiError) {
      try {
        return {
          payload: await this.fetchPayload<T>(localUrl),
          source: 'cache',
          sourceUrl: localUrl,
          error: `${config.key}: live /api недоступен, использован локальный cache (${formatError(apiError)})`
        };
      } catch (cacheError) {
        throw new Error(`${config.key}: не удалось загрузить ни /api, ни public/data (${formatError(apiError)}; ${formatError(cacheError)})`);
      }
    }
  }

  private async fetchPayload<T>(url: string): Promise<ApiPayload<T>> {
    const timeoutMs = Number.isFinite(this.fetchTimeoutMs) && this.fetchTimeoutMs > 0 ? this.fetchTimeoutMs : 4500;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`статус ${response.status}`);
      }

      const payload = (await response.json()) as ApiPayload<T>;
      if (payload.result && payload.result !== 'ok') {
        throw new Error('источник вернул ошибку');
      }

      return {
        ...payload,
        data: Array.isArray(payload.data) ? payload.data : []
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private publicDataUrl(file: string): string {
    const baseUrl = import.meta.env?.BASE_URL ?? './';
    return `${baseUrl}data/${file}`;
  }
}

function rawFeaturesText(features: Array<{ name?: unknown; main_body?: unknown; text?: unknown }> | undefined): string {
  if (!Array.isArray(features)) return '';
  return features.map((feature) => [feature.name, feature.main_body ?? feature.text].filter((value) => typeof value === 'string').join(' ')).join(' ');
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'timeout';
  return error instanceof Error ? error.message : String(error);
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function markCustomRawContent(item: RawContentItem): RawContentItem {
  const sourceSlugs = Array.isArray(item.source_slugs) ? item.source_slugs : [];
  return sourceSlugs.includes('custom') ? item : { ...item, source_slugs: [...sourceSlugs, 'custom'] };
}

function markCustomRawAdversary(item: RawAdversary): RawAdversary {
  const sourceSlugs = Array.isArray(item.source_slugs) ? item.source_slugs : [];
  return sourceSlugs.includes('custom') ? item : { ...item, source_slugs: [...sourceSlugs, 'custom'] };
}

function markCustomRawEnvironment(item: RawEnvironmentItem): RawEnvironmentItem {
  const sourceSlugs = Array.isArray(item.source_slugs) ? item.source_slugs : [];
  return sourceSlugs.includes('custom') ? item : { ...item, source_slugs: [...sourceSlugs, 'custom'] };
}

function sourceMatches(raw: { source_slugs?: unknown }, filter: ContentSourceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'homebrew') return isCustomSource(raw.source_slugs);
  if (filter === 'core') return isCorebookSource(raw.source_slugs);
  return isVoidSource(raw.source_slugs);
}

function isCustomSource(sourceSlugs: unknown): boolean {
  return Array.isArray(sourceSlugs) && sourceSlugs.includes('custom');
}

function isCorebookSource(sourceSlugs: unknown): boolean {
  return Array.isArray(sourceSlugs) && sourceSlugs.some((source) => source === 'core' || source === 'srd');
}

function isVoidSource(sourceSlugs: unknown): boolean {
  return Array.isArray(sourceSlugs) && sourceSlugs.includes('playtest-the-void');
}

function tierItemsForCollection(state: ContentState): Array<{ tier: number | null; raw: { source_slugs?: unknown } }> {
  switch (state.selectedCollection) {
    case 'adversaries':
      return state.adversaries;
    case 'environments':
      return state.environments;
    case 'beastforms':
      return state.beastforms;
    case 'equipment':
      return state.equipment;
    default:
      return [];
  }
}

function levelItemsForCollection(state: ContentState, selectedGeneric: GenericLibraryItem[]): Array<{ level?: number | null; raw: { source_slugs?: unknown } }> {
  switch (state.selectedCollection) {
    case 'beastforms':
      return state.beastforms;
    case 'ancestries':
    case 'communities':
    case 'subclasses':
    case 'domainCards':
      return selectedGeneric;
    default:
      return [];
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sortAdversaries(left: LibraryAdversary, right: LibraryAdversary): number {
  if (left.tier !== right.tier) return left.tier - right.tier;
  return left.name.localeCompare(right.name, 'ru');
}

function isRawAdversary(value: unknown): value is RawAdversary {
  if (!value || typeof value !== 'object') return false;
  const adversary = value as Record<string, unknown>;
  return typeof adversary.name === 'string' && adversary.name.trim().length > 0;
}

function isRawEnvironment(value: unknown): value is RawEnvironmentItem {
  if (!value || typeof value !== 'object') return false;
  const environment = value as Record<string, unknown>;
  return typeof environment.name === 'string' && environment.name.trim().length > 0;
}

function sortGenericItems(left: GenericLibraryItem, right: GenericLibraryItem): number {
  if ((left.level ?? 0) !== (right.level ?? 0)) return (left.level ?? 0) - (right.level ?? 0);
  return left.name.localeCompare(right.name, 'ru');
}

function sortClasses(left: LibraryClassItem, right: LibraryClassItem): number {
  const leftCore = isCoreSource(left.raw.source_slugs) ? 0 : 1;
  const rightCore = isCoreSource(right.raw.source_slugs) ? 0 : 1;
  if (leftCore !== rightCore) return leftCore - rightCore;
  return left.name.localeCompare(right.name, 'ru');
}

function sortRules(left: LibraryRuleEntry, right: LibraryRuleEntry): number {
  if ((left.frameName ?? '') !== (right.frameName ?? '')) return (left.frameName ?? '').localeCompare(right.frameName ?? '', 'ru');
  return left.name.localeCompare(right.name, 'ru');
}

function sortEnvironments(left: LibraryEnvironment, right: LibraryEnvironment): number {
  if (left.tier !== right.tier) return left.tier - right.tier;
  if (left.typeName !== right.typeName) return left.typeName.localeCompare(right.typeName, 'ru');
  return left.name.localeCompare(right.name, 'ru');
}

function sortBeastforms(left: LibraryBeastform, right: LibraryBeastform): number {
  if (left.tier !== right.tier) return left.tier - right.tier;
  return left.name.localeCompare(right.name, 'ru');
}

function sortEquipment(left: LibraryEquipmentItem, right: LibraryEquipmentItem): number {
  if (left.type !== right.type) return left.type.localeCompare(right.type, 'ru');
  if ((left.tier ?? 0) !== (right.tier ?? 0)) return (left.tier ?? 0) - (right.tier ?? 0);
  return left.name.localeCompare(right.name, 'ru');
}

function isCoreSource(sourceSlugs: unknown): boolean {
  return Array.isArray(sourceSlugs) && sourceSlugs.some((source) => source === 'core' || source === 'srd');
}

function collectionTitle(collection: ContentCollectionKey): string {
  switch (collection) {
    case 'adversaries':
      return 'Противники';
    case 'classes':
      return 'Классы';
    case 'rules':
      return 'Правила';
    case 'environments':
      return 'Окружения';
    case 'beastforms':
      return 'Звериные облики';
    case 'ancestries':
      return 'Родословные';
    case 'communities':
      return 'Сообщества';
    case 'subclasses':
      return 'Подклассы';
    case 'domainCards':
      return 'Карты доменов';
    case 'equipment':
      return 'Снаряжение';
  }
}
