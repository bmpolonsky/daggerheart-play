import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { SessionStorageMigrationContext } from '../types';
import { V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY, readNumber, readString } from '../shared';

export const v0ToV1RoomCodeRefreshBlockMigration: MigrationStep<SessionStorageMigrationContext> = {
  id: 'app-session-storage:v0-to-v1-room-code-refresh-block',
  run: (context) => {
    const blockedUntil = readNumber(context.storage, V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY);
    if (blockedUntil > Date.now()) {
      return {
        ...context,
        state: {
          ...context.state,
          p2p: {
            ...context.state.p2p,
            roomCodeRefreshBlockedUntil: context.state.p2p?.roomCodeRefreshBlockedUntil ?? blockedUntil
          }
        },
        migrated: true
      };
    }
    return readString(context.storage, V0_ROOM_CODE_REFRESH_BLOCKED_UNTIL_STORAGE_KEY) !== null
      ? { ...context, migrated: true }
      : context;
  }
};
