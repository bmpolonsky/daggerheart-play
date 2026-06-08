import { CURRENT_PERSISTED_STATE_VERSION, migratePersistedState } from '../../../../domain/migrations/persistedState';
import type { PersistedState } from '../../../../domain/rules/types';

interface V0CampaignPersistedState {
  schemaVersion: number;
  campaign: unknown;
  characters: unknown;
  encounter: unknown;
  rollLog: unknown;
  feed: unknown;
  ui: unknown;
  sceneTable: unknown;
}

export function migrateV0ToV5GameField(value: unknown): PersistedState {
  if (isRecord(value) && 'game' in value) {
    return migratePersistedState(value);
  }
  if (!isV0CampaignPersistedState(value)) {
    throw new Error('Unsupported stored game state.');
  }
  return migratePersistedState({
    schemaVersion: value.schemaVersion === CURRENT_PERSISTED_STATE_VERSION ? CURRENT_PERSISTED_STATE_VERSION : 4,
    game: value.campaign,
    characters: value.characters,
    encounter: value.encounter,
    rollLog: value.rollLog,
    feed: value.feed,
    ui: value.ui,
    sceneTable: value.sceneTable
  });
}

function isV0CampaignPersistedState(value: unknown): value is V0CampaignPersistedState {
  return Boolean(
    isRecord(value) &&
    typeof value.schemaVersion === 'number' &&
    'campaign' in value &&
    'characters' in value &&
    'encounter' in value &&
    'rollLog' in value &&
    'feed' in value &&
    'ui' in value &&
    'sceneTable' in value
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
