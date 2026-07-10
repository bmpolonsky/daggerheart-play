import { createAdversary } from '../rules/factories';
import type { Adversary, AdversaryFeature, AdversaryType, DamageType, EncounterState } from '../rules/types';
import { battlePointsForAdversaryType, inferExplicitAdversaryFeatureCost } from '../rules/adversaries';

export interface CombatBuilderFeature {
  id: number | string;
  name: string;
  text?: string;
}

export interface CombatBuilderAdversary {
  id: number;
  slug?: string;
  tier: number;
  roleId?: string;
  roleName?: string;
  name: string;
  summary?: string;
  image?: string | null;
  features?: CombatBuilderFeature[];
  attackBonus?: string;
  attackRange?: string;
  damageType?: string;
  damageBonus?: number;
  damageDieSize?: number;
  damageDieCount?: number;
  stress?: number;
  hp?: number;
  difficulty?: number;
  damageThresholds?: number[] | null;
  motives?: string;
  experiences?: string;
  weaponName?: string;
  mainBody?: string;
}

export interface CombatBuilderUnitState {
  id: string;
  currentHp: number;
  currentStress: number;
}

export interface CombatBuilderEncounterEntry {
  adversary: CombatBuilderAdversary;
  count: number;
  instances?: CombatBuilderUnitState[];
}

export interface CombatBuilderEncounterSnapshot {
  entries: CombatBuilderEncounterEntry[];
  playerCount?: number;
  difficultyMode?: string;
  isDamageBoosted?: boolean;
  isLowerTierUsed?: boolean;
  updatedAt?: number | string;
}

export interface CombatBuilderImportResult {
  adversaries: Adversary[];
  battlePointBudget: number;
  warnings: string[];
}

const TYPE_BY_ROLE: Record<string, AdversaryType> = {
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

const ROLE_BY_TYPE: Record<AdversaryType, string> = Object.fromEntries(
  Object.entries(TYPE_BY_ROLE).map(([role, type]) => [type, role])
) as Record<AdversaryType, string>;

export function buildCoreAdversariesFromCombatBuilder(snapshot: CombatBuilderEncounterSnapshot): CombatBuilderImportResult {
  const warnings: string[] = [];
  const adversaries = snapshot.entries.flatMap((entry) => {
    const count = Math.max(0, Number(entry.count) || 0);
    if (!entry.adversary || count === 0) return [];

    const instances = normalizeInstances(entry, count);
    return instances.map((instance, index) => mapCombatAdversary(entry.adversary, instance, count > 1 ? index + 1 : null));
  });

  return {
    adversaries,
    battlePointBudget: snapshot.entries.reduce((sum, entry) => sum + Math.max(0, entry.count) * battlePointsForAdversaryType(coerceType(entry.adversary?.roleId, entry.adversary?.roleName)), 0),
    warnings
  };
}

export function buildCombatBuilderEncounterFromCoreEncounter(encounter: EncounterState): CombatBuilderEncounterSnapshot {
  const groups = groupCoreAdversaries(encounter);
  return {
    entries: groups.map((group) => ({
      adversary: mapCoreAdversary(group.adversary),
      count: group.members.length,
      instances: group.members.map((adversary) => ({
        id: adversary.id,
        currentHp: adversary.hp.marked,
        currentStress: adversary.stress.marked
      }))
    })),
    playerCount: encounter.playerCount,
    difficultyMode: encounter.difficultyMode,
    isDamageBoosted: encounter.isDamageBoosted,
    isLowerTierUsed: encounter.isLowerTierUsed,
    updatedAt: encounter.updatedAt
  };
}

export function isCombatBuilderEncounterSnapshot(value: unknown): value is CombatBuilderEncounterSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CombatBuilderEncounterSnapshot>;
  return Array.isArray(candidate.entries) && candidate.entries.every((entry) => (
    entry &&
    typeof entry === 'object' &&
    typeof entry.count === 'number' &&
    Boolean(entry.adversary && typeof entry.adversary === 'object' && typeof entry.adversary.name === 'string')
  ));
}

function mapCombatAdversary(adversary: CombatBuilderAdversary, instance: CombatBuilderUnitState, suffix: number | null): Adversary {
  const tier = Math.max(1, toNumber(adversary.tier, 1));
  const hpMax = Math.max(1, toNumber(adversary.hp, 4));
  const stressMax = Math.max(0, toNumber(adversary.stress, 0));
  const features = (adversary.features ?? []).map(mapFeature);
  return createAdversary({
    id: instance.id,
    sourceId: adversary.id,
    sourceSlug: adversary.slug,
    sourceName: adversary.name,
    name: suffix ? `${adversary.name} ${suffix}` : adversary.name,
    summary: adversary.summary?.trim() ?? '',
    motives: adversary.motives?.trim() ?? '',
    mainBody: adversary.mainBody?.trim() ?? '',
    imageUrl: adversary.image?.trim() || null,
    tier,
    type: coerceType(adversary.roleId, adversary.roleName),
    difficulty: Math.max(0, toNumber(adversary.difficulty, 12)),
    attackModifier: toNumber(adversary.attackBonus, 0),
    thresholds: parseThresholds(adversary.damageThresholds, tier),
    hp: { marked: clamp(toNumber(instance.currentHp, 0), 0, hpMax), max: hpMax },
    stress: { marked: clamp(toNumber(instance.currentStress, 0), 0, stressMax), max: stressMax },
    standardAttack: {
      name: adversary.weaponName?.trim() || 'Обычная атака',
      range: adversary.attackRange?.trim() || 'Вплотную',
      damageFormula: buildDamageFormula(adversary),
      damageType: coerceDamageType(adversary.damageType)
    },
    experiences: parseExperiences(adversary.experiences ?? ''),
    features,
    conditions: [],
    notes: ''
  });
}

function mapCoreAdversary(adversary: Adversary): CombatBuilderAdversary {
  const damage = parseDamageFormula(adversary.standardAttack.damageFormula);
  return {
    id: numericSourceId(adversary),
    slug: adversary.sourceSlug ?? adversary.id,
    tier: adversary.tier,
    roleId: ROLE_BY_TYPE[adversary.type] ?? 'standard',
    roleName: adversary.type,
    name: adversary.sourceName?.trim() || adversary.name,
    summary: text(adversary.summary),
    image: text(adversary.imageUrl) || null,
    features: adversary.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      text: feature.text
    })),
    attackBonus: String(adversary.attackModifier),
    attackRange: adversary.standardAttack.range,
    damageType: adversary.standardAttack.damageType,
    damageBonus: damage.bonus,
    damageDieSize: damage.size,
    damageDieCount: damage.count,
    stress: adversary.stress.max,
    hp: adversary.hp.max,
    difficulty: adversary.difficulty,
    damageThresholds: [adversary.thresholds.major, adversary.thresholds.severe],
    motives: text(adversary.motives),
    experiences: adversary.experiences.map((experience) => `${experience.name} +${experience.modifier}`).join('\n'),
    weaponName: adversary.standardAttack.name,
    mainBody: text(adversary.mainBody)
  };
}

function groupCoreAdversaries(encounter: EncounterState): Array<{ adversary: Adversary; members: Adversary[] }> {
  const groups: Array<{ key: string; adversary: Adversary; members: Adversary[] }> = [];
  for (const id of encounter.order) {
    const adversary = encounter.adversaries[id];
    if (!adversary) continue;
    const key = coreAdversaryGroupKey(adversary);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.members.push(adversary);
    } else {
      groups.push({ key, adversary, members: [adversary] });
    }
  }
  return groups.map(({ adversary, members }) => ({ adversary, members }));
}

function coreAdversaryGroupKey(adversary: Adversary): string {
  const statBlockSignature = stableJsonSignature({
    sourceName: adversary.sourceName,
    tier: adversary.tier,
    type: adversary.type,
    difficulty: adversary.difficulty,
    attackModifier: adversary.attackModifier,
    thresholds: adversary.thresholds,
    hpMax: adversary.hp.max,
    stressMax: adversary.stress.max,
    standardAttack: adversary.standardAttack,
    experiences: adversary.experiences,
    features: adversary.features,
    summary: adversary.summary,
    motives: adversary.motives,
    mainBody: adversary.mainBody,
    imageUrl: adversary.imageUrl
  });
  if (adversary.sourceId !== undefined) return `source:${String(adversary.sourceId)}:${statBlockSignature}`;
  if (adversary.sourceSlug) return `slug:${adversary.sourceSlug}:${statBlockSignature}`;
  return `instance:${adversary.id}`;
}

function numericSourceId(adversary: Adversary): number {
  if (typeof adversary.sourceId === 'number' && Number.isFinite(adversary.sourceId)) {
    return adversary.sourceId;
  }
  return stableNumericId(String(adversary.sourceId ?? adversary.id));
}

function stableJsonSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined';
  } catch {
    return String(value);
  }
}

function normalizeInstances(entry: CombatBuilderEncounterEntry, count: number): CombatBuilderUnitState[] {
  const existing = Array.isArray(entry.instances) ? entry.instances : [];
  return Array.from({ length: count }, (_, index) => existing[index] ?? { id: `${entry.adversary.id}-${index}`, currentHp: 0, currentStress: 0 });
}

function mapFeature(feature: CombatBuilderFeature): AdversaryFeature {
  const name = feature.name?.trim() || 'Feature';
  const text = feature.text?.trim() || '';
  const lower = `${name} ${text}`.toLowerCase();
  const explicitCost = inferExplicitAdversaryFeatureCost(lower);
  return {
    id: String(feature.id),
    name,
    kind: explicitCost.kind ?? (lower.includes('reaction') || lower.includes('реакц') ? 'reaction' : 'action'),
    cost: explicitCost.cost,
    text
  };
}

function parseExperiences(input: string): Adversary['experiences'] {
  return input
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((part, index) => {
      const match = part.match(/([+-]?\s*\d+)/);
      return {
        id: `combat-import-exp-${index + 1}`,
        name: part.replace(/([+-]?\s*\d+)/, '').trim() || part,
        modifier: match ? toNumber(match[1], 2) : 2
      };
    });
}

function coerceType(roleId = '', roleName = ''): AdversaryType {
  const normalized = roleId.toLowerCase().replace(/[^a-z]/g, '');
  if (TYPE_BY_ROLE[normalized]) return TYPE_BY_ROLE[normalized];
  const byName = Object.values(TYPE_BY_ROLE).find((type) => type.toLowerCase() === roleName.toLowerCase());
  return byName ?? 'Custom';
}

function coerceDamageType(input = ''): DamageType {
  const value = input.toLowerCase();
  if (value.includes('magic') || value.includes('маг')) return 'magic';
  if (value.includes('direct') || value.includes('прям')) return 'direct';
  if (value.includes('mix') || value.includes('смеш')) return 'mixed';
  return 'physical';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseThresholds(input: number[] | null | undefined, tier: number): Adversary['thresholds'] {
  if (Array.isArray(input) && input.length >= 2) {
    const major = toNumber(input[0], 0);
    const severe = toNumber(input[1], 0);
    if (major > 0 && severe >= major) return { major, severe };
  }
  return { major: 6 + tier * 2, severe: 11 + tier * 3 };
}

function buildDamageFormula(adversary: CombatBuilderAdversary): string {
  const count = Math.max(0, toNumber(adversary.damageDieCount, 0));
  const size = Math.max(0, toNumber(adversary.damageDieSize, 0));
  const bonus = toNumber(adversary.damageBonus, 0);
  if (count > 0 && size > 0) return `${count}d${size}${bonus > 0 ? `+${bonus}` : bonus < 0 ? bonus : ''}`;
  return bonus ? String(bonus) : '1d6';
}

function parseDamageFormula(formula: string): { count: number; size: number; bonus: number } {
  const match = formula.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) {
    return { count: 0, size: 0, bonus: toNumber(formula, 0) };
  }
  return {
    count: Number(match[1]),
    size: Number(match[2]),
    bonus: match[3] ? Number(match[3]) : 0
  };
}

function stableNumericId(id: string): number {
  const direct = Number(id);
  if (Number.isInteger(direct)) return direct;
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  }
  return hash < 0 ? hash : -Math.max(1, hash);
}

function toNumber(input: unknown, fallback: number): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const match = input.match(/-?\d+/);
    if (match) return Number(match[0]);
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
