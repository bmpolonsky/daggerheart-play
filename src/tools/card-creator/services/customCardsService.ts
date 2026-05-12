import type { TemplateCard, TemplateFeature } from "@cards/lib/api";
import type { CardFields, CardTypeId } from "@cards/lib/cardTypes";
import { customCardsStore } from "@cards/stores/customCards";
import {
  loadCustomCardCollection,
  saveCustomCardCollections,
  subscribeCustomContentChanges,
  type CustomCardCollectionKey,
} from "../../../core/persistence/browserProjectContent";
import type { RawContentItem } from "../../../domain/content/types";

export type CustomCardRecord = {
  id: string;
  typeId: CardTypeId;
  raw: RawContentItem;
  updatedAt: number;
};

const isBrowser = () => typeof window !== "undefined";

const COLLECTION_BY_TYPE: Record<CardTypeId, CustomCardCollectionKey> = {
  ancestry: "ancestries",
  community: "communities",
  subclass: "subclasses",
  "domain-card": "domainCards",
};

const TYPE_BY_COLLECTION: Record<CustomCardCollectionKey, CardTypeId> = {
  ancestries: "ancestry",
  communities: "community",
  subclasses: "subclass",
  domainCards: "domain-card",
};

class CustomCardsService {
  private cache = new Map<string, CustomCardRecord>();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private revision = 0;
  private unsubscribeExternalChanges: (() => void) | null = null;

  private ensureLoaded() {
    if (this.loaded || !isBrowser()) {
      this.loaded = true;
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadFromStorage(this.revision);
    }
    this.subscribeExternalChanges();
  }

  private subscribeExternalChanges() {
    if (this.unsubscribeExternalChanges || !isBrowser()) return;
    this.unsubscribeExternalChanges = subscribeCustomContentChanges("customCards", () => {
      void this.reload();
    });
  }

  private async loadFromStorage(loadRevision: number) {
    try {
      const entries = await Promise.all(
        (Object.keys(TYPE_BY_COLLECTION) as CustomCardCollectionKey[]).map(async (collection) => ({
          collection,
          items: await loadCustomCardCollection(collection),
        }))
      );
      if (this.revision !== loadRevision) return;
      this.cache = new Map();
      for (const { collection, items } of entries) {
        const typeId = TYPE_BY_COLLECTION[collection];
        for (const item of items) {
          const raw = normalizeRawCard(item);
          if (!raw) continue;
          const id = rawCustomCardId(raw);
          this.cache.set(id, {
            id,
            typeId,
            raw,
            updatedAt: rawUpdatedAt(raw),
          });
        }
      }
      this.loaded = true;
      this.notify();
    } catch {
      this.loaded = true;
    }
  }

  private persist() {
    if (!isBrowser()) return;
    this.revision += 1;
    const grouped: Record<CustomCardCollectionKey, RawContentItem[]> = {
      ancestries: [],
      communities: [],
      subclasses: [],
      domainCards: [],
    };
    for (const record of this.cache.values()) {
      grouped[COLLECTION_BY_TYPE[record.typeId]].push(record.raw);
    }
    saveCustomCardCollections(grouped);
  }

  private notify() {
    const items = Array.from(this.cache.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    const lastUpdatedAt = items.length > 0 ? items[0].updatedAt : null;
    customCardsStore.update(() => ({ items, lastUpdatedAt }));
  }

  createId(typeId?: CardTypeId) {
    const base = `custom${typeId ? `-${typeId}` : ""}`;
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${Date.now().toString(36)}${suffix}`;
  }

  get(id: string) {
    this.ensureLoaded();
    return this.cache.get(id) ?? null;
  }

  list() {
    this.ensureLoaded();
    return Array.from(this.cache.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async reload() {
    const loadRevision = this.revision;
    await this.loadFromStorage(loadRevision);
    this.loadingPromise = null;
    return this.list();
  }

  upsert(record: CustomCardRecord) {
    this.ensureLoaded();
    this.cache.set(record.id, record);
    this.persist();
    this.notify();
  }

  remove(id: string) {
    this.ensureLoaded();
    if (!this.cache.has(id)) return;
    this.cache.delete(id);
    this.persist();
    this.notify();
  }
}

export function rawCustomCardId(raw: RawContentItem): string {
  return String(raw.id ?? raw.slug ?? raw.name ?? "custom-card");
}

export function customCardRecordToTemplate(record: CustomCardRecord): TemplateCard {
  const raw = record.raw;
  const features = templateFeaturesFromRaw(record);
  return {
    id: rawCustomCardId(raw),
    slug: String(raw.slug ?? rawCustomCardId(raw)),
    name: String(raw.name ?? raw.title ?? "Без названия"),
    image: typeof raw.image_url === "string" ? raw.image_url : null,
    description: text(raw.short_description ?? raw.description ?? raw.main_body),
    sourceName: text(raw.source_name ?? raw.source),
    category: record.typeId,
    features,
    artAttribution: text(raw.art_attribution) || null,
    classSlug: text(raw.class_slug) || null,
    className: text(raw.class_name) || null,
    spellcastTrait: text(raw.spellcast_trait) || null,
    domainSlug: text(raw.domain_slug) || null,
    domainSlugs: Array.isArray(raw.domain_slugs) ? raw.domain_slugs.filter((item): item is string => typeof item === "string") : null,
    domainName: text(raw.domain_name) || null,
    cardType: text(raw.card_type ?? raw.cardType) || null,
    stressCost: numberOrNull(raw.stress_cost),
    level: numberOrNull(raw.level),
  };
}

export function customCardRecordToFields(record: CustomCardRecord): CardFieldsPatch {
  const raw = record.raw;
  return {
    slug: String(raw.slug ?? ""),
    dataSource: text(raw.source_name ?? raw.source),
    dataClass: text(raw.class_slug),
    dataDomain: text(raw.domain_slug),
    title: String(raw.name ?? raw.title ?? ""),
    prelude: text(raw.short_description),
    description: firstFeatureText(record) || text(raw.description ?? raw.main_body),
    attribution: text(raw.art_attribution),
    source: text(raw.source_name ?? raw.source),
    label: text(raw.card_type ?? raw.type_name),
    subclassTier: "Основа",
    spellcast: text(raw.spellcast_trait),
    bannerText: raw.level == null ? "" : String(raw.level),
    stressText: raw.stress_cost == null ? "" : String(raw.stress_cost),
    domainPrimary: text(raw.domain_slug) || firstArrayText(raw.domain_slugs),
    domainSecondary: secondArrayText(raw.domain_slugs),
    buttonHref: `/${record.typeId}/${String(raw.slug ?? "")}`,
  };
}

type CardFieldsPatch = Partial<CardFields>;

function templateFeaturesFromRaw(record: CustomCardRecord): TemplateFeature[] {
  const raw = record.raw;
  if (record.typeId === "subclass") {
    return [
      ...featureList(raw.foundation_features, "Основа"),
      ...featureList(raw.specialization_features, "Специализация"),
      ...featureList(raw.mastery_features, "Мастерство"),
    ];
  }
  return featureList(raw.features, "");
}

function featureList(value: unknown, group: string): TemplateFeature[] {
  if (!Array.isArray(value)) return [];
  const features: TemplateFeature[] = [];
  for (const [index, feature] of value.entries()) {
      if (!feature || typeof feature !== "object") continue;
      const item = feature as Record<string, unknown>;
      const name = text(item.name) || "Без названия";
      const body = text(item.main_body ?? item.text);
      features.push({
        id: String(item.id ?? index),
        name,
        text: body,
        group,
      });
  }
  return features;
}

function firstFeatureText(record: CustomCardRecord): string {
  return customCardRecordToTemplate(record).features[0]?.text ?? "";
}

function normalizeRawCard(value: unknown): RawContentItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawContentItem;
  if (typeof raw.name !== "string" || !raw.name.trim()) return null;
  return raw;
}

function rawUpdatedAt(raw: RawContentItem): number {
  const value = raw.updated_at ?? raw.updatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstArrayText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return text(value[0]);
}

function secondArrayText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return text(value[1]);
}

export const customCardsService = new CustomCardsService();
