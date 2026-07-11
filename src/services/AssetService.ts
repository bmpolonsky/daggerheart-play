import { createMapAsset } from '../domain/tabletop/factories';
import type { MapAsset } from '../domain/tabletop/types';
import { assetResourcePath } from '../domain/game/gameDocument';
import { sceneTableStore } from '../stores/gameStores';
import { createAssetBlobStore, type AssetBlobStore } from '../core/persistence/assetBlobStore';
import { isOptimizableImageType, optimizeImageForStorage } from '../core/images/optimizeImage';

interface PutAssetBlobOptions {
  updateSceneTable?: boolean;
}

export class AssetService {
  constructor(private blobStore: AssetBlobStore | null = createAssetBlobStore()) {}

  async saveFile(file: File): Promise<MapAsset> {
    const optimized = await optimizeImageForStorage(file, file.name);
    const asset = createMapAsset({
      name: optimized.name || 'Ассет сцены',
      mimeType: optimized.blob.type || file.type || 'application/octet-stream',
      byteSize: optimized.blob.size,
      storage: 'indexeddb'
    });
    await this.putBlob(asset.id, optimized.blob);
    sceneTableStore.update((state) => ({
      ...state,
      assets: { ...state.assets, [asset.id]: asset }
    }));
    return asset;
  }

  async getObjectUrl(assetId: string): Promise<string | null> {
    const blob = await this.getBlob(assetId);
    if (!blob) return null;
    const asset = sceneTableStore.get().assets[assetId];
    if (!asset) return URL.createObjectURL(blob);
    const prepared = await this.prepareImageAsset(asset, blob);
    if (prepared.optimized) {
      await this.putBlob(assetId, prepared.blob);
      sceneTableStore.update((state) => ({
        ...state,
        assets: { ...state.assets, [assetId]: prepared.asset }
      }));
    }
    return URL.createObjectURL(prepared.blob);
  }

  async exportAssetFiles(assets: MapAsset[] = Object.values(sceneTableStore.get().assets)): Promise<Array<{ asset: MapAsset; path: string; blob: Blob }>> {
    const files: Array<{ asset: MapAsset; path: string; blob: Blob }> = [];
    for (const asset of assets) {
      if (asset.storage !== 'indexeddb') continue;
      const blob = await this.getBlob(asset.id);
      if (!blob) continue;
      files.push({
        asset,
        path: assetResourcePath(asset),
        blob
      });
    }
    return files;
  }

  async normalizeEmbeddedSceneAssets(): Promise<boolean> {
    if (!this.blobStore) return false;
    const state = sceneTableStore.get();
    const assets = { ...state.assets };
    const scenes = { ...state.scenes };
    let changed = false;

    for (const scene of Object.values(state.scenes)) {
      let nextScene = scene;
      if (isDataUrl(scene.backgroundUrl)) {
        const asset = await this.createAssetFromDataUrl(`${scene.name || 'Сцена'} background`, scene.backgroundUrl);
        if (asset) {
          assets[asset.id] = asset;
          nextScene = {
            ...nextScene,
            backgroundAssetId: asset.id,
            backgroundUrl: ''
          };
          changed = true;
        }
      }

      if (isDataUrl(scene.music.sourceUrl)) {
        const asset = await this.createAssetFromDataUrl(scene.music.title || `${scene.name || 'Сцена'} music`, scene.music.sourceUrl);
        if (asset) {
          assets[asset.id] = asset;
          nextScene = {
            ...nextScene,
            music: {
              ...nextScene.music,
              assetId: asset.id,
              sourceUrl: ''
            }
          };
          changed = true;
        }
      }

      if (nextScene !== scene) {
        scenes[scene.id] = nextScene;
      }
    }

    if (!changed) return false;
    sceneTableStore.update((current) => ({
      ...current,
      assets: {
        ...current.assets,
        ...assets
      },
      scenes: {
        ...current.scenes,
        ...scenes
      }
    }));
    return true;
  }

  async optimizeStoredImages(): Promise<number> {
    if (!this.blobStore || typeof document === 'undefined') return 0;
    const state = sceneTableStore.get();
    const assets = { ...state.assets };
    let optimizedCount = 0;

    for (const asset of Object.values(state.assets)) {
      if (asset.storage !== 'indexeddb') continue;
      const source = await this.getBlob(asset.id);
      if (!source) continue;
      const prepared = await this.prepareImageAsset(asset, source);
      if (!prepared.optimized) continue;
      await this.putBlob(asset.id, prepared.blob);
      assets[asset.id] = prepared.asset;
      optimizedCount += 1;
    }

    if (optimizedCount > 0) {
      sceneTableStore.update((current) => ({ ...current, assets: { ...current.assets, ...assets } }));
    }
    return optimizedCount;
  }

  async createAssetBlobTransfer(asset: MapAsset): Promise<{ asset: MapAsset; blob: Blob } | null> {
    if (asset.storage !== 'indexeddb') {
      return null;
    }
    const blob = await this.getBlob(asset.id);
    if (!blob) {
      return null;
    }
    const prepared = await this.prepareImageAsset(asset, blob);
    if (prepared.optimized) {
      await this.putBlob(asset.id, prepared.blob);
      sceneTableStore.update((state) => ({
        ...state,
        assets: { ...state.assets, [prepared.asset.id]: prepared.asset }
      }));
    }
    return {
      asset: prepared.asset,
      blob: prepared.blob
    };
  }

  async putAssetBlob(asset: MapAsset, blob: Blob, options: PutAssetBlobOptions = {}): Promise<void> {
    const prepared = await this.prepareImageAsset(asset, blob);
    const normalized = prepared.asset;
    await this.putBlob(normalized.id, prepared.blob);
    if (options.updateSceneTable === false) {
      return;
    }
    sceneTableStore.update((state) => ({
      ...state,
      assets: { ...state.assets, [normalized.id]: normalized }
    }));
  }

  private async prepareImageAsset(asset: MapAsset, blob: Blob): Promise<{ asset: MapAsset; blob: Blob; optimized: boolean }> {
    const blobMimeType = blob.type.toLowerCase();
    const metadataMimeType = asset.mimeType.toLowerCase();
    const effectiveMimeType = blobMimeType.startsWith('image/') && blobMimeType !== 'image/*'
      ? blobMimeType
      : metadataMimeType;
    const source = isOptimizableImageType(effectiveMimeType) && blob.type !== effectiveMimeType
      ? blob.slice(0, blob.size, effectiveMimeType)
      : blob;
    const optimized = await optimizeImageForStorage(source, asset.name);
    const normalized: MapAsset = {
      ...asset,
      name: optimized.name || asset.name,
      storage: 'indexeddb',
      byteSize: optimized.blob.size,
      mimeType: optimized.blob.type || effectiveMimeType || 'application/octet-stream'
    };
    normalized.resourcePath = assetResourcePath(normalized);
    return { asset: normalized, blob: optimized.blob, optimized: optimized.optimized };
  }

  registerRemoteAsset(name: string, url: string, mimeType = 'image/*'): MapAsset {
    const asset = createMapAsset({
      name,
      mimeType,
      storage: 'remote',
      url
    });
    sceneTableStore.update((state) => ({
      ...state,
      assets: { ...state.assets, [asset.id]: asset }
    }));
    return asset;
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.deleteBlob(assetId);
    sceneTableStore.update((state) => {
      const { [assetId]: _removed, ...assets } = state.assets;
      return { ...state, assets };
    });
  }

  async getBlob(id: string): Promise<Blob | null> {
    return await this.blobStore?.get(id) ?? null;
  }

  private async putBlob(id: string, blob: Blob): Promise<void> {
    await this.blobStore?.put(id, blob);
  }

  private async deleteBlob(id: string): Promise<void> {
    await this.blobStore?.delete(id);
  }

  private async createAssetFromDataUrl(name: string, dataUrl: string): Promise<MapAsset | null> {
    const blob = dataUrlToBlob(dataUrl, 'application/octet-stream');
    if (!blob) return null;
    const asset = createMapAsset({
      name,
      mimeType: blob.type || 'application/octet-stream',
      byteSize: blob.size,
      storage: 'indexeddb'
    });
    await this.putBlob(asset.id, blob);
    return {
      ...asset,
      resourcePath: assetResourcePath(asset)
    };
  }
}

function isDataUrl(value: string): boolean {
  return /^data:[^;,]+;base64,/.test(value);
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.*)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1] || fallbackMimeType || 'application/octet-stream';
  const bytes = base64ToBytes(match[2]);
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: mimeType });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
