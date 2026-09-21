import { createId } from '../core/utils/id';
import { assetReference } from '../domain/game/assetReferences';
import { isPortraitAsset, MAX_PORTRAIT_BYTES, type PortraitUploadMessage } from '../domain/p2p/portraitUpload';
import type { MapAsset, SyncEventContext } from '../domain/tabletop/types';
import { gameStore, sceneTableStore } from '../stores/gameStores';
import type { AssetService } from './AssetService';
import type { P2PRoomConnection } from './p2p/P2PRoomConnection';
import type { SupabaseAssetService } from './SupabaseAssetService';
import type { SyncService } from './SyncService';

const TIMEOUT_MS = 5 * 60_000;
interface Upload {
  peerId: string;
  asset: MapAsset;
  timer: number;
  processing?: boolean;
}
interface OutgoingUpload extends Upload {
  blob: Blob;
  resolve: (ok: boolean) => void;
}
interface IncomingUpload extends Upload {
  worldId: string;
  roomId: string;
  cloud: boolean;
}

/** Transfers a new portrait before its reference is attached to a character. */
export class PortraitUploadService {
  private outgoing = new Map<string, OutgoingUpload>();
  private incoming = new Map<string, IncomingUpload>();
  private generation = 0;

  constructor(
    private assets: AssetService,
    private sync: SyncService,
    private getConnection: () => P2PRoomConnection | null,
    private getSession: () => { role: 'gm' | 'player' | null; connected: boolean; transportMode?: string; roomId: string },
    private authorize: (participantId: string, actorId: string, context: SyncEventContext) => boolean,
    private cloud?: SupabaseAssetService
  ) {}

  subscribe(connection: P2PRoomConnection): () => void {
    const unsubscribe = this.sync.subscribeAssetMessages((message, _event, context) => {
      if (!message.type.startsWith('portrait-') || !context?.sourcePeerId) return;
      void this.receive(message as PortraitUploadMessage, context).catch(() => {
        this.finishOutgoing(message.requestId, false);
        this.rejectIncoming(message.requestId);
      });
    });
    const unsubscribeBinary = connection.subscribeBinary((data, peerId, metadata) => {
      const header = metadata as { type?: string; requestId?: string } | undefined;
      if (header?.type !== 'portrait' || !header.requestId) return;
      const upload = this.incoming.get(header.requestId);
      if (!upload || upload.peerId !== peerId || upload.cloud || upload.processing) return;
      upload.processing = true;
      void this.acceptBlob(header.requestId, upload, new Blob([data], { type: upload.asset.mimeType }))
        .catch(() => this.rejectIncoming(header.requestId!));
    });
    return () => { unsubscribe(); unsubscribeBinary(); this.clear(); };
  }

  async save(file: File, actor?: { participantId: string; actorId: string }): Promise<string> {
    if (!file.type.startsWith('image/') || file.size === 0 || file.size > MAX_PORTRAIT_BYTES) {
      throw new Error('Выберите изображение размером до 50 МБ.');
    }
    const session = this.getSession();
    const connection = this.getConnection();
    if (session.role === 'player' && (!session.connected || !actor || !connection?.gmPeerId())) {
      throw new Error('Для загрузки портрета нужно подключиться к мастеру и выбрать своего персонажа.');
    }
    const generation = this.generation;
    const asset = await this.assets.saveFile(file, { updateSceneTable: false });
    const blob = await this.assets.getBlob(asset.id);
    if (!blob || generation !== this.generation) throw new Error('Загрузка портрета прервана.');
    if (session.role === 'player') {
      const requestId = createId('portrait_upload');
      const ok = await new Promise<boolean>((resolve) => {
        this.outgoing.set(requestId, {
          asset, blob, peerId: connection!.gmPeerId()!, resolve,
          timer: window.setTimeout(() => this.finishOutgoing(requestId, false), TIMEOUT_MS)
        });
        void this.sync.publishAssetMessage({ type: 'portrait-offer', requestId, ...actor!, asset }, connection!.gmPeerId()!)
          .then((sent) => { if (!sent) this.finishOutgoing(requestId, false); })
          .catch(() => this.finishOutgoing(requestId, false));
      });
      if (!ok) throw new Error('Мастер не получил портрет. Прежнее изображение сохранено; попробуйте ещё раз.');
    } else if (session.connected && session.transportMode === 'hybrid') {
      if (!this.cloud) throw new Error('Облачное хранилище недоступно.');
      await this.cloud.upload(gameStore.get().id, asset.id, blob);
    }
    if (generation !== this.generation) throw new Error('Загрузка портрета прервана.');
    // Publish metadata only once the file is available to the whole session.
    sceneTableStore.update((state) => ({ ...state, assets: { ...state.assets, [asset.id]: asset } }));
    return assetReference(asset.id);
  }

  clear(): void {
    this.generation++;
    for (const id of this.outgoing.keys()) this.finishOutgoing(id, false);
    for (const upload of this.incoming.values()) window.clearTimeout(upload.timer);
    this.incoming.clear();
  }

  private async receive(message: PortraitUploadMessage, context: SyncEventContext): Promise<void> {
    const peerId = context.sourcePeerId!;
    const session = this.getSession();
    if (!session.connected) return;
    if (message.type === 'portrait-offer') {
      if (session.role !== 'gm') return;
      if (!this.authorize(message.participantId, message.actorId, context)) {
        await this.sync.publishAssetMessage({ type: 'portrait-result', requestId: message.requestId, ok: false }, peerId);
        return;
      }
      if (sceneTableStore.get().assets[message.asset.id] || this.incoming.has(message.requestId)
        || [...this.incoming.values()].some((upload) => upload.peerId === peerId || upload.asset.id === message.asset.id)) {
        await this.sync.publishAssetMessage({ type: 'portrait-result', requestId: message.requestId, ok: false }, peerId);
        return;
      }
      // Only file metadata crosses the trust boundary; ignore remote URLs/resource paths.
      const { id, name, mimeType, byteSize, createdAt } = message.asset;
      const upload: IncomingUpload = {
        peerId, asset: { id, name, mimeType, byteSize, createdAt, storage: 'indexeddb' },
        worldId: gameStore.get().id, roomId: session.roomId, cloud: session.transportMode === 'hybrid',
        timer: window.setTimeout(() => this.rejectIncoming(message.requestId), TIMEOUT_MS)
      };
      this.incoming.set(message.requestId, upload);
      if (upload.cloud && !this.cloud) throw new Error('Cloud storage unavailable');
      const ticket = upload.cloud ? await this.cloud!.createUploadTicket(upload.worldId, id) : undefined;
      if (this.incoming.get(message.requestId) !== upload) return;
      await this.sync.publishAssetMessage({ type: 'portrait-ready', requestId: message.requestId, ...(ticket ? { ticket } : {}) }, peerId);
      return;
    }
    const outgoing = this.outgoing.get(message.requestId);
    if (outgoing && outgoing.peerId === peerId && session.role === 'player') {
      if (message.type === 'portrait-result') { this.finishOutgoing(message.requestId, message.ok); return; }
      if (message.type !== 'portrait-ready' || outgoing.processing) return;
      outgoing.processing = true;
      if (session.transportMode === 'hybrid') {
        if (!message.ticket || !this.cloud) throw new Error('Missing upload ticket');
        await this.cloud.uploadWithTicket(message.ticket, outgoing.blob);
        if (this.outgoing.get(message.requestId) !== outgoing) return;
        await this.sync.publishAssetMessage({ type: 'portrait-complete', requestId: message.requestId }, peerId);
      } else {
        const connection = this.getConnection();
        if (!connection) throw new Error('Disconnected');
        await connection.sendBinary(outgoing.blob, { type: 'portrait', requestId: message.requestId }, peerId);
      }
      return;
    }
    const incoming = this.incoming.get(message.requestId);
    if (message.type === 'portrait-complete' && session.role === 'gm' && incoming?.peerId === peerId && incoming.cloud && !incoming.processing) {
      incoming.processing = true;
      const blob = await this.cloud!.download(incoming.roomId, incoming.worldId, incoming.asset.id);
      if (!blob) throw new Error('Uploaded portrait missing');
      await this.acceptBlob(message.requestId, incoming, blob);
    }
  }

  private async acceptBlob(id: string, upload: IncomingUpload, blob: Blob): Promise<void> {
    if (this.incoming.get(id) !== upload) return;
    if (!isPortraitAsset(upload.asset) || blob.size !== upload.asset.byteSize || blob.type !== upload.asset.mimeType) {
      throw new Error('Invalid portrait file');
    }
    // Persist without publishing metadata until the session has been rechecked.
    await this.assets.putAssetBlob(upload.asset, blob, { updateSceneTable: false });
    if (this.incoming.get(id) !== upload) return;
    sceneTableStore.update((state) => ({ ...state, assets: { ...state.assets, [upload.asset.id]: upload.asset } }));
    window.clearTimeout(upload.timer);
    this.incoming.delete(id);
    await this.sync.publishAssetMessage({ type: 'portrait-result', requestId: id, ok: true }, upload.peerId);
  }

  private rejectIncoming(id: string): void {
    const upload = this.incoming.get(id);
    if (!upload) return;
    window.clearTimeout(upload.timer);
    this.incoming.delete(id);
    void this.sync.publishAssetMessage({ type: 'portrait-result', requestId: id, ok: false }, upload.peerId).catch(() => undefined);
  }

  private finishOutgoing(id: string, ok: boolean): void {
    const upload = this.outgoing.get(id);
    if (!upload) return;
    window.clearTimeout(upload.timer);
    this.outgoing.delete(id);
    upload.resolve(ok);
  }
}
