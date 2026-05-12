import { API_BASE_URL, ASSET_BASE_PATH } from "@combat/lib/constants";

export interface AdversaryFeature {
  id: number | string;
  name: string;
  text: string;
}

export interface Adversary {
  id: number;
  slug: string;
  isCustom?: boolean;
  updatedAt?: number;
  tier: number;
  roleId: string;
  roleName: string;
  name: string;
  summary: string;
  image: string | null;
  features: AdversaryFeature[];
  attackBonus: string;
  attackRange: string;
  damageType: string;
  damageBonus: number;
  damageDieSize: number;
  damageDieCount: number;
  stress: number;
  hp: number;
  difficulty: number;
  damageThresholds: number[] | null;
  motives: string;
  experiences: string;
  weaponName: string;
  sourceSlugs: string[];
  campaignFrameSlugs: string[];
  hordePerHp: number | null;
  mainBody: string;
}

export interface EncounterEntry {
  adversary: Adversary;
  count: number;
}

export interface AdversaryCollectionResponse {
  items: Adversary[];
  fetchedAt: string;
}

interface ApiResponse<T> {
  result: "ok" | "error";
  data: T;
}

export interface RawFeature {
  id: number | string;
  name: string;
  main_body?: string | null;
}

export interface RawAdversary {
  id: number;
  slug: string;
  source_slugs?: string[];
  campaign_frame_slugs?: string[];
  tier: number;
  type_slug: string;
  type_name: string;
  name: string;
  short_description?: string | null;
  image_url?: string | null;
  features?: RawFeature[];
  attack_bonus?: string | null;
  attack_range?: string | null;
  damage_type?: string | null;
  damage_bonus?: number | null;
  damage_die_size?: number | null;
  damage_die_count?: number | null;
  stress?: number | null;
  hp?: number | null;
  difficulty?: number | null;
  damage_thresholds?: number[] | null;
  motives?: string | null;
  experiences?: string | null;
  weapon_name?: string | null;
  horde_per_hp?: number | null;
  main_body?: string | null;
  language?: string | null;
}

function resolveImage(imageUrl?: string | null) {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  if (imageUrl.startsWith("/")) {
    return `${ASSET_BASE_PATH}${imageUrl}`;
  }

  return `${ASSET_BASE_PATH}/${imageUrl.replace(/^\/+/, "")}`;
}

function mapFeature(feature: RawFeature): AdversaryFeature {
  return {
    id: feature.id,
    name: feature.name?.trim() || "Без названия",
    text: feature.main_body?.trim() || "",
  };
}

export function mapRawAdversary(item: RawAdversary): Adversary {
  return {
    id: item.id,
    slug: item.slug,
    tier: item.tier,
    roleId: item.type_slug,
    roleName: item.type_name,
    name: item.name,
    summary: item.short_description?.trim() || "",
    image: resolveImage(item.image_url),
    features: Array.isArray(item.features) ? item.features.map(mapFeature) : [],
    attackBonus: item.attack_bonus?.trim() || "0",
    attackRange: item.attack_range?.trim() || "",
    damageType: item.damage_type?.trim() || "",
    damageBonus: item.damage_bonus ?? 0,
    damageDieSize: item.damage_die_size ?? 0,
    damageDieCount: item.damage_die_count ?? 0,
    stress: item.stress ?? 0,
    hp: item.hp ?? 0,
    difficulty: item.difficulty ?? 0,
    damageThresholds: item.damage_thresholds ?? null,
    motives: item.motives?.trim() || "",
    experiences: item.experiences?.trim() || "",
    weaponName: item.weapon_name?.trim() || "",
    sourceSlugs: item.source_slugs ?? [],
    campaignFrameSlugs: item.campaign_frame_slugs ?? [],
    hordePerHp: item.horde_per_hp ?? null,
    mainBody: item.main_body?.trim() || "",
  };
}

function getCollectionUrl() {
  if (API_BASE_URL) {
    return `${API_BASE_URL}/adversary?lang=ru`;
  }

  return `${import.meta.env.BASE_URL}data/adversaries.json`;
}

export async function fetchAdversaryCollection(): Promise<AdversaryCollectionResponse> {
  const response = await fetch(getCollectionUrl(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить противников (статус ${response.status})`);
  }

  const payload = (await response.json()) as ApiResponse<RawAdversary[]>;
  if (payload.result !== "ok" || !Array.isArray(payload.data)) {
    throw new Error("Некорректный ответ API противников");
  }

  return {
    items: payload.data.map(mapRawAdversary),
    fetchedAt: new Date().toISOString(),
  };
}
