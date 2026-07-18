import type { Adversary, AdversaryFeature, AdversaryType, DaggerheartClass, DamageType, DomainName, EncounterEnvironment, TraitId } from '../rules/types';
import { cleanMarkdownText } from '../../core/utils/markdownText';
import { inferExplicitAdversaryFeatureCost } from '../rules/adversaries';
import type {
  GenericLibraryItem,
  LibraryAdversary,
  LibraryBeastform,
  LibraryClassItem,
  LibraryEquipmentItem,
  LibraryEnvironment,
  LibraryEquipmentType,
  LibraryRuleEntry,
  RawAdversary,
  RawAdversaryFeature,
  RawBeastformItem,
  RawClassItem,
  RawContentItem,
  RawEnvironmentItem,
  RawEquipmentFeature,
  RawEquipmentItem,
  RawRuleItem
} from './types';
import { createAdversary, createEncounterEnvironment } from '../rules/factories';
import { createId } from '../../core/utils/id';

const ADVERSARY_TYPES: AdversaryType[] = [
  'Bruiser',
  'Horde',
  'Leader',
  'Minion',
  'Ranged',
  'Skulk',
  'Social',
  'Solo',
  'Standard',
  'Support',
  'Custom'
];

const TYPE_BY_SLUG: Record<string, AdversaryType> = {
  bruiser: 'Bruiser',
  horde: 'Horde',
  leader: 'Leader',
  minion: 'Minion',
  ranged: 'Ranged',
  skulk: 'Skulk',
  social: 'Social',
  solo: 'Solo',
  standard: 'Standard',
  support: 'Support'
};

function stripHtml(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asString(input: unknown, fallback = ''): string {
  if (typeof input === 'string') return stripHtml(input) || fallback;
  if (typeof input === 'number') return String(input);
  return fallback;
}

function cleanImportedRulesText(input: unknown, fallback = ''): string {
  return cleanMarkdownText(asString(input, fallback), { emphasizeLinks: true, stripCodeTicks: true });
}

function asNumber(input: unknown, fallback = 0): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const match = input.match(/-?\d+/);
    if (match) return Number(match[0]);
  }
  return fallback;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || createId('content');
}

function assetPath(imageUrl: unknown): string | null {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
  const trimmed = imageUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${normalized}`.replace(/\/\//g, '/');
}

function coerceAdversaryType(raw: RawAdversary): AdversaryType {
  const slug = asString(raw.type_slug).toLowerCase().replace(/[^a-z]/g, '');
  if (slug && TYPE_BY_SLUG[slug]) return TYPE_BY_SLUG[slug];

  const typeName = asString(raw.type_name);
  const direct = ADVERSARY_TYPES.find((type) => type.toLowerCase() === typeName.toLowerCase());
  return direct ?? 'Custom';
}

function coerceDamageType(raw: unknown): DamageType {
  const value = asString(raw).toLowerCase();
  if (value.includes('magic') || value.includes('magical') || value.includes('маг')) return 'magic';
  if (value.includes('direct') || value.includes('прям')) return 'direct';
  if (value.includes('mix') || value.includes('смеш')) return 'mixed';
  return 'physical';
}

const TRAIT_BY_SLUG: Record<string, TraitId> = {
  agility: 'agility',
  strength: 'strength',
  finesse: 'finesse',
  instinct: 'instinct',
  presence: 'presence',
  knowledge: 'knowledge'
};

const RANGE_LABELS: Record<string, string> = {
  melee: 'Вплотную',
  veryclose: 'Близко',
  'very-close': 'Близко',
  close: 'Средне',
  far: 'Далеко',
  veryfar: 'Очень далеко',
  'very-far': 'Очень далеко'
};

const CLASS_BY_SLUG: Record<string, DaggerheartClass> = {
  bard: 'Bard',
  druid: 'Druid',
  guardian: 'Guardian',
  ranger: 'Ranger',
  rogue: 'Rogue',
  seraph: 'Seraph',
  sorcerer: 'Sorcerer',
  warrior: 'Warrior',
  wizard: 'Wizard'
};

const DOMAIN_BY_SLUG: Record<string, DomainName> = {
  arcana: 'Arcana',
  blade: 'Blade',
  bone: 'Bone',
  codex: 'Codex',
  grace: 'Grace',
  midnight: 'Midnight',
  sage: 'Sage',
  splendor: 'Splendor',
  valor: 'Valor'
};

const EQUIPMENT_TYPES = new Set<LibraryEquipmentType>(['armor', 'primary-weapon', 'secondary-weapon', 'consumable', 'item', 'combat-wheelchair']);

function parseThresholds(input: RawAdversary['damage_thresholds'], tier: number): { major: number; severe: number } {
  if (Array.isArray(input) && input.length >= 2) {
    const major = asNumber(input[0], 0);
    const severe = asNumber(input[1], 0);
    if (major > 0 && severe >= major) return { major, severe };
  }

  return {
    major: 6 + tier * 2,
    severe: 11 + tier * 3
  };
}

function buildDamageFormula(raw: RawAdversary): string {
  const count = Math.max(0, asNumber(raw.damage_die_count, 0));
  const size = Math.max(0, asNumber(raw.damage_die_size, 0));
  const bonus = asNumber(raw.damage_bonus, 0);

  if (count > 0 && size > 0) {
    const bonusPart = bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : '';
    return `${count}d${size}${bonusPart}`;
  }

  if (bonus !== 0) return String(bonus);
  return '1d6';
}

function parseExperienceText(input: string) {
  const normalized = stripHtml(input);
  if (!normalized) return [];

  return normalized
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => {
      const match = part.match(/([+-]\s*\d+)/);
      return {
        id: createId('advexp'),
        name: part.replace(/([+-]\s*\d+)/, '').trim() || part,
        modifier: match ? asNumber(match[1], 2) : 2
      };
    });
}

function mapFeature(feature: RawAdversaryFeature): AdversaryFeature {
  const name = asString(feature.name, 'Feature');
  const text = cleanImportedRulesText(feature.main_body ?? feature.text);
  const lower = `${name} ${text}`.toLowerCase();
  const explicitCost = inferExplicitAdversaryFeatureCost(lower);
  return {
    id: String(feature.id ?? createId('feature')),
    name,
    kind: explicitCost.kind ?? (lower.includes('reaction') || lower.includes('реакц') ? 'reaction' : 'action'),
    cost: explicitCost.cost,
    text
  };
}

export function mapRawAdversary(raw: RawAdversary): LibraryAdversary {
  const name = asString(raw.name, 'Без названия');
  const tier = Math.max(1, asNumber(raw.tier, 1));
  const thresholds = parseThresholds(raw.damage_thresholds, tier);
  const slug = asString(raw.slug, slugify(name));
  const features = Array.isArray(raw.features) ? raw.features : [];

  return {
    id: `adversary:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    name,
    tier,
    type: coerceAdversaryType(raw),
    roleName: asString(raw.type_name, coerceAdversaryType(raw)),
    difficulty: Math.max(0, asNumber(raw.difficulty, 12)),
    attackModifier: asNumber(raw.attack_bonus, 0),
    hp: Math.max(1, asNumber(raw.hp, 4)),
    stress: Math.max(0, asNumber(raw.stress, 0)),
    thresholds,
    damageFormula: buildDamageFormula(raw),
    damageType: coerceDamageType(raw.damage_type),
    attackRange: coerceRange(raw.attack_range) || 'Вплотную',
    weaponName: asString(raw.weapon_name, 'Обычная атака'),
    summary: cleanImportedRulesText(raw.short_description),
    motives: cleanImportedRulesText(raw.motives),
    experiencesText: cleanImportedRulesText(raw.experiences),
    mainBody: cleanImportedRulesText(raw.main_body),
    imageUrl: assetPath(raw.image_url),
    featureCount: features.length,
    raw
  };
}

export function createAdversaryFromLibrary(item: LibraryAdversary): Adversary {
  const features = Array.isArray(item.raw.features) ? item.raw.features.map(mapFeature) : [];
  const experiences = parseExperienceText(item.experiencesText);
  return createAdversary({
    sourceId: item.sourceId,
    sourceSlug: item.slug,
    sourceName: item.name,
    name: item.name,
    summary: item.summary,
    motives: item.motives,
    mainBody: item.mainBody,
    imageUrl: item.imageUrl,
    tier: item.tier,
    type: item.type,
    difficulty: item.difficulty,
    attackModifier: item.attackModifier,
    thresholds: item.thresholds,
    hp: { marked: 0, max: item.hp },
    stress: { marked: 0, max: item.stress },
    standardAttack: {
      name: item.weaponName,
      range: item.attackRange,
      damageFormula: item.damageFormula,
      damageType: item.damageType
    },
    experiences: experiences.length ? experiences : [],
    features,
    notes: ''
  });
}

export function createEnvironmentFromLibrary(item: LibraryEnvironment): EncounterEnvironment {
  return createEncounterEnvironment({
    sourceId: item.sourceId,
    sourceSlug: item.slug,
    sourceName: item.name,
    name: item.name,
    tier: item.tier,
    difficulty: item.difficulty,
    type: item.type,
    typeName: item.typeName,
    summary: item.summary,
    body: item.body,
    featureText: item.featureText,
    impulses: item.impulses,
    potentialAdversaries: item.potentialAdversaries,
    imageUrl: item.imageUrl,
    notes: ''
  });
}

export function mapRawEquipmentItem(raw: RawEquipmentItem): LibraryEquipmentItem {
  const name = asString(raw.name, 'Без названия');
  const type = coerceEquipmentType(raw.type_slug);
  const slug = asString(raw.slug, slugify(name));
  const featureText = buildEquipmentFeatureText(raw.features, raw.main_body);
  const tier = raw.tier === null || raw.tier === undefined ? null : Math.max(1, asNumber(raw.tier, 1));
  const thresholds = parseEquipmentThresholds(raw.base_thresholds);

  return {
    id: `equipment:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    name,
    type,
    typeName: asString(raw.type_name, type),
    tier,
    trait: coerceTrait(raw.char_trait),
    range: coerceRange(raw.range),
    damageType: coerceDamageType(raw.damage_ty),
    damageFormula: buildEquipmentDamageFormula(raw),
    burden: coerceBurden(raw.burden),
    armorScore: raw.armor_score === null || raw.armor_score === undefined ? null : Math.max(0, asNumber(raw.armor_score, 0)),
    baseThresholds: thresholds,
    uses: raw.uses === null || raw.uses === undefined ? null : Math.max(0, asNumber(raw.uses, 0)),
    featureText,
    imageUrl: assetPath(raw.image_url),
    raw
  };
}

export function mapRawClassItem(raw: RawClassItem): LibraryClassItem {
  const name = asString(raw.name, 'Без названия');
  const slug = asString(raw.slug, slugify(name));
  const normalizedSlug = slug.replace(/^playtest-/, '').toLowerCase();
  const domainSlugs = Array.isArray(raw.domain_slugs) ? raw.domain_slugs.filter((item): item is string => typeof item === 'string') : [];
  const domains = domainSlugs.map((domainSlug) => DOMAIN_BY_SLUG[domainSlug.replace(/^playtest-/, '').toLowerCase()]).filter(Boolean) as DomainName[];

  return {
    id: `class:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    className: CLASS_BY_SLUG[normalizedSlug] ?? 'Custom',
    name,
    domains: domains.length > 0 ? domains : ['Custom'],
    domainSlugs,
    evasion: Math.max(0, asNumber(raw.evasion, 10)),
    hp: Math.max(1, asNumber(raw.hp, 6)),
    classItems: Array.isArray(raw.class_items) ? raw.class_items.map((item) => asString(item)).filter(Boolean) : [],
    backgroundQuestions: Array.isArray(raw.background_questions) ? raw.background_questions.map((item) => asString(item)).filter(Boolean) : [],
    connectionQuestions: Array.isArray(raw.connection_questions) ? raw.connection_questions.map((item) => asString(item)).filter(Boolean) : [],
    body: asString(raw.short_description ?? raw.description),
    imageUrl: assetPath(raw.image_url),
    raw
  };
}

export function mapRawRuleItem(raw: RawRuleItem): LibraryRuleEntry {
  const name = asString(raw.name, 'Без названия');
  const slug = asString(raw.slug, slugify(name));
  const body = asString(raw.main_body);
  return {
    id: `rule:${slug}`,
    slug,
    name,
    summary: asString(raw.description, body.slice(0, 220)),
    body,
    frameSlug: asString(raw.frame_slug) || null,
    frameName: asString(raw.frame_name) || null,
    hidden: Boolean(raw.hidden),
    raw
  };
}

export function mapRawEnvironmentItem(raw: RawEnvironmentItem): LibraryEnvironment {
  const name = asString(raw.name, 'Без названия');
  const slug = asString(raw.slug, slugify(name));
  return {
    id: `environment:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    name,
    tier: Math.max(1, asNumber(raw.tier, 1)),
    difficulty: Math.max(0, asNumber(raw.difficulty, 0)),
    type: asString(raw.type_slug, 'environment'),
    typeName: asString(raw.type_name, 'Окружение'),
    summary: asString(raw.short_description),
    body: asString(raw.main_body),
    featureText: buildEnvironmentFeatureText(raw.features),
    impulses: asString(raw.impulses),
    potentialAdversaries: asString(raw.potential_adversaries),
    imageUrl: assetPath(raw.image_url),
    raw
  };
}

export function mapRawBeastformItem(raw: RawBeastformItem): LibraryBeastform {
  const name = asString(raw.name, 'Без названия');
  const slug = asString(raw.slug, slugify(name));
  const count = 1;
  const die = Math.max(0, asNumber(raw.attack_die, 0));
  const bonus = asNumber(raw.attack_bonus, 0);
  return {
    id: `beastform:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    name,
    tier: Math.max(1, asNumber(raw.tier, 1)),
    level: raw.level === null || raw.level === undefined ? null : Math.max(1, asNumber(raw.level, 1)),
    evasionModifier: asNumber(raw.evasion, 0),
    attackTrait: coerceTrait(raw.attack_trait) ?? 'agility',
    attackDamageType: coerceDamageType(raw.attack_type),
    attackFormula: die > 0 ? `${count}d${die}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}` : '',
    attackRange: coerceRange(raw.attack_range),
    traitType: coerceTrait(raw.trait_type),
    traitBonus: asNumber(raw.trait_bonus, 0),
    summary: asString(raw.short_description),
    examples: asString(raw.examples),
    advantages: asString(raw.advantages),
    featureText: buildEnvironmentFeatureText(raw.features),
    raw
  };
}

function coerceEquipmentType(input: unknown): LibraryEquipmentType {
  const value = asString(input).toLowerCase();
  return EQUIPMENT_TYPES.has(value as LibraryEquipmentType) ? (value as LibraryEquipmentType) : 'unknown';
}

function buildEnvironmentFeatureText(features: RawAdversaryFeature[] | undefined): string {
  if (!Array.isArray(features)) return '';
  return features
    .map((feature) => {
      const title = asString(feature.name);
      const body = asString(feature.main_body ?? feature.text);
      if (!title) return body;
      if (!body) return `### ${title}`;
      return `### ${title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function coerceTrait(input: unknown): TraitId | null {
  const value = asString(input).toLowerCase().replace(/[^a-z]/g, '');
  return TRAIT_BY_SLUG[value] ?? null;
}

function coerceRange(input: unknown): string {
  const value = asString(input).toLowerCase().replace(/[_\s-]/g, '');
  return RANGE_LABELS[value] ?? asString(input);
}

function coerceBurden(input: unknown): LibraryEquipmentItem['burden'] {
  const value = asNumber(input, 0);
  if (value === 1) return 'one-handed';
  if (value === 2) return 'two-handed';
  return null;
}

function parseEquipmentThresholds(input: RawEquipmentItem['base_thresholds']): LibraryEquipmentItem['baseThresholds'] {
  if (!Array.isArray(input) || input.length < 2) return null;
  const major = asNumber(input[0], 0);
  const severe = asNumber(input[1], 0);
  return major > 0 && severe >= major ? { major, severe } : null;
}

function buildEquipmentDamageFormula(raw: RawEquipmentItem): string {
  const count = Math.max(0, asNumber(raw.die_num, 0));
  const size = Math.max(0, asNumber(raw.die_size, 0));
  const bonus = asNumber(raw.bonus, 0);
  if (count > 0 && size > 0) return `${count}d${size}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`;
  return bonus ? String(bonus) : '';
}

function buildEquipmentFeatureText(features: RawEquipmentFeature[] | undefined, fallback: unknown): string {
  if (Array.isArray(features) && features.length > 0) {
    return features
      .map((feature) => [asString(feature.name), asString(feature.main_body ?? feature.text)].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('\n');
  }
  return equipmentFeatureFromBody(asString(fallback));
}

function equipmentFeatureFromBody(body: string): string {
  if (!body) return '';
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const featureMatch = normalized.match(/(?:^|\n)\s*\*\*(?:Feature|Особенность|Свойство):\*\*\s*([\s\S]*)$/i);
  if (!featureMatch) return normalized;

  const featureText = featureMatch[1].trim();
  const readableFeature = cleanMarkdownText(featureText, { stripEmphasis: true }).trim();
  return /^[-—–]+$/.test(readableFeature) ? '' : featureText;
}

export function mapGenericItem(raw: RawContentItem, prefix: string): GenericLibraryItem {
  const name = asString(raw.name ?? raw.title, 'Без названия');
  const slug = asString(raw.slug, slugify(name));
  const subtitleParts = [
    asString(raw.type_name),
    asString(raw.class_name),
    asString(raw.domain_name),
    asString(raw.level) ? `Уровень ${asString(raw.level)}` : ''
  ].filter(Boolean);

  return {
    id: `${prefix}:${raw.id ?? slug}`,
    sourceId: raw.id,
    slug,
    name,
    subtitle: subtitleParts.join(' — '),
    body: asString(raw.short_description ?? raw.description ?? raw.main_body ?? raw.mainBody ?? raw.text),
    imageUrl: assetPath(raw.image_url),
    level: typeof raw.level === 'number' ? raw.level : undefined,
    raw
  };
}
