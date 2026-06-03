import { loadBrowserCustomContent, readBrowserCustomContent } from '../core/persistence/browserProjectContent';
import { readZipEntries, writeZip, zipTextEntry, type ZipEntry, type ZipFileEntry } from '../core/archive/zip';
import { isPersistedState, normalizePersistedState, snapshotPersistedState } from '../stores/persistedState';
import {
  assetResourcePath,
  createGameDocument,
  isGameDocument,
  isLegacyGameArchive,
  gameDocumentToPersistedState,
  type GameDocument
} from '../domain/game/gameDocument';
import type { MapAsset } from '../domain/tabletop/types';
import type { PersistedState } from '../domain/rules/types';
import type { AssetService } from './AssetService';
import type { PersistenceService } from './PersistenceService';

export interface GameImportPreview {
  ok: boolean;
  message: string;
  schemaVersion: number | null;
  gameName: string;
  counts: {
    characters: number;
    scenes: number;
    adversaries: number;
    rollLog: number;
    handouts: number;
  };
}

export type GameDocumentReadResult =
  | { ok: true; document: GameDocument; entries: ZipEntry[] }
  | { ok: false; message: string };

export class ImportExportService {
  constructor(private assetService: AssetService | undefined, private persistenceService: Pick<PersistenceService, 'importGameDocument'>) {}

  exportJson(pretty = true): string {
    return this.exportGameJson(pretty);
  }

  exportGameJson(pretty = true): string {
    return JSON.stringify(this.buildGameDocument(), null, pretty ? 2 : 0);
  }

  exportArchiveJson(pretty = true): string {
    return this.exportGameJson(pretty);
  }

  downloadExport(filename = `daggerheart-${new Date().toISOString().slice(0, 10)}.json`): void {
    if (typeof window === 'undefined') {
      return;
    }
    const blob = new Blob([this.exportJson(true)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  async importFile(file: Blob): Promise<{ ok: true } | { ok: false; message: string }> {
    const result = await this.readGameDocumentFromFile(file);
    if (!result.ok) {
      return result;
    }
    await this.importGameAssets(result.document, result.entries);
    await this.persistenceService.importGameDocument(result.document);
    return { ok: true };
  }

  async exportGameBundle(): Promise<Blob> {
    await loadBrowserCustomContent();
    await this.assetService?.normalizeEmbeddedSceneAssets();
    const document = this.buildGameDocument();
    const jsonEntries: ZipFileEntry[] = Object.entries(document.files).map(([path, value]) => ({
      path,
      data: JSON.stringify(value, null, 2)
    }));
    const assetFiles = await this.assetService?.exportAssetFiles(document.files['resources/assets.json']) ?? [];
    const assetEntries: ZipFileEntry[] = assetFiles.map((file) => ({
      path: file.path,
      data: file.blob
    }));
    return writeZip([...jsonEntries, ...assetEntries]);
  }

  async downloadArchive(filename = `daggerheart-${new Date().toISOString().slice(0, 10)}.dhgame`): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    const blob = await this.exportGameBundle();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  async importJson(json: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const result = this.readGameDocumentFromJson(json);
    if (!result.ok) {
      return result;
    }
    await this.persistenceService.importGameDocument(result.document);
    return { ok: true };
  }

  async readGameDocumentFromFile(file: Blob): Promise<GameDocumentReadResult> {
    if (!looksLikeJsonFile(file)) {
      const bundleResult = await this.readGameBundleDocument(file).catch((error: unknown) => ({
        ok: false as const,
        message: error instanceof Error ? error.message : 'Не удалось прочитать архив игры.'
      }));
      if (bundleResult.ok) {
        return bundleResult;
      }
    }
    const text = await file.text();
    const jsonResult = this.readGameDocumentFromJson(text);
    if (jsonResult.ok || looksLikeJson(text)) {
      return jsonResult;
    }
    try {
      return await this.readGameBundleDocument(file);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Не удалось прочитать архив игры.' };
    }
  }

  async importGameBundle(file: Blob): Promise<{ ok: true } | { ok: false; message: string }> {
    const entries = await readZipEntries(file);
    const document = gameDocumentFromZipEntries(entries);
    if (!document) {
      return { ok: false, message: 'Архив не похож на папку игры Daggerheart Play.' };
    }
    await this.importGameAssets(document, entries);
    await this.persistenceService.importGameDocument(document);
    return { ok: true };
  }

  previewImportJson(json: string): GameImportPreview {
    try {
      const parsed = JSON.parse(json) as unknown;
      const document = parseImportPayload(parsed);
      if (!document) {
        return emptyPreview('Файл не похож на экспорт Daggerheart Play.', null);
      }
      return previewPersistedState(gameDocumentToPersistedState(document));
    } catch (error) {
      return emptyPreview(error instanceof Error ? error.message : 'Не удалось прочитать JSON.', null);
    }
  }

  private buildGameDocument(): GameDocument {
    return createGameDocument(snapshotPersistedState(), readBrowserCustomContent());
  }

  async importGameAssets(document: GameDocument, entries: ZipEntry[] = []): Promise<void> {
    if (!this.assetService) return;
    for (const asset of document.files['resources/assets.json']) {
      if (asset.storage !== 'indexeddb') continue;
      const path = assetResourcePath(asset);
      const entry = entries.find((item) => item.path === path);
      if (!entry) continue;
      await this.assetService.putAssetBlob(asset, new Blob([bytesToBlobPart(entry.bytes)], { type: asset.mimeType || 'application/octet-stream' }), { updateSceneTable: false });
    }
  }

  private readGameDocumentFromJson(json: string): GameDocumentReadResult {
    try {
      const parsed = JSON.parse(json) as unknown;
      const document = parseImportPayload(parsed);
      if (!document) {
        return { ok: false, message: 'Файл не похож на экспорт Daggerheart Play.' };
      }
      return { ok: true, document, entries: [] };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Не удалось прочитать JSON.' };
    }
  }

  private async readGameBundleDocument(file: Blob): Promise<GameDocumentReadResult> {
    const entries = await readZipEntries(file);
    const document = gameDocumentFromZipEntries(entries);
    if (!document) {
      return { ok: false, message: 'Архив не похож на папку игры Daggerheart Play.' };
    }
    return { ok: true, document, entries };
  }
}

function parseImportPayload(value: unknown): GameDocument | null {
  if (isGameDocument(value)) {
    return value;
  }
  if (isPersistedState(value)) {
    return createGameDocument(normalizePersistedState(value));
  }
  if (isLegacyGameArchive(value) && isPersistedState(value.document)) {
    const state = normalizePersistedState(value.document);
    return createGameDocument({
      ...state,
      sceneTable: {
        ...state.sceneTable,
        assets: {
          ...assetsById(value.assets),
          ...state.sceneTable.assets
        }
      }
    });
  }
  return null;
}

function assetsById(assets: MapAsset[]): Record<string, MapAsset> {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset]));
}

function gameDocumentFromZipEntries(entries: ZipEntry[]): GameDocument | null {
  const manifest = parseJsonEntry(entries, 'manifest.json');
  const document = {
    manifest,
    files: {
      'manifest.json': manifest,
      'data/game.json': parseJsonEntry(entries, 'data/game.json') ?? parseJsonEntry(entries, 'data/game.json'),
      'data/characters.json': parseJsonEntry(entries, 'data/characters.json'),
      'data/encounter.json': parseJsonEntry(entries, 'data/encounter.json'),
      'data/roll-log.json': parseJsonEntry(entries, 'data/roll-log.json'),
      'data/feed.json': parseJsonEntry(entries, 'data/feed.json'),
      'data/ui.json': parseJsonEntry(entries, 'data/ui.json'),
      'data/scene-table.json': parseJsonEntry(entries, 'data/scene-table.json'),
      'content/custom-ancestries.json': parseJsonEntry(entries, 'content/custom-ancestries.json') ?? [],
      'content/custom-communities.json': parseJsonEntry(entries, 'content/custom-communities.json') ?? [],
      'content/custom-subclasses.json': parseJsonEntry(entries, 'content/custom-subclasses.json') ?? [],
      'content/custom-domain-cards.json': parseJsonEntry(entries, 'content/custom-domain-cards.json') ?? [],
      'content/custom-card-domains.json': parseJsonEntry(entries, 'content/custom-card-domains.json') ?? [],
      'content/custom-adversaries.json': parseJsonEntry(entries, 'content/custom-adversaries.json') ?? [],
      'resources/assets.json': parseJsonEntry(entries, 'resources/assets.json') ?? []
    }
  };
  return isGameDocument(document) ? document : null;
}

function parseJsonEntry(entries: ZipEntry[], path: string): unknown {
  const text = zipTextEntry(entries, path);
  if (text === null) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

function looksLikeJson(text: string): boolean {
  const first = text.trimStart()[0];
  return first === '{' || first === '[';
}

function looksLikeJsonFile(file: Blob): boolean {
  const name = 'name' in file && typeof file.name === 'string' ? file.name.toLowerCase() : '';
  return file.type === 'application/json' || name.endsWith('.json');
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function previewPersistedState(state: PersistedState): GameImportPreview {
  const sceneTable = 'sceneTable' in state ? state.sceneTable : null;
  const scenes = sceneTable && 'scenes' in sceneTable ? Object.keys(sceneTable.scenes ?? {}).length : 0;
  return {
    ok: true,
    message: 'Файл распознан. Проверьте содержимое перед применением.',
    schemaVersion: state.schemaVersion,
    gameName: state.game.name || 'Без названия',
    counts: {
      characters: state.characters.order.length,
      scenes,
      adversaries: state.encounter.order.length,
      rollLog: state.rollLog.length,
      handouts: state.game.handouts?.length ?? 0
    }
  };
}

function emptyPreview(message: string, schemaVersion: number | null): GameImportPreview {
  return {
    ok: false,
    message,
    schemaVersion,
    gameName: '',
    counts: {
      characters: 0,
      scenes: 0,
      adversaries: 0,
      rollLog: 0,
      handouts: 0
    }
  };
}
