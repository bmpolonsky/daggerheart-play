import type { PersistedState } from '../domain/rules/types';
import { canMigratePersistedState, CURRENT_PERSISTED_STATE_VERSION, migratePersistedState } from '../domain/migrations/persistedState';
import { syncedGameStores } from './gameStores';

export function snapshotPersistedState(): PersistedState {
  return {
    schemaVersion: CURRENT_PERSISTED_STATE_VERSION,
    game: syncedGameStores.game.get(),
    characters: syncedGameStores.characters.get(),
    encounter: syncedGameStores.encounter.get(),
    rollLog: syncedGameStores.rollLog.get(),
    feed: syncedGameStores.feed.get(),
    ui: syncedGameStores.ui.get(),
    sceneTable: syncedGameStores.sceneTable.get()
  };
}

export function hydratePersistedState(state: unknown): void {
  const migrated = migratePersistedState(state);
  syncedGameStores.game.reset(migrated.game);
  syncedGameStores.characters.reset(migrated.characters);
  syncedGameStores.encounter.reset(migrated.encounter);
  syncedGameStores.rollLog.reset(migrated.rollLog);
  syncedGameStores.feed.reset(migrated.feed);
  syncedGameStores.ui.reset(migrated.ui);
  syncedGameStores.sceneTable.reset(migrated.sceneTable);
}

export function isPersistedState(value: unknown): boolean {
  return canMigratePersistedState(value);
}
