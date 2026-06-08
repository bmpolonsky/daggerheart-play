import type { MigrationStep } from '../../../../../domain/migrations/migration-runner';
import type { LocalStorageMigrationContext } from '../types';
import { V0_INVITE_DRAFT_STORAGE_KEY, readJson, toStoredP2PInviteDraft } from '../shared';

export const v0ToV1InviteDraftMigration: MigrationStep<LocalStorageMigrationContext> = {
  id: 'app-local-storage:v0-to-v1-invite-draft',
  run: (context) => {
    const inviteDraft = toStoredP2PInviteDraft(readJson(context.storage, V0_INVITE_DRAFT_STORAGE_KEY));
    if (!inviteDraft) return context;
    return {
      ...context,
      state: {
        ...context.state,
        p2p: {
          ...context.state.p2p,
          inviteDraft: context.state.p2p?.inviteDraft ?? inviteDraft
        }
      },
      migrated: true
    };
  }
};
