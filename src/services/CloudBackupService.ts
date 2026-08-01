import type { ImportExportService } from './ImportExportService';

export class CloudBackupService {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private importExportService: ImportExportService,
    private fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)
  ) {}

  save(worldId: string): Promise<void> {
    const save = this.saveQueue.then(() => this.write(worldId));
    this.saveQueue = save.catch(() => undefined);
    return save;
  }

  private async write(worldId: string): Promise<void> {
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
}

function cloudBackupUrl(worldId: string): string {
  return `/api/worlds/${encodeURIComponent(worldId)}/backup`;
}
