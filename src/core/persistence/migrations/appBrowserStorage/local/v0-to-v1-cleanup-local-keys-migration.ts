import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { LocalStorageMigrationContext } from '../types';
import {
  V0_ACTIVE_SESSION_STORAGE_KEY,
  V0_INVITE_DRAFT_STORAGE_KEY,
  V0_PRIVATE_ROLL_STORAGE_KEY,
  removeKeys
} from '../shared';

export const v0ToV1CleanupLocalKeysMigration: MigrationStep<LocalStorageMigrationContext> = {
  id: 'app-local-storage:v0-to-v1-cleanup-keys',
  run: (context) => {
    if (!context.migrated) return context;
    removeKeys(context.storage, [
      V0_ACTIVE_SESSION_STORAGE_KEY,
      V0_INVITE_DRAFT_STORAGE_KEY,
      V0_PRIVATE_ROLL_STORAGE_KEY
    ]);
    return context;
  }
};
