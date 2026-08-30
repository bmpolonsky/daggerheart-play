import { portablePublicAssetPath } from '../../content/publicAssets';
import type {
  Adversary,
  CharacterBeastformState,
  CharacterCompanionState,
  CharacterRangerMarkState,
  CharacterScar,
  CharactersState,
  Countdown,
  EncounterEnvironment,
  EncounterState,
  FeedEntry,
  GameState,
  PersistedState,
  SceneTableState
} from '../../rules/types';
import {
  createAdversary,
  createCharacter,
  createCountdown,
  createDomainCard,
  createEncounterEnvironment,
  createEncounterState,
  createGameState,
  createSceneTableState,
  createSheetCard,
  sanitizeInventory
} from '../../rules/factories';
import { normalizeRangerCompanion } from '../../rules/rangerCompanion';
import type { SceneLayer } from '../../tabletop/types';
import type { PersistedStateMigration } from './types';

type PersistedStateV4 = PersistedState & { schemaVersion: 4 };

export const v4ToV5PersistedStateMigration: PersistedStateMigration = {
  id: 'persisted-state:v4-to-v5',
  from: 4,
  to: 5,
  run: (state) => migrateV4ToV5PersistedState(state as PersistedStateV4)
};

export function migrateV4ToV5PersistedState(state: PersistedStateV4): PersistedState {
  return normalizePersistedPublicAssetUrls(normalizePersistedStateV4(state));
}

function normalizePersistedStateV4(state: PersistedStateV4): PersistedState {
  return {
    ...state,
    schemaVersion: 5,
    game: normalizeGameState(state.game),
    characters: normalizeCharactersState(state.characters),
    encounter: normalizeEncounterState(state.encounter),
    rollLog: Array.isArray(state.rollLog) ? state.rollLog : [],
    feed: Array.isArray(state.feed) ? state.feed : [],
    ui: isRecord(state.ui) ? state.ui as PersistedState['ui'] : { activeScreen: 'dashboard', sidebarCollapsed: false },
    sceneTable: normalizeSceneTableState(state.sceneTable)
  };
}

function normalizeGameState(game: unknown): GameState {
  const input = isRecord(game) ? game as Partial<GameState> : {};
  const base = createGameState();
  return {
    ...base,
    ...input,
    presentedHandoutId: typeof input.presentedHandoutId === 'string' &&
      Array.isArray(input.handouts) &&
      input.handouts.some((handout) => handout.id === input.presentedHandoutId)
      ? input.presentedHandoutId
      : null,
    handouts: Array.isArray(input.handouts) ? input.handouts : base.handouts
  };
}

function normalizeCharactersState(characters: unknown): CharactersState {
  const input = isRecord(characters) ? characters : {};
  const inputEntities = isRecord(input.entities) ? input.entities : {};
  const entities = Object.fromEntries(Object.entries(inputEntities).flatMap(([id, character]) => {
    if (!isRecord(character)) return [];
    return [[id, createCharacter({
      ...character,
      id: typeof character.id === 'string' && character.id ? character.id : id,
      activeBeastform: normalizeCharacterBeastform(character.activeBeastform),
      companion: normalizeCharacterCompanion(character.companion),
      rangerMark: normalizeRangerMark(character.rangerMark),
      scars: normalizeCharacterScars(character.scars),
      domainCards: Array.isArray(character.domainCards) ? character.domainCards.map((card) => createDomainCard(isRecord(card) ? card : {})) : [],
      sheetCards: Array.isArray(character.sheetCards) ? character.sheetCards.map((card) => createSheetCard(isRecord(card) ? card : {})) : [],
      inventory: sanitizeInventory(character.inventory)
    })]];
  }));
  const order = Array.isArray(input.order)
    ? input.order.filter((id): id is string => typeof id === 'string' && Boolean(entities[id]))
    : Object.keys(entities);
  return {
    entities,
    order,
    selectedId: typeof input.selectedId === 'string' && Boolean(entities[input.selectedId]) ? input.selectedId : null,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date(0).toISOString()
  };
}

function normalizeCharacterScars(value: unknown): CharacterScar[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((scar) => {
    if (!isRecord(scar) || typeof scar.id !== 'string') return [];
    return {
      id: scar.id,
      description: typeof scar.description === 'string' && scar.description.trim() ? scar.description : 'Scar',
      createdAt: typeof scar.createdAt === 'string' ? scar.createdAt : new Date(0).toISOString()
    };
  });
}

function normalizeCharacterCompanion(value: unknown): CharacterCompanionState | null {
  if (!isRecord(value)) return null;
  try {
    return normalizeRangerCompanion(value as unknown as CharacterCompanionState);
  } catch {
    return null;
  }
}

function normalizeRangerMark(value: unknown): CharacterRangerMarkState | null {
  if (!isRecord(value)) return null;
  if (value.targetKind !== 'character' && value.targetKind !== 'adversary') return null;
  if (typeof value.targetId !== 'string' || typeof value.targetName !== 'string' || typeof value.markedAt !== 'string') return null;
  return {
    targetKind: value.targetKind,
    targetId: value.targetId,
    targetName: value.targetName,
    markedAt: value.markedAt
  };
}

function normalizeCharacterBeastform(value: unknown): CharacterBeastformState | null {
  if (!isRecord(value)) return null;
  if (typeof value.slug !== 'string' || typeof value.name !== 'string') return null;
  return {
    ...value,
    sourceId: value.sourceId,
    level: typeof value.level === 'number' ? value.level : null,
    evolutionTrait: value.evolutionTrait ?? null,
    featureText: typeof value.featureText === 'string' ? value.featureText : '',
    activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : new Date(0).toISOString()
  } as CharacterBeastformState;
}

function normalizeEncounterState(encounter: unknown): EncounterState {
  const input = isRecord(encounter) ? encounter : {};
  const base = createEncounterState();
  const adversaries = Object.fromEntries(
    Object.entries(isRecord(input.adversaries) ? input.adversaries : {})
      .map(([id, adversary]) => [id, normalizeAdversaryState(id, adversary)])
      .filter((entry): entry is [string, Adversary] => Boolean(entry[1]))
  );
  const environments = Object.fromEntries(
    Object.entries(isRecord(input.environments) ? input.environments : {})
      .map(([id, environment]) => [id, normalizeEncounterEnvironmentState(id, environment)])
      .filter((entry): entry is [string, EncounterEnvironment] => Boolean(entry[1]))
  );
  return {
    ...base,
    ...input,
    adversaries,
    order: Array.isArray(input.order) ? input.order.filter((id) => typeof id === 'string' && Boolean(adversaries[id])) : base.order,
    activeAdversaryId: typeof input.activeAdversaryId === 'string' && adversaries[input.activeAdversaryId] ? input.activeAdversaryId : null,
    environments,
    countdowns: Array.isArray(input.countdowns) ? input.countdowns.map(normalizeCountdownState) : base.countdowns,
    playerCount: typeof input.playerCount === 'number' ? input.playerCount : base.playerCount,
    difficultyMode:
      input.difficultyMode === 'easy' || input.difficultyMode === 'standard' || input.difficultyMode === 'hard'
        ? input.difficultyMode
        : base.difficultyMode,
    isDamageBoosted: typeof input.isDamageBoosted === 'boolean' ? input.isDamageBoosted : base.isDamageBoosted,
    isLowerTierUsed: typeof input.isLowerTierUsed === 'boolean' ? input.isLowerTierUsed : base.isLowerTierUsed
  };
}

function normalizeCountdownState(countdown: unknown): Countdown {
  const input = isRecord(countdown) ? countdown : {};
  return createCountdown({
    ...input,
    visibility: input.visibility === 'gm' ? 'gm' : 'public'
  });
}

function normalizeAdversaryState(id: string, adversary: unknown): Adversary | null {
  if (!isRecord(adversary)) return null;
  const base = createAdversary({ id });
  const conditions = Array.isArray(adversary.conditions) ? adversary.conditions : base.conditions;
  return {
    ...base,
    ...adversary,
    id: typeof adversary.id === 'string' && adversary.id ? adversary.id : id,
    sourceId: normalizeSourceId(adversary.sourceId),
    sourceSlug: typeof adversary.sourceSlug === 'string' ? adversary.sourceSlug : undefined,
    sourceName: typeof adversary.sourceName === 'string' ? adversary.sourceName : undefined,
    summary: typeof adversary.summary === 'string' ? adversary.summary : '',
    motives: typeof adversary.motives === 'string' ? adversary.motives : '',
    mainBody: typeof adversary.mainBody === 'string' ? adversary.mainBody : '',
    imageUrl: typeof adversary.imageUrl === 'string' ? adversary.imageUrl : null,
    thresholds: isRecord(adversary.thresholds) ? adversary.thresholds as unknown as Adversary['thresholds'] : base.thresholds,
    hp: isRecord(adversary.hp) ? adversary.hp as unknown as Adversary['hp'] : base.hp,
    stress: isRecord(adversary.stress) ? adversary.stress as unknown as Adversary['stress'] : base.stress,
    standardAttack: isRecord(adversary.standardAttack) ? adversary.standardAttack as unknown as Adversary['standardAttack'] : base.standardAttack,
    experiences: Array.isArray(adversary.experiences) ? adversary.experiences : base.experiences,
    features: Array.isArray(adversary.features) ? adversary.features : base.features,
    conditions,
    notes: typeof adversary.notes === 'string' ? adversary.notes : '',
    createdAt: typeof adversary.createdAt === 'string' ? adversary.createdAt : base.createdAt,
    updatedAt: typeof adversary.updatedAt === 'string' ? adversary.updatedAt : base.updatedAt
  };
}

function normalizeEncounterEnvironmentState(id: string, environment: unknown): EncounterEnvironment | null {
  if (!isRecord(environment)) return null;
  const base = createEncounterEnvironment({ id });
  return {
    ...base,
    ...environment,
    id: typeof environment.id === 'string' && environment.id ? environment.id : id,
    sourceId: normalizeSourceId(environment.sourceId),
    sourceSlug: typeof environment.sourceSlug === 'string' ? environment.sourceSlug : undefined,
    sourceName: typeof environment.sourceName === 'string' ? environment.sourceName : undefined,
    name: typeof environment.name === 'string' && environment.name.trim() ? environment.name : base.name,
    tier: typeof environment.tier === 'number' ? environment.tier : base.tier,
    difficulty: typeof environment.difficulty === 'number' ? environment.difficulty : base.difficulty,
    type: typeof environment.type === 'string' ? environment.type : base.type,
    typeName: typeof environment.typeName === 'string' ? environment.typeName : base.typeName,
    summary: typeof environment.summary === 'string' ? environment.summary : '',
    body: typeof environment.body === 'string' ? environment.body : '',
    featureText: typeof environment.featureText === 'string' ? environment.featureText : '',
    impulses: typeof environment.impulses === 'string' ? environment.impulses : '',
    potentialAdversaries: typeof environment.potentialAdversaries === 'string' ? environment.potentialAdversaries : '',
    imageUrl: typeof environment.imageUrl === 'string' ? environment.imageUrl : null,
    notes: typeof environment.notes === 'string' ? environment.notes : '',
    createdAt: typeof environment.createdAt === 'string' ? environment.createdAt : base.createdAt,
    updatedAt: typeof environment.updatedAt === 'string' ? environment.updatedAt : base.updatedAt
  };
}

function normalizeSceneTableState(sceneTable: unknown): SceneTableState {
  if (
    isRecord(sceneTable) &&
    sceneTable.schemaVersion === 4 &&
    typeof sceneTable.activeSceneId === 'string' &&
    isRecord(sceneTable.scenes) &&
    isRecord(sceneTable.scenes[sceneTable.activeSceneId]) &&
    Array.isArray(sceneTable.sceneOrder)
  ) {
    return createSceneTableState(sceneTable);
  }
  return createSceneTableState();
}

export function normalizePersistedPublicAssetUrls(state: PersistedState): PersistedState {
  return {
    ...state,
    game: {
      ...state.game,
      handouts: state.game.handouts.map((handout) => ({
        ...handout,
        imageUrl: migrateNullableAssetUrl(handout.imageUrl)
      }))
    },
    characters: {
      ...state.characters,
      entities: Object.fromEntries(Object.entries(state.characters.entities).map(([id, character]) => [
        id,
        {
          ...character,
          portraitUrl: migrateAssetUrl(character.portraitUrl),
          companion: character.companion ? {
            ...character.companion,
            imageUrl: migrateOptionalAssetUrl(character.companion.imageUrl)
          } : character.companion,
          domainCards: character.domainCards.map((card) => ({
            ...card,
            imageUrl: migrateNullableAssetUrl(card.imageUrl)
          })),
          sheetCards: character.sheetCards.map((card) => ({
            ...card,
            imageUrl: migrateNullableAssetUrl(card.imageUrl)
          })),
          inventory: character.inventory.map((item) => ({
            ...item,
            imageUrl: migrateNullableAssetUrl(item.imageUrl)
          }))
        }
      ]))
    },
    encounter: {
      ...state.encounter,
      adversaries: Object.fromEntries(Object.entries(state.encounter.adversaries).map(([id, adversary]) => [
        id,
        {
          ...adversary,
          imageUrl: migrateRequiredNullableAssetUrl(adversary.imageUrl)
        }
      ])),
      environments: Object.fromEntries(Object.entries(state.encounter.environments).map(([id, environment]) => [
        id,
        {
          ...environment,
          imageUrl: migrateRequiredNullableAssetUrl(environment.imageUrl)
        }
      ]))
    },
    feed: state.feed.map(migrateFeedEntryAssetUrls),
    sceneTable: {
      ...state.sceneTable,
      scenes: Object.fromEntries(Object.entries(state.sceneTable.scenes).map(([id, scene]) => [
        id,
        {
          ...scene,
          backgroundUrl: migrateAssetUrl(scene.backgroundUrl),
          layers: scene.layers.map(migrateSceneLayerAssetUrl)
        }
      ]))
    }
  };
}

function migrateFeedEntryAssetUrls(entry: FeedEntry): FeedEntry {
  if (entry.type === 'card') {
    return {
      ...entry,
      card: {
        ...entry.card,
        imageUrl: migrateNullableAssetUrl(entry.card.imageUrl)
      }
    };
  }
  if (entry.type === 'handout') {
    return {
      ...entry,
      handout: {
        ...entry.handout,
        imageUrl: migrateNullableAssetUrl(entry.handout.imageUrl)
      }
    };
  }
  return entry;
}

function migrateSceneLayerAssetUrl(layer: SceneLayer): SceneLayer {
  return {
    ...layer,
    url: migrateOptionalAssetUrl(layer.url)
  };
}

function migrateRequiredNullableAssetUrl(value: string | null): string | null {
  return typeof value === 'string' ? migrateAssetUrl(value) : null;
}

function migrateNullableAssetUrl(value: string | null | undefined): string | null | undefined {
  return typeof value === 'string' ? migrateAssetUrl(value) : value;
}

function migrateOptionalAssetUrl(value: string | undefined): string | undefined {
  return typeof value === 'string' ? migrateAssetUrl(value) : undefined;
}

function migrateAssetUrl(value: string): string {
  if (!value || /^(blob:|data:|asset:)/i.test(value)) {
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    return portablePublicAssetPath(value);
  }
  return isStoredPublicImagePath(value) ? portablePublicAssetPath(value) : value;
}

function isStoredPublicImagePath(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0].replace(/^\.\//, '').replace(/^\/+/, '');
  return /^(?:image|daggerheart-play\/image)\/.+/i.test(path);
}

function normalizeSourceId(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
