import type { GameDocument } from '../../../../domain/game/gameDocument';
import type { ProjectDocument } from '../../gameDocumentStore';

export interface GameDocumentStoreMigrationContext {
  value: unknown;
  isProjectDocument(value: unknown): value is ProjectDocument;
  projectFromGameDocument(document: GameDocument): ProjectDocument;
  toGameDocument(value: unknown): GameDocument;
}
