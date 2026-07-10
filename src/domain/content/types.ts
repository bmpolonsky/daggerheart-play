import type { AdversaryType, DaggerheartClass, DamageType, DomainName, TraitId } from '../rules/types';

export type ContentCollectionKey = 'adversaries' | 'classes' | 'rules' | 'environments' | 'beastforms' | 'ancestries' | 'communities' | 'subclasses' | 'domainCards' | 'equipment';
export type ContentSourceFilter = 'all' | 'core' | 'void' | 'homebrew';

export interface ApiPayload<T> {
  result?: 'ok' | 'error';
  data?: T[];
  meta?: {
    key?: string;
    endpoint?: string;
    sourceUrl?: string;
    generatedAt?: string | null;
    warning?: string;
    [key: string]: unknown;
  };
}

export interface ContentManifestCollection {
  key: ContentCollectionKey;
  endpoint: string;
  file: string;
  count: number;
  sourceUrl: string;
  source?: 'api' | 'cache' | 'empty';
}

export interface ContentManifest {
  source: string;
  language: string;
  generatedAt: string | null;
  collections: ContentManifestCollection[];
}

export interface RawContentItem {
  id?: string | number;
  slug?: string;
  source_slugs?: string[];
  name?: string;
  title?: string;
  type_name?: string;
  type_slug?: string;
  class_name?: string;
  class_slug?: string;
  domain_name?: string;
  domain_slug?: string;
  image_url?: string | null;
  short_description?: string | null;
  description?: string | null;
  main_body?: string | null;
  mainBody?: string | null;
  text?: string | null;
  level?: number | string | null;
  features?: RawAdversaryFeature[];
  foundation_features?: RawAdversaryFeature[];
  specialization_features?: RawAdversaryFeature[];
  mastery_features?: RawAdversaryFeature[];
  spellcast_trait?: string | null;
  [key: string]: unknown;
}

export interface RawAdversaryFeature {
  id?: number | string;
  name?: string | null;
  main_body?: string | null;
  text?: string | null;
  [key: string]: unknown;
}

export interface RawAdversary {
  id?: number | string;
  slug?: string;
  source_slugs?: string[];
  campaign_frame_slugs?: string[];
  tier?: number | string | null;
  type_slug?: string | null;
  type_name?: string | null;
  name?: string | null;
  short_description?: string | null;
  image_url?: string | null;
  features?: RawAdversaryFeature[];
  attack_bonus?: string | number | null;
  attack_range?: string | null;
  damage_type?: string | null;
  damage_bonus?: number | string | null;
  damage_die_size?: number | string | null;
  damage_die_count?: number | string | null;
  stress?: number | string | null;
  hp?: number | string | null;
  difficulty?: number | string | null;
  damage_thresholds?: Array<number | string> | null;
  motives?: string | null;
  experiences?: string | null;
  weapon_name?: string | null;
  horde_per_hp?: number | string | null;
  main_body?: string | null;
  [key: string]: unknown;
}

export interface RawClassItem {
  id?: string | number;
  slug?: string;
  source_slugs?: string[];
  domain_slugs?: string[];
  domains?: Array<{ slug?: string; name?: string | null; [key: string]: unknown }>;
  features?: RawAdversaryFeature[];
  evasion?: number | string | null;
  hp?: number | string | null;
  image_url?: string | null;
  source_name?: string | null;
  language?: string | null;
  pdf_link?: string | null;
  name?: string | null;
  short_description?: string | null;
  description?: string | null;
  post_description?: string | null;
  class_items?: string[];
  background_questions?: string[];
  connection_questions?: string[];
  [key: string]: unknown;
}

export interface RawRuleItem {
  slug?: string;
  source_slugs?: string[];
  hidden?: boolean;
  frame_slug?: string | null;
  frame_name?: string | null;
  language?: string | null;
  name?: string | null;
  main_body?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

export interface RawEnvironmentItem {
  id?: string | number;
  slug?: string;
  source_slugs?: string[];
  campaign_frame_slugs?: string[];
  tier?: number | string | null;
  difficulty?: number | string | null;
  type_slug?: string | null;
  type_name?: string | null;
  features?: RawAdversaryFeature[];
  image_url?: string | null;
  language?: string | null;
  name?: string | null;
  main_body?: string | null;
  short_description?: string | null;
  potential_adversaries?: string | null;
  impulses?: string | null;
  [key: string]: unknown;
}

export interface RawBeastformItem {
  id?: string | number;
  slug?: string;
  source_slugs?: string[];
  evasion?: number | string | null;
  tier?: number | string | null;
  level?: number | string | null;
  attack_trait?: string | null;
  attack_type?: string | null;
  attack_die?: number | string | null;
  attack_bonus?: number | string | null;
  attack_range?: string | null;
  trait_type?: string | null;
  trait_bonus?: number | string | null;
  features?: RawAdversaryFeature[];
  name?: string | null;
  main_body?: string | null;
  short_description?: string | null;
  language?: string | null;
  examples?: string | null;
  advantages?: string | null;
  [key: string]: unknown;
}

export interface RawEquipmentFeature {
  id?: number | string;
  name?: string | null;
  main_body?: string | null;
  text?: string | null;
  [key: string]: unknown;
}

export interface RawEquipmentItem {
  id?: number | string;
  slug?: string;
  source_slugs?: string[];
  tier?: number | string | null;
  damage_ty?: string | null;
  bonus?: number | string | null;
  range?: string | null;
  char_trait?: string | null;
  die_num?: number | string | null;
  die_size?: number | string | null;
  burden?: number | string | null;
  armor_score?: number | string | null;
  uses?: number | string | null;
  is_special?: boolean | null;
  base_thresholds?: Array<number | string> | null;
  features?: RawEquipmentFeature[];
  subtype_slug?: string | null;
  type_slug?: string | null;
  type_name?: string | null;
  subtype_name?: string | null;
  image_url?: string | null;
  language?: string | null;
  name?: string | null;
  main_body?: string | null;
  feature?: string | null;
  [key: string]: unknown;
}

export interface LibraryAdversary {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  name: string;
  tier: number;
  type: AdversaryType;
  roleName: string;
  difficulty: number;
  attackModifier: number;
  hp: number;
  stress: number;
  thresholds: { major: number; severe: number };
  damageFormula: string;
  damageType: DamageType;
  attackRange: string;
  weaponName: string;
  summary: string;
  motives: string;
  experiencesText: string;
  mainBody: string;
  imageUrl: string | null;
  featureCount: number;
  raw: RawAdversary;
}

export interface GenericLibraryItem {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  name: string;
  subtitle: string;
  body: string;
  imageUrl: string | null;
  level?: number;
  raw: RawContentItem;
}

export type LibraryEquipmentType = 'armor' | 'primary-weapon' | 'secondary-weapon' | 'consumable' | 'item' | 'combat-wheelchair' | 'unknown';

export interface LibraryEquipmentItem {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  name: string;
  type: LibraryEquipmentType;
  typeName: string;
  tier: number | null;
  trait: TraitId | null;
  range: string;
  damageType: DamageType;
  damageFormula: string;
  burden: 'one-handed' | 'two-handed' | null;
  armorScore: number | null;
  baseThresholds: { major: number; severe: number } | null;
  uses: number | null;
  featureText: string;
  imageUrl: string | null;
  raw: RawEquipmentItem;
}

export interface LibraryClassItem {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  className: DaggerheartClass;
  name: string;
  domains: DomainName[];
  domainSlugs: string[];
  evasion: number;
  hp: number;
  classItems: string[];
  backgroundQuestions: string[];
  connectionQuestions: string[];
  body: string;
  imageUrl: string | null;
  raw: RawClassItem;
}

export interface LibraryRuleEntry {
  id: string;
  slug: string;
  name: string;
  summary: string;
  body: string;
  frameSlug: string | null;
  frameName: string | null;
  hidden: boolean;
  raw: RawRuleItem;
}

export interface LibraryEnvironment {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  name: string;
  tier: number;
  difficulty: number;
  type: string;
  typeName: string;
  summary: string;
  body: string;
  featureText: string;
  impulses: string;
  potentialAdversaries: string;
  imageUrl: string | null;
  raw: RawEnvironmentItem;
}

export interface LibraryBeastform {
  id: string;
  sourceId: string | number | undefined;
  slug: string;
  name: string;
  tier: number;
  level: number | null;
  evasionModifier: number;
  attackTrait: TraitId;
  attackDamageType: DamageType;
  attackFormula: string;
  attackRange: string;
  traitType: TraitId | null;
  traitBonus: number;
  summary: string;
  examples: string;
  advantages: string;
  featureText: string;
  raw: RawBeastformItem;
}

export interface ContentState {
  isLoading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
  manifest: ContentManifest | null;
  sourceMode: 'api' | 'cache' | 'mixed' | 'empty';
  sourceWarnings: string[];
  selectedCollection: ContentCollectionKey;
  searchTerm: string;
  sourceFilter: ContentSourceFilter;
  tierFilter: number | 'all';
  levelFilter: number | 'all';
  adversaries: LibraryAdversary[];
  classes: LibraryClassItem[];
  rules: LibraryRuleEntry[];
  environments: LibraryEnvironment[];
  beastforms: LibraryBeastform[];
  equipment: LibraryEquipmentItem[];
  generic: Record<Exclude<ContentCollectionKey, 'adversaries' | 'classes' | 'rules' | 'environments' | 'beastforms' | 'equipment'>, GenericLibraryItem[]>;
}
