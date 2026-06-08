import type { MigrationStep } from '../../../../domain/migrations/migration-runner';
import type { GameDocumentStoreMigrationContext } from './types';

export function v0ToV2ProjectSingleDocumentMigration(): MigrationStep<GameDocumentStoreMigrationContext> {
  return {
    id: 'game-document-store:v0-to-v2-project-single-document',
    run: (context) => ({
      ...context,
      value: context.isProjectDocument(context.value) || isProjectDocumentLike(context.value)
        ? context.value
        : context.projectFromGameDocument(context.toGameDocument(context.value))
    })
  };
}

function isProjectDocumentLike(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'daggerheart-play:project'
  );
}
