import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { SessionStorageMigrationContext } from '../types';
import { V0_PLAYER_SEAT_STORAGE_PREFIX, readString, storageKeys } from '../shared';

export const v0ToV1PlayerSeatsMigration: MigrationStep<SessionStorageMigrationContext> = {
  id: 'app-session-storage:v0-to-v1-player-seats',
  run: (context) => {
    const v0SeatKeys = storageKeys(context.storage).filter((key) => key.startsWith(V0_PLAYER_SEAT_STORAGE_PREFIX));
    if (v0SeatKeys.length === 0) return context;
    const seats = { ...context.state.p2p?.seats };
    for (const key of v0SeatKeys) {
      const roomId = key.slice(V0_PLAYER_SEAT_STORAGE_PREFIX.length);
      const seatId = readString(context.storage, key);
      if (roomId && seatId && !seats[roomId]) {
        seats[roomId] = seatId;
      }
    }
    return {
      ...context,
      state: {
        ...context.state,
        p2p: {
          ...context.state.p2p,
          seats
        }
      },
      migrated: true
    };
  }
};
