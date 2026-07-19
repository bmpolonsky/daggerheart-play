import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/date';
import { clamp, toSafeInteger } from '../../core/utils/clamp';
import { createLocalParticipant, createTableScene } from '../tabletop/factories';
import {
  CLASS_DOMAINS,
  CLASS_STARTING_STATS,
  DEFAULT_ACTION_TOKENS,
  DEFAULT_MAX_FEAR,
  DEFAULT_MAX_HOPE,
  DEFAULT_PROFICIENCY,
  DEFAULT_STARTING_HOPE,
  DEFAULT_STRESS,
  DEFAULT_TRAITS
} from './constants';
import { normalizeRangerCompanion } from './rangerCompanion';
import { enforceCharacterHandLimit } from './cardLoadout';
import { normalizeCharacterChangeHistory } from './characterHistory';
import { normalizeCharacterUsageTrackers } from './usageTrackers';
import { normalizeCharacterRuleModifiers } from './characterRuleModifiers';
import { ActorStatus, normalizeStatusTag } from './statuses';
import type {
  Adversary,
  GameState,
  GameHandout,
  Character,
  CharacterAdvancementState,
  CharacterInventoryItem,
  CharacterSheetCard,
  CharacterWealth,
  Countdown,
  DaggerheartClass,
  DomainCardRecord,
  EncounterEnvironment,
  EncounterState,
  Experience,
  SceneTableState,
  UiState,
  Weapon
} from './types';

export function createGameState(): GameState {
  const now = nowIso();
  return {
    id: createId('game'),
    name: '',
    gmName: 'Мастер',
    sessionTitle: 'Сессия 1',
    sceneTitle: 'Открывающая сцена',
    fear: 0,
    maxFear: DEFAULT_MAX_FEAR,
    spotlight: 'players',
    actionTokensPerScene: DEFAULT_ACTION_TOKENS,
    autoApplyRollConsequences: true,
    showLegacyActionTokens: false,
    showCoins: false,
    safetyNotes: '',
    tableNotes: '',
    presentedHandoutId: null,
    handouts: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createGameHandout(input?: Partial<GameHandout>): GameHandout {
  const now = nowIso();
  return {
    id: input?.id ?? createId('handout'),
    title: input?.title ?? 'Новая раздатка',
    body: input?.body ?? '',
    imageUrl: input?.imageUrl ?? null,
    visibleToPlayers: input?.visibleToPlayers ?? false,
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  };
}

type CharacterInput = Partial<Omit<Character, 'inventory'>> & {
  className?: DaggerheartClass;
  inventory?: CharacterInventoryItem[];
};

const DEFAULT_STARTING_WEALTH: CharacterWealth = { coins: 0, handfuls: 1, bags: 0, chests: 0 };
const EMPTY_WEALTH: CharacterWealth = { coins: 0, handfuls: 0, bags: 0, chests: 0 };

export function createCharacter(input?: CharacterInput): Character {
  const now = nowIso();
  const className = input?.className ?? 'Bard';
  const stats = CLASS_STARTING_STATS[className];
  const level = input?.level ?? 1;
  const armor = sanitizeArmor(input?.armor ?? {
    name: 'Кожаная броня',
    baseMajor: 6,
    baseSevere: 13,
    score: 3,
    markedSlots: 0,
    feature: ''
  });
  const defaultWealth = input?.id && input?.createdAt ? EMPTY_WEALTH : DEFAULT_STARTING_WEALTH;
  const ruleModifiers = normalizeCharacterRuleModifiers(input?.ruleModifiers);

  const character: Character = {
    id: input?.id ?? createId('pc'),
    name: input?.name ?? 'Новый герой',
    playerName: input?.playerName ?? '',
    pronouns: input?.pronouns ?? '',
    portraitUrl: input?.portraitUrl ?? '',
    className,
    subclassName: input?.subclassName ?? '',
    subclassSlug: input?.subclassSlug ?? '',
    ancestry: input?.ancestry ?? '',
    community: input?.community ?? '',
    level,
    proficiency: input?.proficiency ?? DEFAULT_PROFICIENCY,
    domains: input?.domains ?? CLASS_DOMAINS[className],
    traits: input?.traits ?? { ...DEFAULT_TRAITS },
    spellcastTrait: input?.spellcastTrait ?? null,
    evasion: input?.evasion ?? stats.evasion,
    thresholds: input?.thresholds ?? {
      major: armor.baseMajor + level,
      severe: armor.baseSevere + level
    },
    hp: sanitizeTrack(input?.hp ?? { marked: 0, max: stats.hp }),
    stress: sanitizeTrack(input?.stress ?? { marked: 0, max: DEFAULT_STRESS }),
    hope: sanitizeHope(input?.hope ?? { value: DEFAULT_STARTING_HOPE, max: DEFAULT_MAX_HOPE }),
    armor,
    actionTokens: input?.actionTokens ?? DEFAULT_ACTION_TOKENS,
    experiences: input?.experiences ?? [createExperience('Путешественник', 2)],
    weapons: input?.weapons ?? [createWeapon({ name: 'Основное оружие', trait: 'agility', damageFormula: '1d8+1' })],
    domainCards: enforceCharacterHandLimit((input?.domainCards ?? []).map((card) => createDomainCard(card)), ruleModifiers),
    ruleModifiers,
    advancement: normalizeCharacterAdvancement(input?.advancement),
    usageTrackers: normalizeCharacterUsageTrackers(input?.usageTrackers),
    changeHistory: normalizeCharacterChangeHistory(input?.changeHistory),
    playerSyncRevision: normalizePlayerSyncRevision(input?.playerSyncRevision),
    sheetCards: input?.sheetCards ?? [],
    inventory: sanitizeInventory(input?.inventory ?? [
      createInventoryItem({ name: 'Факел' }),
      createInventoryItem({ name: '50 футов веревки' }),
      createInventoryItem({ name: 'Основные припасы' })
    ]),
    wealth: sanitizeWealth(input?.wealth ?? defaultWealth),
    conditions: input?.conditions ?? [],
    activeBeastform: input?.activeBeastform ?? null,
    rangerMark: input?.rangerMark ?? null,
    companion: input?.companion ? normalizeRangerCompanion(input.companion) : null,
    scars: input?.scars ?? [],
    notes: input?.notes ?? '',
    description: input?.description,
    backgroundAnswers: input?.backgroundAnswers ?? [],
    connections: input?.connections ?? [],
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now
  };

  return character;
}

function normalizePlayerSyncRevision(value: unknown): Character['playerSyncRevision'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as { participantId?: unknown; revision?: unknown };
  if (typeof input.participantId !== 'string' || !input.participantId.trim()) return undefined;
  if (typeof input.revision !== 'number' || !Number.isSafeInteger(input.revision) || input.revision < 0) return undefined;
  return { participantId: input.participantId.trim(), revision: input.revision };
}

export function sanitizeWealth(input: Partial<CharacterWealth> | null | undefined): CharacterWealth {
  const value = input ?? {};
  return {
    coins: clamp(toSafeInteger(value.coins, 0), 0, 9),
    handfuls: clamp(toSafeInteger(value.handfuls, 0), 0, 9),
    bags: clamp(toSafeInteger(value.bags, 0), 0, 9),
    chests: clamp(toSafeInteger(value.chests, 0), 0, 1)
  };
}

function sanitizeTrack(track: Character['hp']): Character['hp'] {
  const max = clamp(toSafeInteger(track.max, 1), 0, 12);
  return { max, marked: clamp(toSafeInteger(track.marked, 0), 0, max) };
}

function sanitizeHope(hope: Character['hope']): Character['hope'] {
  const max = clamp(toSafeInteger(hope.max, DEFAULT_MAX_HOPE), 0, DEFAULT_MAX_HOPE);
  return { max, value: clamp(toSafeInteger(hope.value, DEFAULT_STARTING_HOPE), 0, max) };
}

function sanitizeArmor(armor: Character['armor']): Character['armor'] {
  const score = clamp(toSafeInteger(armor.score, 0), 0, 12);
  return {
    ...armor,
    sourceId: armor.sourceId,
    sourceSlug: typeof armor.sourceSlug === 'string' ? armor.sourceSlug : undefined,
    tier: armor.tier ?? null,
    score,
    markedSlots: clamp(toSafeInteger(armor.markedSlots, 0), 0, score),
    feature: armor.feature ?? armor.featureText ?? '',
    featureText: armor.featureText ?? armor.feature ?? ''
  };
}

export function createExperience(name = 'Новый опыт', modifier = 2): Experience {
  return {
    id: createId('exp'),
    name,
    modifier,
    notes: ''
  };
}

export function createWeapon(input?: Partial<Weapon>): Weapon {
  return {
    id: input?.id ?? createId('weapon'),
    name: input?.name ?? 'Weapon',
    sourceId: input?.sourceId,
    sourceSlug: input?.sourceSlug,
    category: input?.category ?? 'custom',
    trait: input?.trait ?? 'agility',
    range: input?.range ?? 'Melee',
    damageFormula: input?.damageFormula ?? '1d8',
    damageType: input?.damageType ?? 'physical',
    burden: input?.burden ?? null,
    featureText: input?.featureText ?? '',
    notes: input?.notes ?? ''
  };
}

export function createInventoryItem(input?: Partial<CharacterInventoryItem>): CharacterInventoryItem {
  const quantity = clamp(toSafeInteger(input?.quantity, 1), 0, 999);
  const useMax = input?.uses ? clamp(toSafeInteger(input.uses.max, 0), 0, 999) : 0;
  const uses = useMax > 0
    ? { current: clamp(toSafeInteger(input?.uses?.current, useMax), 0, useMax), max: useMax }
    : undefined;
  return {
    id: input?.id ?? createId('item'),
    name: input?.name ?? 'Новый предмет',
    kind: input?.kind ?? 'custom',
    quantity,
    uses,
    text: input?.text ?? '',
    imageUrl: input?.imageUrl ?? null,
    sourceId: input?.sourceId,
    sourceSlug: input?.sourceSlug
  };
}

export function sanitizeInventory(items: unknown): CharacterInventoryItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is Partial<CharacterInventoryItem> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => createInventoryItem(item));
}

export function createDomainCard(input?: Partial<DomainCardRecord>): DomainCardRecord {
  return {
    id: input?.id ?? createId('card'),
    name: input?.name ?? 'Новая карта/способность',
    domain: input?.domain ?? 'Custom',
    level: input?.level ?? 1,
    cost: input?.cost ?? '',
    recallCost: input?.recallCost ?? '',
    text: input?.text ?? '',
    inLoadout: input?.permanentlyVaulted || input?.loadoutChoicePending ? false : input?.inLoadout ?? true,
    permanentlyVaulted: input?.permanentlyVaulted ?? false,
    loadoutChoicePending: !input?.permanentlyVaulted && Boolean(input?.loadoutChoicePending),
    imageUrl: input?.imageUrl ?? null,
    cardType: input?.cardType ?? '',
    sourceId: input?.sourceId,
    tokens: {
      value: clamp(toSafeInteger(input?.tokens?.value, 0), 0, clamp(toSafeInteger(input?.tokens?.max, 6), 0, 12)),
      max: clamp(toSafeInteger(input?.tokens?.max, 6), 0, 12)
    }
  };
}

function normalizeCharacterAdvancement(value: unknown): CharacterAdvancementState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { choiceUsesByRank: {}, markedTraits: [], multiclass: null };
  }
  const input = value as Partial<CharacterAdvancementState>;
  const markedTraits = Array.isArray(input.markedTraits)
    ? input.markedTraits.filter((trait): trait is keyof Character['traits'] => (
        trait === 'agility' || trait === 'strength' || trait === 'finesse' || trait === 'instinct' || trait === 'presence' || trait === 'knowledge'
      ))
    : [];
  const choiceUsesByRank: CharacterAdvancementState['choiceUsesByRank'] = {};
  const choices = ['traits', 'hp', 'stress', 'experience', 'domainCard', 'evasion', 'subclass', 'proficiency', 'multiclass'] as const;
  for (const rank of [2, 3, 4] as const) {
    const rawRank = input.choiceUsesByRank?.[rank];
    if (!rawRank || typeof rawRank !== 'object') continue;
    choiceUsesByRank[rank] = Object.fromEntries(choices.flatMap((choice) => {
      const count = clamp(toSafeInteger(rawRank[choice], 0), 0, 99);
      return count > 0 ? [[choice, count]] : [];
    }));
  }
  const multiclass = input.multiclass &&
    typeof input.multiclass === 'object' &&
    typeof input.multiclass.className === 'string' &&
    typeof input.multiclass.domain === 'string'
    ? input.multiclass
    : null;
  return {
    choiceUsesByRank,
    markedTraits: [...new Set(markedTraits)],
    multiclass
  };
}

export function createSheetCard(input?: Partial<CharacterSheetCard>): CharacterSheetCard {
  return {
    id: input?.id ?? createId('sheet_card'),
    kind: input?.kind ?? 'custom',
    name: input?.name ?? 'Новая карточка',
    subtitle: input?.subtitle ?? '',
    text: input?.text ?? '',
    imageUrl: input?.imageUrl ?? null,
    sourceId: input?.sourceId,
    subclassTier: input?.subclassTier
  };
}

export function createAdversary(input?: Partial<Adversary>): Adversary {
  const now = nowIso();
  const hp = input?.hp ?? { marked: 0, max: 4 };
  const conditions = syncAdversaryDefeatedCondition(input?.conditions ?? [], hp);
  return {
    id: input?.id ?? createId('adv'),
    sourceId: input?.sourceId,
    sourceSlug: input?.sourceSlug,
    sourceName: input?.sourceName,
    name: input?.name ?? 'Противник',
    summary: input?.summary ?? '',
    motives: input?.motives ?? '',
    mainBody: input?.mainBody ?? '',
    imageUrl: input?.imageUrl ?? null,
    tier: input?.tier ?? 1,
    type: input?.type ?? 'Standard',
    difficulty: input?.difficulty ?? 12,
    attackModifier: input?.attackModifier ?? 1,
    thresholds: input?.thresholds ?? { major: 7, severe: 12 },
    hp,
    stress: input?.stress ?? { marked: 0, max: 3 },
    standardAttack: input?.standardAttack ?? {
      name: 'Обычная атака',
      range: 'Вплотную',
      damageFormula: '1d8+2',
      damageType: 'physical'
    },
    hordePerHp: input?.hordePerHp ?? null,
    experiences: input?.experiences ?? [{ id: createId('advexp'), name: 'Острые чувства', modifier: 2 }],
    features: input?.features ?? [],
    conditions,
    notes: input?.notes ?? '',
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  };
}

function syncAdversaryDefeatedCondition(conditions: Adversary['conditions'], hp: Adversary['hp']): Adversary['conditions'] {
  const hasDefeated = conditions.some((condition) => normalizeStatusTag(condition.name) === ActorStatus.Defeated);
  if (hp.max > 0 && hp.marked >= hp.max) {
    return hasDefeated ? conditions : [{ id: createId('condition'), name: ActorStatus.Defeated }, ...conditions];
  }
  return conditions.filter((condition) => normalizeStatusTag(condition.name) !== ActorStatus.Defeated);
}

export function createCountdown(input?: Partial<Countdown>): Countdown {
  return {
    id: input?.id ?? createId('countdown'),
    name: input?.name ?? 'Отсчет',
    current: input?.current ?? 0,
    max: input?.max ?? 4,
    direction: input?.direction ?? 'up',
    visibility: input?.visibility ?? 'public',
    notes: input?.notes ?? ''
  };
}

export function createEncounterEnvironment(input?: Partial<EncounterEnvironment>): EncounterEnvironment {
  const now = nowIso();
  return {
    id: input?.id ?? createId('env'),
    sourceId: input?.sourceId,
    sourceSlug: input?.sourceSlug,
    sourceName: input?.sourceName,
    name: input?.name ?? 'Окружение',
    tier: input?.tier ?? 1,
    difficulty: input?.difficulty ?? 0,
    type: input?.type ?? 'environment',
    typeName: input?.typeName ?? 'Окружение',
    summary: input?.summary ?? '',
    body: input?.body ?? '',
    featureText: input?.featureText ?? '',
    impulses: input?.impulses ?? '',
    potentialAdversaries: input?.potentialAdversaries ?? '',
    imageUrl: input?.imageUrl ?? null,
    notes: input?.notes ?? '',
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  };
}

export function createEncounterState(): EncounterState {
  const now = nowIso();
  return {
    name: 'Новая сцена',
    status: 'prep',
    activeAdversaryId: null,
    adversaries: {},
    order: [],
    environments: {},
    countdowns: [],
    playerCount: 4,
    difficultyMode: 'standard',
    isDamageBoosted: false,
    isLowerTierUsed: false,
    battlePointBudget: 0,
    environmentNotes: '',
    updatedAt: now
  };
}

export function createUiState(): UiState {
  return {
    activeScreen: 'dashboard',
    sidebarCollapsed: false
  };
}

export function createSceneTableState(input?: Partial<SceneTableState>): SceneTableState {
  const scenes = input?.scenes
    ? Object.fromEntries(Object.entries(input.scenes).map(([id, scene]) => [id, createTableScene(scene)]))
    : undefined;
  const scene = input?.activeSceneId && scenes?.[input.activeSceneId]
    ? scenes[input.activeSceneId]
    : createTableScene();
  const liveSceneId = input?.liveSceneId && scenes?.[input.liveSceneId] ? input.liveSceneId : input?.activeSceneId ?? scene.id;
  const legacyMusicDeliveryMode = (scenes?.[liveSceneId] ?? scene).music.deliveryMode;
  return {
    schemaVersion: 4,
    musicDeliveryMode: input?.musicDeliveryMode === 'broadcast' || input?.musicDeliveryMode === 'download'
      ? input.musicDeliveryMode
      : legacyMusicDeliveryMode,
    activeSceneId: input?.activeSceneId ?? scene.id,
    liveSceneId,
    scenes: scenes ?? { [scene.id]: scene },
    sceneOrder: input?.sceneOrder ?? [scene.id],
    assets: input?.assets ?? {},
    participants: input?.participants ?? { 'local-gm': createLocalParticipant() },
    selectedTokenId: input?.selectedTokenId ?? null,
    updatedAt: input?.updatedAt ?? nowIso()
  };
}
