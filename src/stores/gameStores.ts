import { ReactiveStore } from '../core/store/ReactiveStore';
import {
  createGameState,
  createEncounterState,
  createSceneTableState,
  createUiState
} from '../domain/rules/factories';
import type { GameState, CharactersState, EncounterState, FeedEntry, RollLogEntry, SceneTableState, UiState } from '../domain/rules/types';
import { nowIso } from '../core/utils/date';

export function createCharactersState(): CharactersState {
  return {
    entities: {},
    order: [],
    selectedId: null,
    updatedAt: nowIso()
  };
}

export const gameStore = new ReactiveStore<GameState>(createGameState());
export const charactersStore = new ReactiveStore<CharactersState>(createCharactersState());
export const encounterStore = new ReactiveStore<EncounterState>(createEncounterState());
export const rollLogStore = new ReactiveStore<RollLogEntry[]>([]);
export const feedStore = new ReactiveStore<FeedEntry[]>([]);
export const uiStore = new ReactiveStore<UiState>(createUiState());
export const sceneTableStore = new ReactiveStore<SceneTableState>(createSceneTableState());

export const syncedGameStores = {
  game: gameStore,
  characters: charactersStore,
  encounter: encounterStore,
  rollLog: rollLogStore,
  feed: feedStore,
  ui: uiStore,
  sceneTable: sceneTableStore
} as const;

export function subscribeToSyncedGameStores(listener: () => void): Array<() => void> {
  return Object.values(syncedGameStores).map((store) => store.subscribe(listener));
}

export function resetAllStores(): void {
  gameStore.reset(createGameState());
  charactersStore.reset(createCharactersState());
  encounterStore.reset(createEncounterState());
  rollLogStore.reset([]);
  feedStore.reset([]);
  uiStore.reset(createUiState());
  sceneTableStore.reset(createSceneTableState());
}
