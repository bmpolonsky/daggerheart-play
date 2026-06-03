import type { TemplateCard } from "@cards/lib/api";
import {
  CARD_TYPE_CONFIG,
  DEFAULT_CARD_TYPE_ID,
  type CardFields,
  type CardTypeId,
  createEmptyCardFields,
} from "@cards/lib/cardTypes";
import { buildCardFieldsFromTemplate } from "@cards/lib/cardBuilder";
import { stripMarkdownLinks } from "@cards/lib/templateUtils";
import { editorStore } from "@cards/stores/editor";
import { exportStore } from "@cards/stores/export";
import { prefetchImages } from "@cards/lib/assetPrefetcher";
import { buildClassBanner, buildClassDivider, buildDomainBanner, buildDomainDivider } from "@cards/lib/domainAssets";
import { domainService } from "@cards/services/domainService";
import { domainStore } from "@cards/stores/domains";
import { templatesStore } from "@cards/stores/templates";
import {
  customCardRecordToFields,
  customCardRecordToTemplate,
  customCardsService,
  rawCustomCardId,
  type CustomCardRecord,
} from "@cards/services/customCardsService";
import { AssetService } from "../../../services/AssetService";
import type { RawAdversaryFeature, RawContentItem } from "../../../domain/content/types";

type FieldTransformer = (value: string) => string;

type HashTarget =
  | { type: "card"; value: string }
  | { type: "custom"; value: string }
  | { type: "none" };

const isBrowser = () => typeof window !== "undefined";

const parseHash = (hash: string): HashTarget => {
  const cleaned = hash.replace(/^#/, "").trim();
  if (!cleaned) return { type: "none" };
  const [kind, ...rest] = cleaned.split("/");
  const value = decodeURIComponent(rest.join("/"));
  if (kind === "card" && value && value.includes(":")) return { type: "card", value };
  if (kind === "custom" && value) return { type: "custom", value };
  return { type: "none" };
};

const buildHash = (target: HashTarget) => {
  if (target.type === "card") return `#card/${encodeURIComponent(target.value)}`;
  if (target.type === "custom") return `#custom/${encodeURIComponent(target.value)}`;
  return "";
};

export class EditorService {
  readonly store = editorStore;
  private hashBootstrapped = false;
  private pendingHash: HashTarget | null = null;
  private customImageObjectUrl: string | null = null;
  private readonly assetService = new AssetService();

  constructor() {
    domainStore.subscribe(() => {
      this.refreshDomainAssets();
    });
  }

  ensureHashSync() {
    if (this.hashBootstrapped || !isBrowser()) return;
    this.hashBootstrapped = true;
    window.addEventListener("hashchange", this.handleHashChange);
    templatesStore.subscribe(() => this.resolvePendingHash());
    this.handleHashChange();
  }

  selectCard(card: TemplateCard, options?: { skipHash?: boolean }) {
    const { cardFields, typeId, selectedFeatureIndex } = buildCardFieldsFromTemplate(card);
    const nextFields = this.applyDomainAssets(cardFields, typeId);

    this.prefetchAssets(nextFields, card.image);
    this.revokeCustomImageObjectUrl();

    editorStore.update(() => ({
      selectedCard: card,
      selectedTypeId: typeId,
      cardFields: nextFields,
      customImage: null,
      customImageSource: card.image,
      selectedFeatureIndex,
      customCardId: null,
    }));

    exportStore.update(() => ({
      isExporting: false,
      exportError: null,
    }));

    if (!options?.skipHash) {
      this.updateHash({ type: "card", value: `${typeId}:${card.slug}` });
    }
  }

  closeEditor(options?: { skipHash?: boolean }) {
    this.revokeCustomImageObjectUrl();

    editorStore.update(() => ({
      selectedCard: null,
      selectedTypeId: DEFAULT_CARD_TYPE_ID,
      cardFields: createEmptyCardFields(),
      customImage: null,
      customImageSource: null,
      selectedFeatureIndex: 0,
      customCardId: null,
    }));

    exportStore.update(() => ({
      isExporting: false,
      exportError: null,
    }));

    if (!options?.skipHash) {
      this.updateHash({ type: "none" });
    }
  }

  setCardType(nextType: CardTypeId) {
    editorStore.update((prev) => {
      const nextConfig = CARD_TYPE_CONFIG[nextType];
      const nextFields = {
        ...prev.cardFields,
        label: prev.cardFields.label || nextConfig.cardLabel,
        dividerImage: nextConfig.defaultDivider || "",
      };

      return {
        ...prev,
        selectedTypeId: nextType,
        cardFields: this.applyDomainAssets(nextFields, nextType),
      };
    });
    this.ensureCustomCardId();
    this.persistCustomCard();
  }

  setField(field: keyof CardFields, value: string, transform?: FieldTransformer) {
    this.ensureCustomCardId();
    editorStore.update((prev) => {
      const nextFields = {
        ...prev.cardFields,
        [field]: transform ? transform(value) : value,
      } as CardFields;

      return {
        ...prev,
        cardFields: this.applyDomainAssets(nextFields, prev.selectedTypeId),
      };
    });
    this.persistCustomCard();
  }

  setDomainPrimary(value: string) {
    this.setField("domainPrimary", value);
  }

  setDomainSecondary(value: string) {
    this.setField("domainSecondary", value);
  }

  refreshDomainAssets() {
    editorStore.update((prev) => ({
      ...prev,
      cardFields: this.applyDomainAssets(prev.cardFields, prev.selectedTypeId),
    }));
  }

  setSubclassFeature(index: number) {
    this.ensureCustomCardId();
    editorStore.update((prev) => {
      const feature = prev.selectedCard?.features[index];
      return {
        ...prev,
        selectedFeatureIndex: index,
        cardFields: {
          ...prev.cardFields,
          description: stripMarkdownLinks(feature?.text ?? ""),
          subclassTier: feature?.group ?? prev.cardFields.subclassTier,
        },
      };
    });
    this.persistCustomCard();
  }

  setCustomImage(displayUrl: string | null, sourceUrl = displayUrl) {
    this.ensureCustomCardId();
    this.revokeCustomImageObjectUrl(displayUrl);
    editorStore.update((prev) => ({
      ...prev,
      customImage: displayUrl,
      customImageSource: sourceUrl,
    }));
    this.persistCustomCard();
  }

  async loadImageFromFile(file: File) {
    const asset = await this.assetService.saveFile(file);
    const objectUrl = await this.assetService.getObjectUrl(asset.id);
    this.setManagedCustomImage(objectUrl, `asset:${asset.id}`);
  }

  private setManagedCustomImage(displayUrl: string | null, sourceUrl: string | null) {
    this.revokeCustomImageObjectUrl(displayUrl);
    this.customImageObjectUrl = displayUrl;
    this.setCustomImage(displayUrl, sourceUrl);
  }

  private revokeCustomImageObjectUrl(nextUrl: string | null = null) {
    if (this.customImageObjectUrl && this.customImageObjectUrl !== nextUrl) {
      URL.revokeObjectURL(this.customImageObjectUrl);
    }
    if (this.customImageObjectUrl !== nextUrl) {
      this.customImageObjectUrl = null;
    }
  }

  private prefetchAssets(cardFields: CardFields, cardImage: string | null) {
    prefetchImages([
      cardFields.dividerImage,
      cardFields.bannerImage,
      cardFields.stressImage,
      cardImage,
    ]);
  }

  private applyDomainAssets(cardFields: CardFields, typeId: CardTypeId): CardFields {
    if (typeId !== "domain-card" && typeId !== "subclass") {
      return cardFields;
    }

    const primaryId = cardFields.domainPrimary || cardFields.dataDomain;
    const secondaryId = cardFields.domainSecondary || primaryId;
    const primaryTheme = domainService.getTheme(primaryId) ?? {
      id: primaryId || "",
      name: primaryId || "",
      color: "#6b7280",
      icon: null,
      source: "custom" as const,
    };
    const secondaryTheme = domainService.getTheme(secondaryId) ?? primaryTheme;

    const bannerImage =
      typeId === "domain-card"
        ? buildDomainBanner(primaryTheme)
        : buildClassBanner(primaryTheme, secondaryTheme);
    const dividerImage =
      typeId === "domain-card"
        ? buildDomainDivider(primaryTheme)
        : buildClassDivider(primaryTheme, secondaryTheme);

    const classSet = new Set(cardFields.customClasses.split(" ").filter(Boolean));
    if (typeId === "domain-card") {
      if (primaryTheme.id) classSet.add(primaryTheme.id);
      if (secondaryTheme.id) classSet.add(secondaryTheme.id);
    }

    return {
      ...cardFields,
      bannerImage,
      dividerImage,
      dataDomain: typeId === "domain-card" ? primaryTheme.id : cardFields.dataDomain,
      customClasses: Array.from(classSet).join(" "),
    };
  }

  private handleHashChange = () => {
    const target = parseHash(window.location.hash);
    if (target.type === "none") {
      this.closeEditor({ skipHash: true });
      return;
    }

    if (!this.tryApplyHashTarget(target)) {
      this.pendingHash = target;
    }
  };

  private resolvePendingHash() {
    if (!this.pendingHash) return;
    if (this.tryApplyHashTarget(this.pendingHash)) {
      this.pendingHash = null;
    }
  }

  private tryApplyHashTarget(target: HashTarget) {
    if (target.type === "card") {
      const hasTemplates = templatesStore.getState().templateGroups.length > 0;
      if (!hasTemplates) return false;
      const card = this.findCardBySlug(target.value);
      if (!card) {
        this.closeEditor({ skipHash: true });
        this.updateHash({ type: "none" });
        return true;
      }
      this.selectCard(card, { skipHash: true });
      return true;
    }

    if (target.type === "custom") {
      const record = customCardsService.get(target.value);
      if (!record) {
        this.closeEditor({ skipHash: true });
        this.updateHash({ type: "none" });
        return true;
      }
      this.restoreCustomCard(record, { skipHash: true });
      return true;
    }

    return true;
  }

  private findCardBySlug(value: string) {
    const [prefix, ...rest] = value.split(":");
    if (!rest.length) return null;
    const slug = rest.join(":");
    const { templateGroups } = templatesStore.getState();
    const group = templateGroups.find((item) => item.id === prefix);
    if (!group) return null;
    return group.items.find((item) => item.slug === slug || item.id === slug) ?? null;
  }

  private restoreCustomCard(record: CustomCardRecord, options?: { skipHash?: boolean }) {
    const syntheticCard = customCardRecordToTemplate(record);
    const hydratedFields = {
      ...createEmptyCardFields(),
      ...customCardRecordToFields(record),
    };
    const nextFields = this.applyDomainAssets(hydratedFields, record.typeId);
    this.prefetchAssets(nextFields, syntheticCard.image ?? null);
    this.revokeCustomImageObjectUrl();
    editorStore.update(() => ({
      selectedCard: syntheticCard,
      selectedTypeId: record.typeId,
      cardFields: nextFields,
      customImage: syntheticCard.image,
      customImageSource: syntheticCard.image,
      selectedFeatureIndex: 0,
      customCardId: record.id,
    }));
    void this.resolveCustomImageDisplay(record.raw.image_url);

    exportStore.update(() => ({
      isExporting: false,
      exportError: null,
    }));

    if (!options?.skipHash) {
      this.updateHash({ type: "custom", value: record.id });
    }
  }

  private ensureCustomCardId() {
    const state = editorStore.getState();
    if (state.customCardId || !state.selectedCard) {
      return state.customCardId;
    }
    const nextId = customCardsService.createId(state.selectedTypeId);
    editorStore.update((prev) => ({
      ...prev,
      customCardId: nextId,
    }));
    return nextId;
  }

  private persistCustomCard() {
    const state = editorStore.getState();
    if (!state.customCardId) return;

    const raw = buildRawCustomCard(state.selectedTypeId, state.customCardId, state.cardFields, state.selectedCard, state.selectedFeatureIndex, state.customImageSource);
    const record: CustomCardRecord = {
      id: rawCustomCardId(raw),
      typeId: state.selectedTypeId,
      raw,
      updatedAt: Date.now(),
    };

    customCardsService.upsert(record);
    this.updateHash({ type: "custom", value: record.id });
  }

  private async resolveCustomImageDisplay(imageUrl: unknown) {
    if (typeof imageUrl !== "string" || !imageUrl.startsWith("asset:")) return;
    const objectUrl = await this.assetService.getObjectUrl(imageUrl.slice("asset:".length));
    if (!objectUrl) return;
    this.setManagedCustomImage(objectUrl, imageUrl);
  }

  private updateHash(target: HashTarget) {
    if (!isBrowser()) return;
    const nextHash = buildHash(target);
    const current = window.location.hash || "";
    if (nextHash === current) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  openCustomCard(record: CustomCardRecord) {
    this.restoreCustomCard(record);
  }

  removeCustomCard(id: string) {
    customCardsService.remove(id);
    const state = editorStore.getState();
    if (state.customCardId === id) {
      this.closeEditor();
    }
  }
}

function buildRawCustomCard(
  typeId: CardTypeId,
  id: string,
  fields: CardFields,
  selectedCard: TemplateCard | null,
  selectedFeatureIndex: number,
  imageUrl: string | null
): RawContentItem {
  const slug = fields.slug || selectedCard?.slug || id;
  const base: RawContentItem = {
    id,
    slug,
    source_slugs: ["custom"],
    source_name: fields.source || "Custom",
    language: "ru",
    name: fields.title || selectedCard?.name || "Без названия",
    image_url: imageUrl || selectedCard?.image || "",
    art_attribution: fields.attribution || null,
    main_body: typeId === "ancestry" || typeId === "community" ? fields.prelude : "",
    short_description: fields.prelude || fields.description,
    description: fields.prelude || fields.description,
    updated_at: Date.now(),
    custom: true,
  };

  if (typeId === "domain-card") {
    return {
      ...base,
      stress_cost: numberOrNull(fields.stressText),
      features: [rawFeature(`${id}:feature`, null, fields.description)],
      level: numberOrNull(fields.bannerText) ?? 1,
      card_type: fields.label || selectedCard?.cardType || "ability",
      domain_slug: fields.domainPrimary || fields.dataDomain || selectedCard?.domainSlug || "custom",
      domain_name: fields.domainPrimary || fields.dataDomain || selectedCard?.domainName || "Custom",
      domain_image_url: null,
    };
  }

  if (typeId === "subclass") {
    const features = selectedCard?.features ?? [];
    const nextFeatures = features.map((feature, index) =>
      index === selectedFeatureIndex
        ? { ...feature, text: fields.description, group: fields.subclassTier || feature.group || "Основа" }
        : feature
    );
    const fallback = nextFeatures.length > 0 ? nextFeatures : [{ id: `${id}:foundation`, name: fields.title, text: fields.description, group: fields.subclassTier || "Основа" }];
    return {
      ...base,
      class_slug: fields.dataClass || selectedCard?.classSlug || "",
      class_name: fields.label || selectedCard?.className || fields.dataClass || "",
      domain_slugs: [fields.domainPrimary, fields.domainSecondary].filter(Boolean),
      spellcast_trait: fields.spellcast || selectedCard?.spellcastTrait || "",
      foundation_features: fallback.filter((feature) => featureGroup(feature.group) === "foundation").map((feature, index) => rawFeature(feature.id ?? `${id}:foundation:${index}`, feature.name, feature.text)),
      specialization_features: fallback.filter((feature) => featureGroup(feature.group) === "specialization").map((feature, index) => rawFeature(feature.id ?? `${id}:specialization:${index}`, feature.name, feature.text)),
      mastery_features: fallback.filter((feature) => featureGroup(feature.group) === "mastery").map((feature, index) => rawFeature(feature.id ?? `${id}:mastery:${index}`, feature.name, feature.text)),
    };
  }

  return {
    ...base,
    features: [rawFeature(`${id}:feature`, fields.title, fields.description)],
  };
}

function rawFeature(id: string | number, name: string | null | undefined, body: string): RawAdversaryFeature {
  return {
    id,
    name: name || null,
    main_body: body || "",
  };
}

function featureGroup(value: string | undefined): "foundation" | "specialization" | "mastery" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("special") || normalized.includes("специал")) return "specialization";
  if (normalized.includes("master") || normalized.includes("мастер")) return "mastery";
  return "foundation";
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const editorService = new EditorService();
