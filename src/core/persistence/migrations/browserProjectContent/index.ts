import type { BrowserCustomContentDocument } from './v0-to-v1-custom-content-document-migration';
import { migrateV0ToV1CustomContentDocument } from './v0-to-v1-custom-content-document-migration';

export type { BrowserCustomContentDocument } from './v0-to-v1-custom-content-document-migration';

export function prepareCustomContentDocument(document: Partial<BrowserCustomContentDocument> | null | undefined): BrowserCustomContentDocument {
  return migrateV0ToV1CustomContentDocument(document);
}
