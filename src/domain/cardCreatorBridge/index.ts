import { createDomainCard } from '../rules/factories';
import type { DomainCardRecord, DomainName } from '../rules/types';

export type CardCreatorCardTypeId = 'ancestry' | 'community' | 'subclass' | 'domain-card';

export interface CardCreatorCardFieldsPayload {
  slug?: unknown;
  dataClass?: unknown;
  dataDomain?: unknown;
  title?: unknown;
  prelude?: unknown;
  description?: unknown;
  source?: unknown;
  label?: unknown;
  bannerImage?: unknown;
  bannerText?: unknown;
  stressText?: unknown;
  subclassTier?: unknown;
  spellcast?: unknown;
  domainPrimary?: unknown;
  domainSecondary?: unknown;
}

export interface CardCreatorTemplateFeaturePayload {
  id?: unknown;
  name?: unknown;
  text?: unknown;
  main_body?: unknown;
  group?: unknown;
}

export interface CardCreatorTemplateCardPayload {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  image?: unknown;
  description?: unknown;
  sourceName?: unknown;
  category?: unknown;
  classSlug?: unknown;
  className?: unknown;
  spellcastTrait?: unknown;
  domainSlug?: unknown;
  domainSlugs?: unknown;
  domainName?: unknown;
  cardType?: unknown;
  stressCost?: unknown;
  level?: unknown;
  features?: unknown;
  foundation_features?: unknown;
  specialization_features?: unknown;
  mastery_features?: unknown;
}

export interface CardCreatorCustomCardPayload {
  id?: unknown;
  baseCard?: CardCreatorTemplateCardPayload | null;
  typeId?: unknown;
  cardFields?: CardCreatorCardFieldsPayload;
  customImage?: unknown;
  selectedFeatureIndex?: unknown;
  updatedAt?: unknown;
}

export interface NormalizedCardCreatorCustomCard {
  id: string;
  typeId: CardCreatorCardTypeId;
  slug: string;
  title: string;
  description: string;
  source: string;
  label: string;
  classSlug: string;
  className: string;
  spellcastTrait: string;
  subclassTier: string;
  domain: DomainName;
  domainSlugs: string[];
  level: number;
  cost: string;
  imageUrl: string | null;
  cardType: string;
  sourceId: string | number | undefined;
  features: NormalizedCardCreatorFeature[];
  foundationFeatures: NormalizedCardCreatorFeature[];
  specializationFeatures: NormalizedCardCreatorFeature[];
  masteryFeatures: NormalizedCardCreatorFeature[];
  updatedAt: number | null;
}

export interface NormalizedCardCreatorFeature {
  id: string | number;
  name: string;
  text: string;
  group: string;
}

export interface CardCreatorNormalizeResult {
  ok: boolean;
  card: NormalizedCardCreatorCustomCard | null;
  warnings: string[];
}

export interface CardCreatorDomainCardConversionResult {
  card: DomainCardRecord | null;
  warnings: string[];
}

const CARD_TYPES = new Set<CardCreatorCardTypeId>(['ancestry', 'community', 'subclass', 'domain-card']);

const DOMAIN_ALIASES: Record<string, DomainName> = {
  arcana: 'Arcana',
  blade: 'Blade',
  bone: 'Bone',
  codex: 'Codex',
  grace: 'Grace',
  midnight: 'Midnight',
  sage: 'Sage',
  splendor: 'Splendor',
  valor: 'Valor',
  custom: 'Custom',
  аркана: 'Arcana',
  клинок: 'Blade',
  кость: 'Bone',
  кодекс: 'Codex',
  грация: 'Grace',
  полночь: 'Midnight',
  мудрость: 'Sage',
  великолепие: 'Splendor',
  доблесть: 'Valor'
};

export function isCardCreatorCustomCardPayload(value: unknown): value is CardCreatorCustomCardPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as CardCreatorCustomCardPayload;
  return typeof candidate.id === 'string' && typeof candidate.typeId === 'string' && Boolean(candidate.cardFields && typeof candidate.cardFields === 'object');
}

export function normalizeCardCreatorCustomCardPayload(value: unknown): CardCreatorNormalizeResult {
  const warnings: string[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, card: null, warnings: ['Payload card-creator должен быть объектом.'] };
  }

  const payload = value as CardCreatorCustomCardPayload;
  const fields = payload.cardFields && typeof payload.cardFields === 'object' ? payload.cardFields : {};
  const baseCard = payload.baseCard && typeof payload.baseCard === 'object' ? payload.baseCard : null;
  const typeId = normalizeCardType(payload.typeId);
  if (!typeId) {
    return { ok: false, card: null, warnings: ['Payload card-creator содержит неизвестный тип карты.'] };
  }

  const id = firstText(payload.id, fields.slug, baseCard?.id, baseCard?.slug);
  const title = firstText(fields.title, baseCard?.name);
  if (!id) warnings.push('У custom card нет id или slug.');
  if (!title) warnings.push('У custom card нет названия.');

  const stressCost = toSafeInteger(baseCard?.stressCost, 0);
  const stressText = firstText(fields.stressText);
  const cost = stressText || (stressCost > 0 ? `${stressCost} Stress` : '');

  const card: NormalizedCardCreatorCustomCard = {
    id: id || 'card-creator-custom-card',
    typeId,
    slug: firstText(fields.slug, baseCard?.slug, id) || 'custom-card',
    title: title || 'Custom card',
    description: firstText(fields.description, fields.prelude, baseCard?.description),
    source: firstText(fields.source, baseCard?.sourceName),
    label: firstText(fields.label),
    classSlug: firstText(fields.dataClass, baseCard?.classSlug),
    className: firstText(baseCard?.className, fields.dataClass),
    spellcastTrait: firstText(fields.spellcast, baseCard?.spellcastTrait),
    subclassTier: firstText(fields.subclassTier),
    domain: coerceDomainName(firstText(fields.dataDomain, fields.domainPrimary, baseCard?.domainName, baseCard?.domainSlug, firstArrayText(baseCard?.domainSlugs))),
    domainSlugs: normalizeDomainSlugs(fields, baseCard),
    level: clamp(toSafeInteger(baseCard?.level, 1), 1, 10),
    cost,
    imageUrl: firstText(payload.customImage, fields.bannerImage, baseCard?.image) || null,
    cardType: firstText(baseCard?.cardType, fields.label),
    sourceId: stringOrNumber(baseCard?.id) ?? stringOrNumber(payload.id),
    features: normalizeFeatures(baseCard?.features),
    foundationFeatures: normalizeFeatures(baseCard?.foundation_features),
    specializationFeatures: normalizeFeatures(baseCard?.specialization_features),
    masteryFeatures: normalizeFeatures(baseCard?.mastery_features),
    updatedAt: typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt) ? payload.updatedAt : null
  };

  return { ok: warnings.length === 0, card, warnings };
}

export function customCardToCharacterDomainCard(value: unknown, input?: Partial<DomainCardRecord>): CardCreatorDomainCardConversionResult {
  const normalized = normalizeCardCreatorCustomCardPayload(value);
  if (!normalized.card) {
    return { card: null, warnings: normalized.warnings };
  }

  const warnings = [...normalized.warnings];
  if (normalized.card.typeId !== 'domain-card') {
    return { card: null, warnings: [...warnings, 'Только card-creator domain-card можно конвертировать в Character domain card.'] };
  }

  return {
    card: createDomainCard({
      id: input?.id ?? `card-creator:${normalized.card.id}`,
      name: input?.name ?? normalized.card.title,
      domain: input?.domain ?? normalized.card.domain,
      level: input?.level ?? normalized.card.level,
      cost: input?.cost ?? normalized.card.cost,
      text: input?.text ?? normalized.card.description,
      inLoadout: input?.inLoadout ?? true,
      imageUrl: input?.imageUrl ?? normalized.card.imageUrl,
      cardType: input?.cardType ?? normalized.card.cardType,
      sourceId: input?.sourceId ?? normalized.card.sourceId,
      tokens: input?.tokens
    }),
    warnings
  };
}

function normalizeCardType(value: unknown): CardCreatorCardTypeId | null {
  if (typeof value !== 'string') return null;
  return CARD_TYPES.has(value as CardCreatorCardTypeId) ? value as CardCreatorCardTypeId : null;
}

function coerceDomainName(input: string): DomainName {
  const key = input.trim().toLowerCase();
  return DOMAIN_ALIASES[key] ?? 'Custom';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function firstArrayText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return firstText(...value);
}

function normalizeDomainSlugs(fields: CardCreatorCardFieldsPayload, baseCard: CardCreatorTemplateCardPayload | null): string[] {
  const slugs = [
    ...arrayTextValues(baseCard?.domainSlugs),
    firstText(baseCard?.domainSlug),
    firstText(fields.domainPrimary),
    firstText(fields.domainSecondary)
  ].filter(Boolean);
  return Array.from(new Set(slugs));
}

function normalizeFeatures(value: unknown): NormalizedCardCreatorFeature[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const feature = item as CardCreatorTemplateFeaturePayload;
      const name = firstText(feature.name);
      const text = firstText(feature.text, feature.main_body);
      if (!name && !text) return null;
      return {
        id: stringOrNumber(feature.id) ?? index,
        name: name || 'Feature',
        text,
        group: firstText(feature.group)
      };
    })
    .filter((item): item is NormalizedCardCreatorFeature => Boolean(item));
}

function arrayTextValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => firstText(item)).filter(Boolean);
}

function stringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
}

function toSafeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
