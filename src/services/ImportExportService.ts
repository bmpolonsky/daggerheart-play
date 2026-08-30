import { loadBrowserCustomContent, readBrowserCustomContent } from '../core/persistence/browserProjectContent';
import { readZipEntries, writeZip, zipTextEntry, type ZipEntry, type ZipFileEntry } from '../core/archive/zip';
import { migratePersistedState } from '../domain/migrations/persistedState';
import { isPersistedState, snapshotPersistedState } from '../stores/persistedState';
import {
  assetResourcePath,
  createGameDocument,
  gameDocumentCustomContent,
  isGameDocument,
  isLegacyGameArchive,
  gameDocumentToPersistedState,
  type GameDocument
} from '../domain/game/gameDocument';
import type { MapAsset } from '../domain/tabletop/types';
import type { PersistedState } from '../domain/rules/types';
import type { AssetService } from './AssetService';
import type { PersistenceService } from './PersistenceService';
import { isWorldArchiveDocument, type WorldArchiveDocument } from '../core/persistence/gameDocumentStore';
import { createId } from '../core/utils/id';

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
  constructor(
    private assetService: AssetService | undefined,
    private persistenceService: Pick<PersistenceService, 'importGameDocument' | 'importGameAsWorldDocument' | 'exportWorldDocument' | 'importWorldDocument'>
  ) {}

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

  async importFile(file: Blob, options: { asNewGame?: boolean; gameAsNewWorld?: boolean; regenerateGameId?: boolean; forkNameSuffix?: string; expectedKind?: 'world' | 'game' } = {}): Promise<{ ok: true } | { ok: false; message: string }> {
    const worldResult = await this.readWorldDocumentFromFile(file);
    if (worldResult.ok) {
      if (options.expectedKind === 'game') return { ok: false, message: 'Выбран архив мира. Используйте «Импорт мира».' };
      const forked = forkWorldForImport(worldResult.document);
      try {
        await this.importWorldAssets(forked.document, worldResult.entries, forked.sourcePaths);
        await this.persistenceService.importWorldDocument(forked.document);
      } catch (error) {
        await this.rollbackImportedAssets(Object.values(forked.document.world.shared.assets));
        throw error;
      }
      await this.assetService?.optimizeStoredImages();
      return { ok: true };
    }
    const result = await this.readGameDocumentFromFile(file);
    if (!result.ok) {
      return options.expectedKind === 'world' ? worldResult : result;
    }
    if (options.expectedKind === 'world' && !options.gameAsNewWorld) return { ok: false, message: 'Выбран архив игры. Используйте «Импорт игры».' };
    const forked = options.regenerateGameId || options.gameAsNewWorld ? forkGameForImport(result.document, options.forkNameSuffix ?? '') : { document: result.document, sourcePaths: {} };
    const document = forked.document;
    try {
      await this.importGameAssets(document, result.entries, forked.sourcePaths);
      if (options.gameAsNewWorld) await this.persistenceService.importGameAsWorldDocument(document);
      else await this.persistenceService.importGameDocument(document, options);
    } catch (error) {
      if (options.regenerateGameId || options.gameAsNewWorld) await this.rollbackImportedAssets(document.files['resources/assets.json']);
      throw error;
    }
    await this.assetService?.optimizeStoredImages();
    return { ok: true };
  }

  async exportWorldBundle(id?: string): Promise<Blob> {
    await this.assetService?.normalizeEmbeddedSceneAssets();
    await this.assetService?.optimizeStoredImages();
    const document = await this.persistenceService.exportWorldDocument(id);
    if (!document) throw new Error('Нет мира для экспорта.');
    const world = {
      ...document.world,
      shared: {
        ...document.world.shared,
        assets: Object.fromEntries(Object.entries(document.world.shared.assets).map(([assetId, asset]) => [
          assetId,
          asset.storage === 'indexeddb' ? { ...asset, resourcePath: assetResourcePath(asset) } : asset
        ]))
      }
    };
    const manifest = { kind: document.kind, version: document.version, exportedAt: document.exportedAt, name: world.name };
    const assetFiles = await this.assetService?.exportAssetFiles(Object.values(world.shared.assets)) ?? [];
    assertCompleteAssetExport(Object.values(world.shared.assets), assetFiles);
    return writeZip([
      { path: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
      { path: 'data/world.json', data: JSON.stringify(world, null, 2) },
      ...assetFiles.map((file) => ({ path: file.path, data: file.blob }))
    ]);
  }

  async downloadWorldArchive(id?: string, filename = `daggerheart-world-${new Date().toISOString().slice(0, 10)}.dhworld`): Promise<void> {
    if (typeof window === 'undefined') return;
    downloadBlob(await this.exportWorldBundle(id), filename);
  }

  async exportGameBundle(): Promise<Blob> {
    await loadBrowserCustomContent();
    await this.assetService?.normalizeEmbeddedSceneAssets();
    await this.assetService?.optimizeStoredImages();
    const document = this.buildGameDocument();
    const jsonEntries: ZipFileEntry[] = Object.entries(document.files).map(([path, value]) => ({
      path,
      data: JSON.stringify(value, null, 2)
    }));
    const assetFiles = await this.assetService?.exportAssetFiles(document.files['resources/assets.json']) ?? [];
    assertCompleteAssetExport(document.files['resources/assets.json'], assetFiles);
    const assetEntries: ZipFileEntry[] = assetFiles.map((file) => ({
      path: file.path,
      data: file.blob
    }));
    return writeZip([...jsonEntries, ...assetEntries]);
  }

  async downloadGameArchive(filename = `daggerheart-${new Date().toISOString().slice(0, 10)}.dhgame`): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    downloadBlob(await this.exportGameBundle(), filename);
  }

  async downloadArchive(filename?: string): Promise<void> {
    await this.downloadWorldArchive(undefined, filename ?? `daggerheart-world-${new Date().toISOString().slice(0, 10)}.dhworld`);
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

  async importGameAssets(document: GameDocument, entries: ZipEntry[] = [], sourcePaths: Record<string, string> = {}): Promise<void> {
    if (!this.assetService) return;
    assertCompleteAssetImport(document.files['resources/assets.json'], entries, sourcePaths);
    for (const asset of document.files['resources/assets.json']) {
      if (asset.storage !== 'indexeddb') continue;
      const path = sourcePaths[asset.id] ?? assetResourcePath(asset);
      const entry = entries.find((item) => item.path === path);
      if (!entry) continue;
      await this.assetService.putAssetBlob(asset, new Blob([bytesToBlobPart(entry.bytes)], { type: asset.mimeType || 'application/octet-stream' }), { updateSceneTable: false });
    }
  }

  async importWorldAssets(document: WorldArchiveDocument, entries: ZipEntry[] = [], sourcePaths: Record<string, string> = {}): Promise<void> {
    if (!this.assetService) return;
    const assets = Object.values(document.world.shared.assets);
    assertCompleteAssetImport(assets, entries, sourcePaths);
    for (const asset of assets) {
      if (asset.storage !== 'indexeddb') continue;
      const entry = entries.find((item) => item.path === (sourcePaths[asset.id] ?? assetResourcePath(asset)));
      if (!entry) continue;
      await this.assetService.putAssetBlob(asset, new Blob([bytesToBlobPart(entry.bytes)], { type: asset.mimeType || 'application/octet-stream' }), { updateSceneTable: false });
    }
  }

  private async rollbackImportedAssets(assets: MapAsset[]): Promise<void> {
    if (!this.assetService) return;
    await Promise.all(assets.filter((asset) => asset.storage === 'indexeddb').map((asset) => this.assetService?.deleteAsset(asset.id)));
  }

  private async readWorldDocumentFromFile(file: Blob): Promise<{ ok: true; document: WorldArchiveDocument; entries: ZipEntry[] } | { ok: false; message: string }> {
    if (looksLikeJsonFile(file)) {
      try {
        const value = JSON.parse(await file.text()) as unknown;
        return isWorldArchiveDocument(value)
          ? { ok: true, document: value, entries: [] }
          : { ok: false, message: 'Файл не похож на экспорт мира Daggerheart Play.' };
      } catch {
        return { ok: false, message: 'Не удалось прочитать JSON мира.' };
      }
    }
    try {
      const entries = await readZipEntries(file);
      const document = worldDocumentFromZipEntries(entries);
      return document
        ? { ok: true, document, entries }
        : { ok: false, message: 'Архив не похож на мир Daggerheart Play.' };
    } catch {
      return { ok: false, message: 'Не удалось прочитать архив мира.' };
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
    return createGameDocument(migratePersistedState(value));
  }
  if (isLegacyGameArchive(value) && isPersistedState(value.document)) {
    const state = migratePersistedState(value.document);
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

function forkGameForImport(document: GameDocument, suffix: string): { document: GameDocument; sourcePaths: Record<string, string> } {
  const state = gameDocumentToPersistedState(document);
  const { assets, sourcePaths, ids } = forkAssets(state.sceneTable.assets);
  const now = new Date().toISOString();
  const game = {
    ...state.game,
    id: createId('game'),
    name: `${state.game.name || 'Без названия'}${suffix}`,
    updatedAt: now
  };
  return {
    document: createGameDocument({
      ...state,
      game,
      sceneTable: remapSceneAssets({ ...state.sceneTable, assets }, ids)
    }, gameDocumentCustomContent(document)),
    sourcePaths
  };
}

function forkWorldForImport(document: WorldArchiveDocument): { document: WorldArchiveDocument; sourcePaths: Record<string, string> } {
  const { assets, sourcePaths, ids } = forkAssets(document.world.shared.assets);
  const gameIds = Object.fromEntries(document.world.order.map((id) => [id, createId('game')]));
  const games = Object.fromEntries(document.world.order.map((oldId) => {
    const record = document.world.games[oldId];
    const id = gameIds[oldId];
    return [id, {
      ...record,
      id,
      state: {
        ...record.state,
        game: { ...record.state.game, id },
        sceneTable: remapSceneAssets(record.state.sceneTable, ids)
      }
    }];
  }));
  return {
    document: {
      ...document,
      world: {
        ...document.world,
        id: createId('world'),
        shared: { ...document.world.shared, assets },
        activeGameId: document.world.activeGameId ? gameIds[document.world.activeGameId] : null,
        order: document.world.order.map((id) => gameIds[id]),
        games
      }
    },
    sourcePaths
  };
}

function forkAssets(assets: Record<string, MapAsset>): {
  assets: Record<string, MapAsset>;
  sourcePaths: Record<string, string>;
  ids: Record<string, string>;
} {
  const ids = Object.fromEntries(Object.keys(assets).map((id) => [id, createId('asset')]));
  const sourcePaths: Record<string, string> = {};
  const forked = Object.fromEntries(Object.entries(assets).map(([oldId, asset]) => {
    const id = ids[oldId];
    sourcePaths[id] = assetResourcePath(asset);
    const next = { ...asset, id, resourcePath: undefined };
    return [id, next];
  }));
  return { assets: forked, sourcePaths, ids };
}

function remapSceneAssets<T extends PersistedState['sceneTable'] | Omit<PersistedState['sceneTable'], 'assets'>>(sceneTable: T, ids: Record<string, string>): T {
  return {
    ...sceneTable,
    scenes: Object.fromEntries(Object.entries(sceneTable.scenes).map(([sceneId, scene]) => [sceneId, {
      ...scene,
      backgroundAssetId: scene.backgroundAssetId ? ids[scene.backgroundAssetId] ?? scene.backgroundAssetId : undefined,
      music: {
        ...scene.music,
        assetId: scene.music.assetId ? ids[scene.music.assetId] ?? scene.music.assetId : undefined
      },
      layers: scene.layers.map((layer) => ({
        ...layer,
        assetId: layer.assetId ? ids[layer.assetId] ?? layer.assetId : undefined
      }))
    }]))
  };
}

function assertCompleteAssetExport(assets: MapAsset[], files: Array<{ asset: MapAsset }>): void {
  const exported = new Set(files.map((file) => file.asset.id));
  const missing = assets.filter((asset) => asset.storage === 'indexeddb' && !exported.has(asset.id));
  if (missing.length) throw new Error(`Не найдены файлы для экспорта: ${missing.map((asset) => asset.name).join(', ')}.`);
}

function assertCompleteAssetImport(assets: MapAsset[], entries: ZipEntry[], sourcePaths: Record<string, string>): void {
  const paths = new Set(entries.map((entry) => entry.path));
  const missing = assets.filter((asset) => asset.storage === 'indexeddb' && !paths.has(sourcePaths[asset.id] ?? assetResourcePath(asset)));
  if (missing.length) throw new Error(`В архиве отсутствуют файлы: ${missing.map((asset) => asset.name).join(', ')}.`);
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
      'content/custom-environments.json': parseJsonEntry(entries, 'content/custom-environments.json') ?? [],
      'content/custom-classes.json': parseJsonEntry(entries, 'content/custom-classes.json') ?? [],
      'content/custom-equipment.json': parseJsonEntry(entries, 'content/custom-equipment.json') ?? [],
      'content/custom-beastforms.json': parseJsonEntry(entries, 'content/custom-beastforms.json') ?? [],
      'resources/assets.json': parseJsonEntry(entries, 'resources/assets.json') ?? []
    }
  };
  return isGameDocument(document) ? document : null;
}

function worldDocumentFromZipEntries(entries: ZipEntry[]): WorldArchiveDocument | null {
  const manifest = parseJsonEntry(entries, 'manifest.json');
  const world = parseJsonEntry(entries, 'data/world.json');
  if (!isRecord(manifest)) return null;
  const document = {
    kind: manifest.kind,
    version: manifest.version,
    exportedAt: manifest.exportedAt,
    world
  };
  return isWorldArchiveDocument(document) ? document : null;
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
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
