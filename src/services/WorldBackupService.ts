import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredWorldSummary } from '../core/persistence/gameDocumentStore';
import type { SupabaseSessionConfig } from '../domain/p2p/supabaseSession';
import { reportOperationalError } from '../core/observability/sentry';
import type { ImportExportService } from './ImportExportService';
import { getSupabaseAuthClient } from './supabaseClient';

const BACKUP_BUCKET = 'world-backups';

export interface ServerWorldSummary {
  id: string;
  name: string;
  updatedAt: string | null;
  gameCount: number;
  byteSize: number;
}

export class WorldBackupService {
  constructor(
    private config: SupabaseSessionConfig,
    private importExportService: Pick<ImportExportService, 'exportWorldBundle' | 'importFile'>,
    private client?: SupabaseClient,
    private readUserId?: () => Promise<string>
  ) {}

  async list(): Promise<ServerWorldSummary[]> {
    const userId = await this.userId();
    const storage = this.storage();
    const { data, error } = await storage.list(userId, {
      limit: 100,
      sortBy: { column: 'updated_at', order: 'desc' }
    });
    if (error) throw this.failure(error, 'list', 'Не удалось загрузить список миров с сервера.');
    const files = (data ?? []).filter((file) => file.name.endsWith('.dhworld'));
    return Promise.all(files.map(async (file) => {
      const { data: info } = await storage.info(`${userId}/${file.name}`);
      const metadata = (info?.metadata ?? {}) as Record<string, unknown>;
      const id = text(metadata.worldId) || file.name.slice(0, -'.dhworld'.length);
      return {
        id,
        name: text(metadata.worldName) || 'Без названия',
        updatedAt: info?.lastModified ?? file.updated_at,
        gameCount: positiveInteger(metadata.gameCount),
        byteSize: positiveInteger(info?.size ?? file.metadata?.size)
      };
    }));
  }

  async save(world: StoredWorldSummary): Promise<void> {
    const userId = await this.userId();
    const archive = await this.importExportService.exportWorldBundle(world.id);
    const { error } = await this.storage().upload(this.path(userId, world.id), archive, {
      upsert: true,
      contentType: 'application/zip',
      metadata: { worldId: world.id, worldName: world.name, gameCount: world.gameCount }
    });
    if (error) throw this.failure(error, 'save', 'Не удалось сохранить мир на сервере.', world.id, archive.size);
  }

  async restore(worldId: string): Promise<void> {
    const userId = await this.userId();
    const { data, error } = await this.storage().download(this.path(userId, worldId));
    if (error || !data) throw this.failure(error, 'download', 'Не удалось скачать мир с сервера.', worldId);
    const result = await this.importExportService.importFile(data, { expectedKind: 'world' });
    if (!result.ok) throw new Error(result.message);
  }

  async remove(worldId: string): Promise<void> {
    const userId = await this.userId();
    const { error } = await this.storage().remove([this.path(userId, worldId)]);
    if (error) throw this.failure(error, 'remove', 'Не удалось удалить серверную копию.', worldId);
  }

  private storage() {
    return (this.client ?? getSupabaseAuthClient(this.config)).storage.from(BACKUP_BUCKET);
  }

  private async userId(): Promise<string> {
    if (this.readUserId) return this.readUserId();
    const { data, error } = await getSupabaseAuthClient(this.config).auth.getUser();
    if (error || !data.user || data.user.is_anonymous) throw new Error('Войдите в аккаунт мастера.');
    return data.user.id;
  }

  private path(userId: string, worldId: string): string {
    return `${safePart(userId)}/${safePart(worldId)}.dhworld`;
  }

  private failure(error: unknown, operation: string, message: string, worldId?: string, bytes?: number): Error {
    reportOperationalError(error, {
      area: 'storage',
      operation: `world-backup-${operation}`,
      tags: { provider: 'supabase' },
      details: { worldId, bytes }
    });
    const detail = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? ` ${error.message}` : '';
    return new Error(`${message}${detail}`);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
