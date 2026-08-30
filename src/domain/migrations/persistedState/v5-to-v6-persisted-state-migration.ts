import { createCharacter } from '../../rules/factories';
import type { PersistedState } from '../../rules/types';
import { backfillAutomaticUsageTrackers } from '../../rules/usageTrackers';
import type { PersistedStateMigration } from './types';

type PersistedStateV5 = PersistedState & { schemaVersion: 5 };

export const v5ToV6PersistedStateMigration: PersistedStateMigration = {
  id: 'persisted-state:v5-to-v6',
  from: 5,
  to: 6,
  run: (state) => migrateV5ToV6PersistedState(state as PersistedStateV5)
};

export function migrateV5ToV6PersistedState(state: PersistedStateV5): PersistedState {
  return {
    ...state,
    schemaVersion: 6,
    characters: {
      ...state.characters,
      entities: Object.fromEntries(Object.entries(state.characters.entities).map(([id, input]) => {
        const character = createCharacter({ ...input, id });
        return [id, { ...character, usageTrackers: backfillAutomaticUsageTrackers(character) }];
      }))
    }
  };
}
