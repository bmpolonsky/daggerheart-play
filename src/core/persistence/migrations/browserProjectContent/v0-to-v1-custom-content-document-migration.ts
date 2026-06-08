import { emptyCustomContent, type GameCustomContent } from '../../../../domain/game/gameDocument';

export type BrowserCustomContentDocument = GameCustomContent;

export function migrateV0ToV1CustomContentDocument(
  document: Partial<BrowserCustomContentDocument> | null | undefined
): BrowserCustomContentDocument {
  if (!document || typeof document !== 'object') {
    return emptyCustomContent();
  }
  return {
    ancestries: Array.isArray(document.ancestries) ? document.ancestries : [],
    communities: Array.isArray(document.communities) ? document.communities : [],
    subclasses: Array.isArray(document.subclasses) ? document.subclasses : [],
    domainCards: Array.isArray(document.domainCards) ? document.domainCards : [],
    cardDomains: Array.isArray(document.cardDomains) ? document.cardDomains : [],
    adversaries: Array.isArray(document.adversaries) ? document.adversaries : []
  };
}
