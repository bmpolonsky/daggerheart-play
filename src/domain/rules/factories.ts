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
import type {
  Adversary,
  GameState,
  GameHandout,
  Character,
  CharacterInventoryItem,
  CharacterSheetCard,
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

  const character: Character = {
    id: input?.id ?? createId('pc'),
    name: input?.name ?? 'Новый герой',
    playerName: input?.playerName ?? '',
    pronouns: input?.pronouns ?? '',
    portraitUrl: input?.portraitUrl ?? '',
    className,
    subclassName: input?.subclassName ?? '',
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
    domainCards: input?.domainCards ?? [],
    sheetCards: input?.sheetCards ?? [],
    inventory: sanitizeInventory(input?.inventory ?? [
      createInventoryItem({ name: 'Факел' }),
      createInventoryItem({ name: '50 футов веревки' }),
      createInventoryItem({ name: 'Основные припасы' })
    ]),
    conditions: input?.conditions ?? [],
    activeBeastform: input?.activeBeastform ?? null,
    rangerMark: input?.rangerMark ?? null,
    companion: input?.companion ? normalizeRangerCompanion(input.companion) : null,
    deathMove: input?.deathMove ?? null,
    scars: input?.scars ?? [],
    retirement: input?.retirement ?? null,
    notes: input?.notes ?? '',
    description: input?.description,
    backgroundAnswers: input?.backgroundAnswers ?? [],
    connections: input?.connections ?? [],
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  };

  return character;
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
    inLoadout: input?.inLoadout ?? true,
    imageUrl: input?.imageUrl ?? null,
    cardType: input?.cardType ?? '',
    sourceId: input?.sourceId,
    tokens: {
      value: clamp(toSafeInteger(input?.tokens?.value, 0), 0, clamp(toSafeInteger(input?.tokens?.max, 6), 0, 12)),
      max: clamp(toSafeInteger(input?.tokens?.max, 6), 0, 12)
    }
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
    hp: input?.hp ?? { marked: 0, max: 4 },
    stress: input?.stress ?? { marked: 0, max: 3 },
    standardAttack: input?.standardAttack ?? {
      name: 'Обычная атака',
      range: 'Вплотную',
      damageFormula: '1d8+2',
      damageType: 'physical'
    },
    experiences: input?.experiences ?? [{ id: createId('advexp'), name: 'Острые чувства', modifier: 2 }],
    features: input?.features ?? [],
    isDefeated: input?.isDefeated ?? false,
    notes: input?.notes ?? '',
    createdAt: input?.createdAt ?? now,
    updatedAt: now
  };
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
  return {
    schemaVersion: 4,
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
