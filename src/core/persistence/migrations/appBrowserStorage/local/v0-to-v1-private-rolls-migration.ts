import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { LocalStorageMigrationContext } from '../types';
import { V0_PRIVATE_ROLL_STORAGE_KEY, readString } from '../shared';

export const v0ToV1PrivateRollsMigration: MigrationStep<LocalStorageMigrationContext> = {
  id: 'app-local-storage:v0-to-v1-private-rolls',
  run: (context) => {
    const privateRolls = readString(context.storage, V0_PRIVATE_ROLL_STORAGE_KEY);
    if (privateRolls === null) return context;
    return {
      ...context,
      state: {
        ...context.state,
        preferences: {
          ...context.state.preferences,
          privateRolls: context.state.preferences?.privateRolls ?? privateRolls === '1'
        }
      },
      migrated: true
    };
  }
};
