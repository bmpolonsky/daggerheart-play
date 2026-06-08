import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { SessionStorageMigrationContext } from '../types';
import {
  V0_PLAYER_SEAT_STORAGE_PREFIX,
  V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY,
  removeKeys,
  storageKeys
} from '../shared';

export const v0ToV1CleanupSessionKeysMigration: MigrationStep<SessionStorageMigrationContext> = {
  id: 'app-session-storage:v0-to-v1-cleanup-keys',
  run: (context) => {
    if (!context.migrated) return context;
    removeKeys(context.storage, [
      V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY,
      ...storageKeys(context.storage).filter((key) => key.startsWith(V0_PLAYER_SEAT_STORAGE_PREFIX))
    ]);
    return context;
  }
};
