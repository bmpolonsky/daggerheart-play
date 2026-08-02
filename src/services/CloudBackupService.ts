import type { ImportExportService } from './ImportExportService';
import type { AssetService } from './AssetService';

export class CloudBackupService {
  private saveQueue: Promise<void> = Promise.resolve();
  private uploadedAssets = new Map<string, Set<string>>();

  constructor(
    private importExportService: ImportExportService,
    private assetService?: AssetService,
    private fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)
  ) {}

  save(worldId: string): Promise<void> {
    const save = this.saveQueue.then(() => this.write(worldId));
    this.saveQueue = save.catch(() => undefined);
    return save;
  }

  private async write(worldId: string): Promise<void> {
    await this.saveAssets(worldId);
    const archive = await this.importExportService.exportGameBundle();
    const response = await this.fetcher(cloudBackupUrl(worldId), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/zip',
        'x-daggerheart-backup-size': String(archive.size)
      },
      body: archive
    });
    if (!response.ok) throw new Error(response.status === 413
      ? 'Резервная копия слишком большая для облачного хранения.'
      : 'Не удалось обновить резервную копию игры.');
  }

  async saveAssets(worldId: string): Promise<void> {
    const files = await this.assetService?.exportAssetFiles() ?? [];
    const uploaded = this.uploadedAssets.get(worldId) ?? new Set<string>();
    this.uploadedAssets.set(worldId, uploaded);
    for (const { asset, blob } of files) {
      const signature = `${asset.id}:${blob.size}:${blob.type}`;
      if (uploaded.has(signature)) continue;
      const response = await this.fetcher(cloudAssetUrl(worldId, asset.id), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'content-type': blob.type || asset.mimeType || 'application/octet-stream',
          'x-daggerheart-asset-size': String(blob.size)
        },
        body: blob
      });
      if (!response.ok) throw new Error('Не удалось загрузить файлы сцены.');
      uploaded.add(signature);
    }
  }

  async restore(worldId: string): Promise<boolean> {
    const response = await this.fetcher(cloudBackupUrl(worldId), {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error('Не удалось загрузить резервную копию игры.');
    const result = await this.importExportService.importFile(await response.blob());
    if (!result.ok) throw new Error(result.message);
    return true;
  }

  async remove(worldId: string): Promise<boolean> {
    const response = await this.fetcher(`/api/worlds/${encodeURIComponent(worldId)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error('Не удалось удалить резервную копию игры.');
    this.uploadedAssets.delete(worldId);
    return true;
  }
}

function cloudBackupUrl(worldId: string): string {
  return `/api/worlds/${encodeURIComponent(worldId)}/backup`;
}

function cloudAssetUrl(worldId: string, assetId: string): string {
  return `/api/worlds/${encodeURIComponent(worldId)}/assets/${encodeURIComponent(assetId)}`;
}
