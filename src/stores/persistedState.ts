import type { Adversary, Countdown, EncounterEnvironment, GameState, CharacterBeastformState, CharacterCompanionState, CharacterScar, CharactersState, EncounterState, PersistedState, SceneTableState } from '../domain/rules/types';
import { createAdversary, createCountdown, createGameState, createCharacter, createDomainCard, createEncounterEnvironment, createEncounterState, createSceneTableState, sanitizeInventory } from '../domain/rules/factories';
import { normalizeRangerCompanion } from '../domain/rules/rangerCompanion';
import { syncedGameStores } from './gameStores';

export function snapshotPersistedState(): PersistedState {
  return {
    schemaVersion: 4,
    game: syncedGameStores.game.get(),
    characters: syncedGameStores.characters.get(),
    encounter: syncedGameStores.encounter.get(),
    rollLog: syncedGameStores.rollLog.get(),
    feed: syncedGameStores.feed.get(),
    ui: syncedGameStores.ui.get(),
    sceneTable: syncedGameStores.sceneTable.get()
  };
}

export function hydratePersistedState(state: PersistedState): void {
  const normalized = normalizePersistedState(state);
  syncedGameStores.game.reset(normalized.game);
  syncedGameStores.characters.reset(normalized.characters);
  syncedGameStores.encounter.reset(normalized.encounter);
  syncedGameStores.rollLog.reset(normalized.rollLog);
  syncedGameStores.feed.reset(normalized.feed);
  syncedGameStores.ui.reset(normalized.ui);
  syncedGameStores.sceneTable.reset(normalized.sceneTable);
}

export function normalizePersistedState(state: PersistedState): PersistedState {
  return {
    ...state,
    schemaVersion: 4,
    game: normalizeGameState(state.game),
    characters: normalizeCharactersState(state.characters),
    encounter: normalizeEncounterState(state.encounter),
    feed: Array.isArray(state.feed) ? state.feed : [],
    sceneTable: normalizeSceneTableState(state.sceneTable)
  };
}

function normalizeCharactersState(characters: CharactersState): CharactersState {
  return {
    ...characters,
    entities: Object.fromEntries(Object.entries(characters.entities).map(([id, character]) => {
      return [
        id,
        createCharacter({
          ...character,
          id: character.id || id,
          activeBeastform: normalizeCharacterBeastform(character.activeBeastform),
          companion: normalizeCharacterCompanion(character.companion),
          rangerMark: character.rangerMark ?? null,
          scars: normalizeCharacterScars(character.scars),
          domainCards: character.domainCards.map((card) => createDomainCard(card)),
          inventory: sanitizeInventory(character.inventory)
        })
      ];
    }))
  };
}

function normalizeCharacterScars(value: CharacterScar[] | null | undefined): CharacterScar[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((scar) => {
    if (!scar || typeof scar !== 'object' || typeof scar.id !== 'string') return [];
    return {
      id: scar.id,
      description: typeof scar.description === 'string' && scar.description.trim() ? scar.description : 'Scar',
      createdAt: typeof scar.createdAt === 'string' ? scar.createdAt : new Date(0).toISOString()
    };
  });
}

function normalizeCharacterCompanion(value: CharacterCompanionState | null | undefined): CharacterCompanionState | null {
  if (!value || typeof value !== 'object') return null;
  try {
    return normalizeRangerCompanion(value);
  } catch {
    return null;
  }
}

function normalizeCharacterBeastform(value: CharacterBeastformState | null | undefined): CharacterBeastformState | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.slug !== 'string' || typeof value.name !== 'string') return null;
  return {
    ...value,
    sourceId: value.sourceId,
    level: typeof value.level === 'number' ? value.level : null,
    evolutionTrait: value.evolutionTrait ?? null,
    featureText: typeof value.featureText === 'string' ? value.featureText : '',
    activatedAt: typeof value.activatedAt === 'string' ? value.activatedAt : new Date(0).toISOString()
  };
}

export function isPersistedState(value: unknown): value is PersistedState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PersistedState>;
  return (
    candidate.schemaVersion === 4 &&
    Boolean(candidate.game) &&
    Boolean(candidate.characters) &&
    Boolean(candidate.encounter) &&
    Boolean(candidate.feed) &&
    Boolean(candidate.sceneTable)
  );
}

function normalizeGameState(game: GameState): GameState {
  const base = createGameState();
  return {
    ...base,
    ...game,
    presentedHandoutId: game.handouts?.some((handout) => handout.id === game.presentedHandoutId) ? game.presentedHandoutId : null,
    handouts: Array.isArray(game.handouts) ? game.handouts : base.handouts
  };
}

function normalizeEncounterState(encounter: EncounterState): EncounterState {
  const base = createEncounterState();
  const adversaries = Object.fromEntries(
    Object.entries(encounter.adversaries ?? {})
      .map(([id, adversary]) => [id, normalizeAdversaryState(id, adversary)])
      .filter((entry): entry is [string, Adversary] => Boolean(entry[1]))
  );
  const environments = Object.fromEntries(
    Object.entries(encounter.environments ?? {})
      .map(([id, environment]) => [id, normalizeEncounterEnvironmentState(id, environment)])
      .filter((entry): entry is [string, EncounterEnvironment] => Boolean(entry[1]))
  );
  return {
    ...base,
    ...encounter,
    adversaries,
    order: Array.isArray(encounter.order) ? encounter.order.filter((id) => Boolean(adversaries[id])) : base.order,
    activeAdversaryId: encounter.activeAdversaryId && adversaries[encounter.activeAdversaryId] ? encounter.activeAdversaryId : null,
    environments,
    countdowns: Array.isArray(encounter.countdowns) ? encounter.countdowns.map(normalizeCountdownState) : base.countdowns,
    playerCount: typeof encounter.playerCount === 'number' ? encounter.playerCount : base.playerCount,
    difficultyMode:
      encounter.difficultyMode === 'easy' || encounter.difficultyMode === 'standard' || encounter.difficultyMode === 'hard'
        ? encounter.difficultyMode
        : base.difficultyMode,
    isDamageBoosted: typeof encounter.isDamageBoosted === 'boolean' ? encounter.isDamageBoosted : base.isDamageBoosted,
    isLowerTierUsed: typeof encounter.isLowerTierUsed === 'boolean' ? encounter.isLowerTierUsed : base.isLowerTierUsed
  };
}

function normalizeCountdownState(countdown: Countdown): Countdown {
  return createCountdown({
    ...countdown,
    visibility: countdown.visibility === 'gm' ? 'gm' : 'public'
  });
}

function normalizeAdversaryState(id: string, adversary: Adversary | undefined): Adversary | null {
  if (!adversary || typeof adversary !== 'object') {
    return null;
  }
  const base = createAdversary({ id });
  const conditions = Array.isArray(adversary.conditions) ? adversary.conditions : base.conditions;
  return {
    ...base,
    ...adversary,
    id: typeof adversary.id === 'string' && adversary.id ? adversary.id : id,
    sourceId: adversary.sourceId,
    sourceSlug: typeof adversary.sourceSlug === 'string' ? adversary.sourceSlug : undefined,
    sourceName: typeof adversary.sourceName === 'string' ? adversary.sourceName : undefined,
    summary: typeof adversary.summary === 'string' ? adversary.summary : '',
    motives: typeof adversary.motives === 'string' ? adversary.motives : '',
    mainBody: typeof adversary.mainBody === 'string' ? adversary.mainBody : '',
    imageUrl: typeof adversary.imageUrl === 'string' ? adversary.imageUrl : null,
    thresholds: adversary.thresholds ?? base.thresholds,
    hp: adversary.hp ?? base.hp,
    stress: adversary.stress ?? base.stress,
    standardAttack: adversary.standardAttack ?? base.standardAttack,
    experiences: Array.isArray(adversary.experiences) ? adversary.experiences : base.experiences,
    features: Array.isArray(adversary.features) ? adversary.features : base.features,
    conditions,
    notes: typeof adversary.notes === 'string' ? adversary.notes : '',
    createdAt: typeof adversary.createdAt === 'string' ? adversary.createdAt : base.createdAt,
    updatedAt: typeof adversary.updatedAt === 'string' ? adversary.updatedAt : base.updatedAt
  };
}

function normalizeEncounterEnvironmentState(id: string, environment: EncounterEnvironment | undefined): EncounterEnvironment | null {
  if (!environment || typeof environment !== 'object') {
    return null;
  }
  const base = createEncounterEnvironment({ id });
  return {
    ...base,
    ...environment,
    id: typeof environment.id === 'string' && environment.id ? environment.id : id,
    sourceId: environment.sourceId,
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

function normalizeSceneTableState(sceneTable: SceneTableState): SceneTableState {
  if (
    sceneTable.schemaVersion === 4 &&
    sceneTable.activeSceneId &&
    sceneTable.scenes?.[sceneTable.activeSceneId] &&
    Array.isArray(sceneTable.sceneOrder)
  ) {
    return createSceneTableState(sceneTable);
  }
  return createSceneTableState();
}
