import type { MigrationStep } from '../../../../domain/migrations/migration-runner';
import type { ProjectDocument } from '../../gameDocumentStore';
import type { GameDocumentStoreMigrationContext } from './types';

type ProjectDocumentV2IndexCandidate = Omit<ProjectDocument, 'activeGameId' | 'games' | 'order'> & {
  activeGameId: unknown;
  games: Record<string, unknown>;
  order: unknown[];
};

export function v2ProjectIndexConsistencyMigration(): MigrationStep<GameDocumentStoreMigrationContext> {
  return {
    id: 'game-document-store:v2-project-index-consistency',
    run: (context) => ({
      ...context,
      value: isProjectDocumentV2IndexCandidate(context.value)
        ? repairProjectIndexes(context.value)
        : context.value
    })
  };
}

function repairProjectIndexes(project: ProjectDocumentV2IndexCandidate): ProjectDocumentV2IndexCandidate {
  const games = Object.fromEntries(Object.entries(project.games).flatMap(([id, record]) => (
    isRecord(record) ? [[id, { ...record, id }]] : []
  )));
  const gameIds = Object.keys(games);
  const order = unique(project.order.filter((id): id is string => typeof id === 'string' && Boolean(games[id])));
  for (const id of gameIds) {
    if (!order.includes(id)) order.push(id);
  }
  return {
    ...project,
    games,
    activeGameId: typeof project.activeGameId === 'string' && Boolean(games[project.activeGameId])
      ? project.activeGameId
      : order[0] ?? null,
    order
  };
}

function isProjectDocumentV2IndexCandidate(value: unknown): value is ProjectDocumentV2IndexCandidate {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'daggerheart-play:project' &&
    (value as { version?: unknown }).version === 2 &&
    isRecord((value as { games?: unknown }).games) &&
    Array.isArray((value as { order?: unknown }).order)
  );
}

function unique<TValue>(values: TValue[]): TValue[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}
