import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseSessionConfig } from '../domain/p2p/supabaseSession';
import { getSupabaseAuthClient, getSupabaseClient } from './supabaseClient';

const ASSET_BUCKET = 'world-assets';

export class SupabaseAssetService {
  private uploaded = new Set<string>();
  private uploads = new Map<string, Promise<void>>();

  constructor(
    private config: SupabaseSessionConfig,
    private client?: SupabaseClient,
    private readUserId?: () => Promise<string>
  ) {}

  async upload(worldId: string, assetId: string, blob: Blob): Promise<void> {
    const userId = await this.userId();
    const signature = `${userId}:${worldId}:${assetId}:${blob.size}:${blob.type}`;
    if (this.uploaded.has(signature)) return;
    const pending = this.uploads.get(signature);
    if (pending) return pending;
    const upload = this.uploadOnce(userId, worldId, assetId, blob, signature);
    this.uploads.set(signature, upload);
    try {
      await upload;
    } finally {
      this.uploads.delete(signature);
    }
  }

  async download(roomId: string, worldId: string, assetId: string): Promise<Blob | null> {
    const { data: rooms, error: roomError } = await this.dataClient().from('dh_rooms')
      .select('owner_id')
      .eq('id', roomId)
      .eq('world_id', worldId)
      .maybeSingle();
    if (roomError || !rooms?.owner_id) return null;
    const { data, error } = await this.dataClient().storage
      .from(ASSET_BUCKET)
      .download(assetPath(rooms.owner_id, worldId, assetId));
    if (error) return null;
    return data;
  }

  private async userId(): Promise<string> {
    if (this.readUserId) return this.readUserId();
    const { data, error } = await getSupabaseAuthClient(this.config).auth.getUser();
    if (error || !data.user) throw new Error('Серверная сессия не открыта.');
    return data.user.id;
  }

  private dataClient(): SupabaseClient {
    return this.client ?? getSupabaseClient(this.config);
  }

  private async uploadOnce(userId: string, worldId: string, assetId: string, blob: Blob, signature: string): Promise<void> {
    const { error } = await this.uploadClient().storage
      .from(ASSET_BUCKET)
      .upload(assetPath(userId, worldId, assetId), blob, {
        upsert: true,
        contentType: blob.type || 'application/octet-stream'
      });
    if (error) throw new Error(`Не удалось загрузить файл сцены на сервер: ${error.message}`);
    this.uploaded.add(signature);
  }

  private uploadClient(): SupabaseClient {
    return this.client ?? getSupabaseAuthClient(this.config);
  }
}

function assetPath(ownerId: string, worldId: string, assetId: string): string {
  return `${safePart(ownerId)}/${safePart(worldId)}/assets/${safePart(assetId)}`;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
