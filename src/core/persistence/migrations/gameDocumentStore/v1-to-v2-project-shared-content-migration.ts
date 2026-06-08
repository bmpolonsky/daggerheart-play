import { emptyCustomContent, type GameCustomContent } from '../../../../domain/game/gameDocument';
import type { MigrationStep } from '../../../../domain/migrations/migration-runner';
import type { ProjectDocument } from '../../gameDocumentStore';
import type { GameDocumentStoreMigrationContext } from './types';

type ProjectDocumentV1 = Omit<ProjectDocument, 'version' | 'shared'> & {
  version: 1;
  shared: Omit<ProjectDocument['shared'], 'participants' | 'customContent'> & {
    participants?: ProjectDocument['shared']['participants'];
    customContent?: GameCustomContent;
  };
};

export function v1ToV2ProjectSharedContentMigration(): MigrationStep<GameDocumentStoreMigrationContext> {
  return {
    id: 'game-document-store:v1-to-v2-project-shared-content',
    run: (context) => ({
      ...context,
      value: isProjectDocumentV1(context.value)
        ? {
          ...context.value,
          version: 2,
          shared: {
            characters: context.value.shared.characters,
            participants: context.value.shared.participants ?? {},
            customContent: context.value.shared.customContent ?? emptyCustomContent()
          }
        } satisfies ProjectDocument
        : context.value
    })
  };
}

function isProjectDocumentV1(value: unknown): value is ProjectDocumentV1 {
  if (!isRecord(value) || !isRecord(value.shared)) {
    return false;
  }
  return Boolean(
    value.kind === 'daggerheart-play:project' &&
    value.version === 1 &&
    isRecord(value.games) &&
    Array.isArray(value.order)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
