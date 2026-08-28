import {
  mapRawAdversary,
  type Adversary,
  type AdversaryFeature,
  type RawAdversary,
  type RawFeature,
} from "@combat/lib/api";
import { cleanMarkdownText } from "../../../core/utils/markdownText";

export const CUSTOM_ADVERSARY_EXPORT_FORMAT = "daggerheart-combat-builder.custom-adversaries";

export const ADVERSARY_ROLE_OPTIONS = [
  { id: "minion", name: "Приспешник" },
  { id: "social", name: "Социальный" },
  { id: "support", name: "Поддержка" },
  { id: "horde", name: "Орда" },
  { id: "ranged", name: "Дальнобойный" },
  { id: "skulk", name: "Скрытный" },
  { id: "standard", name: "Рядовой" },
  { id: "leader", name: "Лидер" },
  { id: "bruiser", name: "Громила" },
  { id: "solo", name: "Одиночка" },
];

export interface CustomAdversaryExportPayload {
  format: typeof CUSTOM_ADVERSARY_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  items: RawAdversary[];
}

export interface NormalizeCustomAdversaryOptions {
  keepId?: boolean;
  now?: number;
}

export function createCustomAdversaryId(existingIds: Set<number>) {
  let id = 0;
  do {
    id = -Math.floor(Date.now() + Math.random() * 1000);
  } while (existingIds.has(id));
  return id;
}

export function normalizeNumber(
  value: unknown,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function normalizeText(value: unknown) {
  return typeof value === "string" ? cleanMarkdownText(value, { emphasizeLinks: true }) : "";
}

export function resolveRoleName(roleId: string, fallback?: string) {
  return ADVERSARY_ROLE_OPTIONS.find((role) => role.id === roleId)?.name ?? fallback ?? "Рядовой";
}

export function extractCustomAdversaryItems(parsed: unknown) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { items?: unknown }).items)) {
    return (parsed as { items: unknown[] }).items;
  }
  return null;
}

function normalizeFeature(feature: Partial<AdversaryFeature>, index: number) {
  const name = normalizeText(feature?.name);
  const text = normalizeText(feature?.text);
  if (!name && !text) return null;

  return {
    id: feature?.id ?? `custom-feature-${index}`,
    name: name || "Без названия",
    text,
  };
}

function normalizeRawFeature(feature: Partial<RawFeature>, index: number): RawFeature | null {
  const name = normalizeText(feature?.name);
  const mainBody = normalizeText(feature?.main_body);
  if (!name && !mainBody) return null;

  return {
    id: feature?.id ?? `custom-feature-${index}`,
    name: name || "Без названия",
    main_body: mainBody || null,
  };
}

function normalizeSlugs(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  const slugs = value.map(normalizeText).filter(Boolean);
  return slugs.length > 0 ? slugs : fallback;
}

export function normalizeCustomAdversary(
  item: Partial<Adversary>,
  existingIds: Set<number>,
  options: NormalizeCustomAdversaryOptions = {}
): Adversary | null {
  const name = normalizeText(item.name);
  if (!name) return null;

  const roleId = normalizeText(item.roleId) || "standard";
  const id =
    options.keepId && typeof item.id === "number" && item.id < 0 && !existingIds.has(item.id)
      ? item.id
      : createCustomAdversaryId(existingIds);
  existingIds.add(id);

  const damageThresholds = Array.isArray(item.damageThresholds)
    ? [
        normalizeNumber(item.damageThresholds[0], 0),
        normalizeNumber(item.damageThresholds[1], 0),
      ].filter((value) => value > 0)
    : [];
  const features = Array.isArray(item.features)
    ? item.features
        .map((feature, index) => normalizeFeature(feature, index))
        .filter((feature): feature is AdversaryFeature => Boolean(feature))
    : [];

  return {
    id,
    slug: normalizeText(item.slug) || `custom-${Math.abs(id)}`,
    isCustom: true,
    updatedAt: normalizeNumber(item.updatedAt, options.now ?? Date.now(), 0),
    tier: normalizeNumber(item.tier, 1, 1, 4),
    roleId,
    roleName: resolveRoleName(roleId, normalizeText(item.roleName)),
    name,
    summary: normalizeText(item.summary),
    image: normalizeText(item.image) || null,
    features,
    attackBonus: normalizeText(item.attackBonus) || "0",
    attackRange: normalizeText(item.attackRange),
    damageType: normalizeText(item.damageType),
    damageBonus: normalizeNumber(item.damageBonus, 0, -999),
    damageDieSize: normalizeNumber(item.damageDieSize, 0),
    damageDieCount: normalizeNumber(item.damageDieCount, 0),
    stress: normalizeNumber(item.stress, 0),
    hp: normalizeNumber(item.hp, 0),
    difficulty: normalizeNumber(item.difficulty, 0),
    damageThresholds: damageThresholds.length === 2 ? damageThresholds : null,
    motives: normalizeText(item.motives),
    experiences: normalizeText(item.experiences),
    weaponName: normalizeText(item.weaponName),
    sourceSlugs: ["custom"],
    campaignFrameSlugs: [],
    hordePerHp: item.hordePerHp ?? null,
    mainBody: normalizeText(item.mainBody),
  };
}

export function customAdversaryToRaw(item: Adversary): RawAdversary {
  return {
    id: item.id,
    slug: normalizeText(item.slug) || `custom-${Math.abs(item.id)}`,
    source_slugs: normalizeSlugs(item.sourceSlugs, ["custom"]),
    campaign_frame_slugs: normalizeSlugs(item.campaignFrameSlugs),
    tier: normalizeNumber(item.tier, 1, 1, 4),
    type_slug: normalizeText(item.roleId) || "standard",
    image_url: normalizeText(item.image) || null,
    features: item.features
      .map((feature, index) =>
        normalizeRawFeature(
          {
            id: feature.id,
            name: feature.name,
            main_body: feature.text,
          },
          index
        )
      )
      .filter((feature): feature is RawFeature => Boolean(feature)),
    attack_bonus: normalizeText(item.attackBonus) || "0",
    attack_range: normalizeText(item.attackRange),
    damage_type: normalizeText(item.damageType),
    damage_bonus: normalizeNumber(item.damageBonus, 0, -999),
    damage_die_size: normalizeNumber(item.damageDieSize, 0),
    damage_die_count: normalizeNumber(item.damageDieCount, 0),
    stress: normalizeNumber(item.stress, 0),
    hp: normalizeNumber(item.hp, 0),
    difficulty: normalizeNumber(item.difficulty, 0),
    damage_thresholds: item.damageThresholds
      ? [
          normalizeNumber(item.damageThresholds[0], 0),
          normalizeNumber(item.damageThresholds[1], 0),
        ]
      : null,
    horde_per_hp: item.hordePerHp ?? null,
    language: "ru",
    name: normalizeText(item.name),
    main_body: normalizeText(item.mainBody) || null,
    short_description: normalizeText(item.summary) || null,
    type_name: resolveRoleName(
      normalizeText(item.roleId) || "standard",
      normalizeText(item.roleName)
    ),
    motives: normalizeText(item.motives),
    weapon_name: normalizeText(item.weaponName),
    experiences: normalizeText(item.experiences),
  };
}

export function normalizeRawCustomAdversary(
  item: unknown,
  existingIds: Set<number>,
  options: NormalizeCustomAdversaryOptions = {}
): Adversary | null {
  if (!item || typeof item !== "object") return null;

  const rawItem = item as Partial<RawAdversary>;
  const name = normalizeText(rawItem.name);
  if (!name) return null;

  const roleId = normalizeText(rawItem.type_slug) || "standard";
  const id =
    options.keepId &&
    typeof rawItem.id === "number" &&
    rawItem.id < 0 &&
    !existingIds.has(rawItem.id)
      ? rawItem.id
      : createCustomAdversaryId(existingIds);
  existingIds.add(id);

  const damageThresholds = Array.isArray(rawItem.damage_thresholds)
    ? [
        normalizeNumber(rawItem.damage_thresholds[0], 0),
        normalizeNumber(rawItem.damage_thresholds[1], 0),
      ].filter((value) => value > 0)
    : [];
  const features = Array.isArray(rawItem.features)
    ? rawItem.features
        .map((feature, index) => normalizeRawFeature(feature, index))
        .filter((feature): feature is RawFeature => Boolean(feature))
    : [];

  return {
    ...mapRawAdversary({
      id,
      slug: normalizeText(rawItem.slug) || `custom-${Math.abs(id)}`,
      source_slugs: normalizeSlugs(rawItem.source_slugs, ["custom"]),
      campaign_frame_slugs: normalizeSlugs(rawItem.campaign_frame_slugs),
      tier: normalizeNumber(rawItem.tier, 1, 1, 4),
      type_slug: roleId,
      image_url: normalizeText(rawItem.image_url) || null,
      features,
      attack_bonus: normalizeText(rawItem.attack_bonus) || "0",
      attack_range: normalizeText(rawItem.attack_range),
      damage_type: normalizeText(rawItem.damage_type),
      damage_bonus: normalizeNumber(rawItem.damage_bonus, 0, -999),
      damage_die_size: normalizeNumber(rawItem.damage_die_size, 0),
      damage_die_count: normalizeNumber(rawItem.damage_die_count, 0),
      stress: normalizeNumber(rawItem.stress, 0),
      hp: normalizeNumber(rawItem.hp, 0),
      difficulty: normalizeNumber(rawItem.difficulty, 0),
      damage_thresholds: damageThresholds.length === 2 ? damageThresholds : null,
      horde_per_hp:
        typeof rawItem.horde_per_hp === "number" && Number.isFinite(rawItem.horde_per_hp)
          ? Math.trunc(rawItem.horde_per_hp)
          : null,
      language: normalizeText(rawItem.language) || "ru",
      name,
      main_body: normalizeText(rawItem.main_body) || null,
      short_description: normalizeText(rawItem.short_description) || null,
      type_name: resolveRoleName(roleId, normalizeText(rawItem.type_name)),
      motives: normalizeText(rawItem.motives),
      weapon_name: normalizeText(rawItem.weapon_name),
      experiences: normalizeText(rawItem.experiences),
    }),
    isCustom: true,
    updatedAt: options.now ?? Date.now(),
  };
}

export function buildCustomAdversaryExport(items: Adversary[]): CustomAdversaryExportPayload {
  return {
    format: CUSTOM_ADVERSARY_EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    items: items.map(customAdversaryToRaw),
  };
}

export function buildDuplicateTemplate(adversary: Adversary): Adversary {
  return {
    ...adversary,
    id: 0,
    slug: "",
    isCustom: true,
    updatedAt: undefined,
    name: `${adversary.name} (копия)`,
    sourceSlugs: ["custom"],
    campaignFrameSlugs: [],
  };
}
