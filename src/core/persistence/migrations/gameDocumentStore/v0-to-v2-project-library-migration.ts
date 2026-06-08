import type { MigrationStep } from '../../../../domain/migrations/migration-runner';
import { emptyCustomContent, gameDocumentCustomContent, gameDocumentToPersistedState } from '../../../../domain/game/gameDocument';
import type { GameCustomContent, GameDocument } from '../../../../domain/game/gameDocument';
import type { PersistedState, SceneTableState } from '../../../../domain/rules/types';
import { createId } from '../../../utils/id';
import type { ProjectDocument, ProjectGameRecord } from '../../gameDocumentStore';
import type { GameDocumentStoreMigrationContext } from './types';

interface V0GameDocumentLibrary {
  kind: 'daggerheart-play:game-library';
  version: 1;
  activeGameId: string | null;
  order: string[];
  games: Record<string, {
    id: string;
    document: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
}

export function v0ToV2ProjectLibraryMigration(): MigrationStep<GameDocumentStoreMigrationContext> {
  return {
    id: 'game-document-store:v0-to-v2-project-library',
    run: (context) => ({
      ...context,
      value: isV0GameDocumentLibrary(context.value)
        ? projectFromV0GameLibrary(context.value, context.toGameDocument)
        : context.value
    })
  };
}

function projectFromV0GameLibrary(library: V0GameDocumentLibrary, toGameDocument: (value: unknown) => GameDocument): ProjectDocument {
  const records = library.order
    .map((id) => library.games[id])
    .filter((record): record is V0GameDocumentLibrary['games'][string] => Boolean(record));
  const fallbackRecords = Object.values(library.games).filter((record) => !records.some((item) => item.id === record.id));
  const orderedRecords = [...records, ...fallbackRecords];
  const activeRecord = orderedRecords.find((record) => record.id === library.activeGameId) ?? orderedRecords[0] ?? null;
  const states = orderedRecords.map((record) => ({ record, document: toGameDocument(record.document) }));
  const activeDocumentValue = activeRecord ? toGameDocument(activeRecord.document) : states[0]?.document ?? null;
  const activeState = activeDocumentValue ? gameDocumentToPersistedState(activeDocumentValue) : null;
  const now = activeRecord?.updatedAt ?? new Date().toISOString();
  const shared = activeState
    ? mergeSharedState(states.map(({ document }) => gameDocumentToPersistedState(document)), activeState, gameDocumentCustomContent(activeDocumentValue))
    : {
      characters: { entities: {}, order: [], selectedId: null, updatedAt: now },
      participants: {},
      customContent: emptyCustomContent()
    };
  const games = Object.fromEntries(states.map(({ record, document }) => {
    const state = gameDocumentToPersistedState(document);
    return [record.id, gameRecordFromState(record.id, state, record)];
  }));
  const order = orderedRecords.map((record) => record.id).filter((id) => Boolean(games[id]));
  return {
    kind: 'daggerheart-play:project',
    version: 2,
    project: {
      id: createId('project'),
      name: '',
      createdAt: activeRecord?.createdAt ?? now,
      updatedAt: activeRecord?.updatedAt ?? now
    },
    shared,
    activeGameId: activeRecord?.id ?? order[0] ?? null,
    order,
    games
  };
}

function gameRecordFromState(id: string, state: PersistedState, previous?: Pick<ProjectGameRecord, 'createdAt'>): ProjectGameRecord {
  const updatedAt = state.game.updatedAt || state.sceneTable.updatedAt || new Date().toISOString();
  return {
    id,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    state: {
      game: state.game,
      encounter: state.encounter,
      rollLog: state.rollLog,
      feed: state.feed,
      ui: state.ui,
      sceneTable: stripParticipants(state.sceneTable)
    }
  };
}

function mergeSharedState(states: PersistedState[], activeState: PersistedState, customContent: GameCustomContent): ProjectDocument['shared'] {
  const order = Array.from(new Set([...activeState.characters.order, ...states.flatMap((state) => state.characters.order)]));
  const entities = Object.assign({}, ...states.map((state) => state.characters.entities), activeState.characters.entities);
  const participants = Object.assign({}, ...states.map((state) => state.sceneTable.participants), activeState.sceneTable.participants);
  return {
    characters: {
      entities,
      order: order.filter((id) => Boolean(entities[id])),
      selectedId: activeState.characters.selectedId,
      updatedAt: activeState.characters.updatedAt
    },
    participants,
    customContent
  };
}

function stripParticipants(sceneTable: SceneTableState): Omit<SceneTableState, 'participants'> {
  const { participants: _participants, ...gameSceneTable } = sceneTable;
  return gameSceneTable;
}

function isV0GameDocumentLibrary(value: unknown): value is V0GameDocumentLibrary {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'daggerheart-play:game-library' &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { games?: unknown }).games === 'object' &&
    Array.isArray((value as { order?: unknown }).order)
  );
}
