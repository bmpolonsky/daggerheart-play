import { runVersionedMigrations } from '../migration-runner';
import type { PersistedState } from '../../rules/types';
import type { PersistedStateMigration } from './types';
import { v4ToV5PersistedStateMigration } from './v4-to-v5-persisted-state-migration';
import { createCharacter, createSceneTableState } from '../../rules/factories';

export { migrateV4ToV5PersistedState } from './v4-to-v5-persisted-state-migration';
export type { PersistedStateMigration } from './types';

const persistedStateMigrations: readonly PersistedStateMigration[] = [
  v4ToV5PersistedStateMigration
];

const PERSISTED_STATE_V4_VERSION = 4;
export const CURRENT_PERSISTED_STATE_VERSION = 5;

export function migratePersistedState(state: unknown): PersistedState {
  if (!isPersistedStatePayload(state)) {
    throw new Error('Unsupported persisted state payload.');
  }
  const migrated = runVersionedMigrations(state, persistedStateMigrations, {
    from: state.schemaVersion,
    to: CURRENT_PERSISTED_STATE_VERSION
  });
  if (!isPersistedStateContract(migrated)) {
    throw new Error('Unsupported persisted state payload.');
  }
  return normalizePersistedCharacters(migrated);
}

export function canMigratePersistedState(value: unknown): boolean {
  if (!isPersistedStatePayload(value)) return false;
  return value.schemaVersion === CURRENT_PERSISTED_STATE_VERSION
    ? isPersistedStateContract(value)
    : true;
}

function isPersistedStatePayload(value: unknown): value is { schemaVersion: 4 | 5 } {
  return Boolean(
    isRecord(value) &&
    (
      value.schemaVersion === PERSISTED_STATE_V4_VERSION ||
      value.schemaVersion === CURRENT_PERSISTED_STATE_VERSION
    ) &&
    'game' in value &&
    'characters' in value &&
    'encounter' in value &&
    'rollLog' in value &&
    'feed' in value &&
    'ui' in value &&
    'sceneTable' in value
  );
}

export function isPersistedStateContract(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== CURRENT_PERSISTED_STATE_VERSION) return false;
  if (!isRecord(value.game) || !Array.isArray(value.game.handouts)) return false;
  if (!isRecord(value.characters) || !isRecord(value.characters.entities) || !Array.isArray(value.characters.order)) return false;
  for (const character of Object.values(value.characters.entities)) {
    if (!isRecord(character)) return false;
    if (typeof character.portraitUrl !== 'string') return false;
    if (!Array.isArray(character.domainCards) || !Array.isArray(character.sheetCards) || !Array.isArray(character.inventory)) return false;
    if (!character.domainCards.every(isRecord) || !character.sheetCards.every(isRecord) || !character.inventory.every(isRecord)) return false;
  }
  if (!isRecord(value.encounter) || !isRecord(value.encounter.adversaries) || !isRecord(value.encounter.environments)) return false;
  if (!Array.isArray(value.encounter.countdowns)) return false;
  for (const countdown of value.encounter.countdowns) {
    if (!isRecord(countdown) || (countdown.visibility !== 'public' && countdown.visibility !== 'gm')) return false;
  }
  for (const adversary of Object.values(value.encounter.adversaries)) {
    if (!isRecord(adversary)) return false;
    if (typeof adversary.summary !== 'string' || typeof adversary.motives !== 'string' || typeof adversary.mainBody !== 'string') return false;
    if (adversary.imageUrl !== null && typeof adversary.imageUrl !== 'string') return false;
    if (!isRecord(adversary.hp) || !isRecord(adversary.stress) || !isRecord(adversary.standardAttack)) return false;
  }
  for (const environment of Object.values(value.encounter.environments)) {
    if (!isRecord(environment)) return false;
    if (environment.imageUrl !== null && typeof environment.imageUrl !== 'string') return false;
  }
  if (!Array.isArray(value.rollLog) || !Array.isArray(value.feed)) return false;
  if (!isRecord(value.ui)) return false;
  if (!isRecord(value.sceneTable) || !isRecord(value.sceneTable.scenes) || !Array.isArray(value.sceneTable.sceneOrder)) return false;
  for (const scene of Object.values(value.sceneTable.scenes)) {
    if (!isRecord(scene)) return false;
    if (typeof scene.backgroundUrl !== 'string' || !Array.isArray(scene.layers) || !Array.isArray(scene.tokens)) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function normalizePersistedCharacters(state: PersistedState): PersistedState {
  return {
    ...state,
    sceneTable: createSceneTableState(state.sceneTable),
    characters: {
      ...state.characters,
      entities: Object.fromEntries(Object.entries(state.characters.entities).map(([id, character]) => [
        id,
        createCharacter({ ...character, id })
      ]))
    }
  };
}
