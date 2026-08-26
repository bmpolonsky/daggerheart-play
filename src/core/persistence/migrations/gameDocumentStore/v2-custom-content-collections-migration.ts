import type { MigrationStep } from '../../../../domain/migrations/migration-runner';
import { normalizeGameCustomContent } from '../../../../domain/game/gameDocument';
import type { GameDocumentStoreMigrationContext } from './types';

export function v2CustomContentCollectionsMigration(): MigrationStep<GameDocumentStoreMigrationContext> {
  return {
    id: 'game-document-store:v2-custom-content-collections',
    run: (context) => ({
      ...context,
      value: normalizeProjectCustomContent(context.value)
    })
  };
}

function normalizeProjectCustomContent(value: unknown): unknown {
  if (!isRecord(value) || value.kind !== 'daggerheart-play:project' || value.version !== 2 || !isRecord(value.shared)) return value;
  const customContent = normalizeGameCustomContent(value.shared.customContent);
  return { ...value, shared: { ...value.shared, customContent } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
