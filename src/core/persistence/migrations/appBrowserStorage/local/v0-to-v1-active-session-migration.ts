import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { LocalStorageMigrationContext } from '../types';
import { V0_ACTIVE_SESSION_STORAGE_KEY, readJson, toStoredP2PSession } from '../shared';

export const v0ToV1ActiveSessionMigration: MigrationStep<LocalStorageMigrationContext> = {
  id: 'app-local-storage:v0-to-v1-active-session',
  run: (context) => {
    const activeSession = toStoredP2PSession(readJson(context.storage, V0_ACTIVE_SESSION_STORAGE_KEY));
    if (!activeSession) return context;
    return {
      ...context,
      state: {
        ...context.state,
        p2p: {
          ...context.state.p2p,
          activeSession: context.state.p2p?.activeSession ?? activeSession
        }
      },
      migrated: true
    };
  }
};
