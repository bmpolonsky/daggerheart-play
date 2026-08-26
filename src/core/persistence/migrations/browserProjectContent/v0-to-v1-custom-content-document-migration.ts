import { normalizeGameCustomContent, type GameCustomContent } from '../../../../domain/game/gameDocument';

export type BrowserCustomContentDocument = GameCustomContent;

export function migrateV0ToV1CustomContentDocument(
  document: Partial<BrowserCustomContentDocument> | null | undefined
): BrowserCustomContentDocument {
  return normalizeGameCustomContent(document);
}
