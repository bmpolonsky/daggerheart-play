import { runMigrationSteps } from '../../../../domain/migrations/migration-runner';
import type { PersistedState } from '../../../../domain/rules/types';
import type { ProjectDocument } from '../../gameDocumentStore';
import { migrateV0ToV5GameField } from './v0-to-v5-game-field-migration';
import { v0ToV2ProjectLibraryMigration } from './v0-to-v2-project-library-migration';
import { v0ToV2ProjectSingleDocumentMigration } from './v0-to-v2-project-single-document-migration';
import { v1ToV2ProjectSharedContentMigration } from './v1-to-v2-project-shared-content-migration';
import { v2ProjectIndexConsistencyMigration } from './v2-project-index-consistency-migration';
import type { GameDocumentStoreMigrationContext } from './types';

export { deleteV0ProjectDocuments as deletePreviousProjectDocuments, readV0ProjectDocument as readPreviousProjectDocument } from './v0-indexeddb-project-storage';

export function prepareProjectDocument(value: unknown, context: Omit<GameDocumentStoreMigrationContext, 'value'>): ProjectDocument {
  const result = runMigrationSteps<GameDocumentStoreMigrationContext>(
    { ...context, value },
    [
      v1ToV2ProjectSharedContentMigration(),
      v0ToV2ProjectLibraryMigration(),
      v0ToV2ProjectSingleDocumentMigration(),
      v2ProjectIndexConsistencyMigration()
    ]
  ).value;
  if (!context.isProjectDocument(result)) {
    throw new Error('Game document store migration did not produce a project document.');
  }
  return result;
}

export function prepareStoredGameState(value: unknown): PersistedState {
  return migrateV0ToV5GameField(value);
}
