import { nowIso } from '../core/utils/date';
import { createId } from '../core/utils/id';
import type { MapAsset, SyncEventContext } from '../domain/tabletop/types';
import type { P2PRoomConnection } from './p2p/P2PRoomConnection';
import type { AssetService } from './AssetService';
import type { SceneTableService } from './SceneTableService';
import type { AssetMessage, AssetRequestMessage, AssetRequestReason, SyncService } from './SyncService';

const ASSET_REQUEST_TIMEOUT_MS = 15000;

interface AssetSessionState {
  connected: boolean;
  role: 'gm' | 'player' | null;
}

interface AssetSessionPatch {
  lastRequestAt?: string | null;
  message?: string;
}

interface PendingAssetRequest {
  assetId: string;
  reason: AssetRequestReason;
  sourcePeerId: string;
  timeout: number;
  resolve: (ok: boolean) => void;
}

interface AssetBinaryMetadata {
  type: 'asset';
  requestId: string;
  asset: MapAsset;
}

export class P2PAssetTransferService {
  private pending = new Map<string, PendingAssetRequest>();

  constructor(
    private syncService: SyncService,
    private assetService: AssetService,
    private sceneTableService: SceneTableService,
    private getSession: () => AssetSessionState,
    private getConnection: () => P2PRoomConnection | null,
    private patchSession: (patch: AssetSessionPatch) => void
  ) {}

  subscribeGm(): () => void {
    return this.syncService.subscribeAssetMessages((message, _event, context) => {
      if (message.type === 'request') {
        void this.handleRequest(message, context);
      }
    });
  }

  subscribePlayer(connection: P2PRoomConnection): Array<() => void> {
    return [
      this.syncService.subscribeAssetMessages((message, _event, context) => void this.handleResponse(message, context)),
      connection.subscribeBinary((data, peerId, metadata) => void this.handleBinary(data, peerId, metadata)),
      connection.subscribeBinaryProgress((percent, peerId, metadata) => this.handleProgress(percent, peerId, metadata))
    ];
  }

  async request(assetId: string, reason: AssetRequestReason = 'scene-background'): Promise<boolean> {
    if (await this.assetService.getBlob(assetId)) {
      return true;
    }
    const session = this.getSession();
    if (session.role !== 'player' || !session.connected) {
      return false;
    }
    const gmPeerId = this.getConnection()?.gmPeerId();
    if (!gmPeerId) {
      return false;
    }
    const existing = Array.from(this.pending.values()).find((request) => request.assetId === assetId);
    if (existing) {
      return new Promise((resolve) => {
        const previousResolve = existing.resolve;
        existing.resolve = (ok) => {
          previousResolve(ok);
          resolve(ok);
        };
      });
    }
    return new Promise<boolean>((resolve) => {
      this.startRequest({ assetId, reason, sourcePeerId: gmPeerId, resolve, failOnPublishError: true });
    });
  }

  async retryPendingRequestsForPeer(peerId: string): Promise<void> {
    const pendingRequests = Array.from(this.pending.entries()).filter(([, request]) => request.sourcePeerId === peerId);
    for (const [requestId, request] of pendingRequests) {
      window.clearTimeout(request.timeout);
      this.pending.delete(requestId);
      this.startRequest({
        assetId: request.assetId,
        reason: request.reason,
        sourcePeerId: request.sourcePeerId,
        resolve: request.resolve,
        failOnPublishError: false
      });
    }
    if (pendingRequests.length > 0) {
      this.patchSession({ lastRequestAt: nowIso(), message: 'Повторяем запрос ресурса сцены.' });
    }
  }

  clear(ok: boolean): void {
    for (const requestId of Array.from(this.pending.keys())) {
      this.finish(requestId, ok);
    }
  }

  private async handleRequest(message: AssetRequestMessage, context?: SyncEventContext): Promise<void> {
    const session = this.getSession();
    if (session.role !== 'gm' || !session.connected) {
      return;
    }
    const requesterPeerId = context?.sourcePeerId;
    if (!requesterPeerId) {
      return;
    }
    const unavailable = (reason: string) => this.syncService.publishAssetMessage({
      type: 'unavailable',
      requestId: message.requestId,
      assetId: message.assetId,
      reason
    }, requesterPeerId);

    const asset = this.sceneTableService.sceneTable$.get().assets[message.assetId];
    if (!asset || asset.storage !== 'indexeddb') {
      await unavailable('asset-not-found');
      return;
    }
    const transfer = await this.assetService.createAssetBlobTransfer(asset);
    const connection = this.getConnection();
    if (!transfer || !connection) {
      await unavailable(transfer ? 'binary-transport-unavailable' : 'blob-not-found');
      return;
    }
    try {
      await connection.sendBinary(
        transfer.blob,
        { type: 'asset', requestId: message.requestId, asset: transfer.asset } satisfies AssetBinaryMetadata,
        requesterPeerId,
        (percent) => this.patchSession({ lastRequestAt: nowIso(), message: `Ресурс сцены отправляется: ${Math.round(percent * 100)}%.` })
      );
    } catch (error) {
      await unavailable(error instanceof Error ? error.message : 'binary-transfer-failed');
      return;
    }
    this.patchSession({ lastRequestAt: nowIso(), message: 'Передача ресурса сцены запущена.' });
  }

  private async handleResponse(message: AssetMessage, context?: SyncEventContext): Promise<void> {
    if (message.type !== 'unavailable') {
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending || pending.sourcePeerId !== context?.sourcePeerId) {
      return;
    }
    this.finish(message.requestId, false);
    this.patchSession({ lastRequestAt: nowIso(), message: 'Ресурс сцены недоступен у мастера.' });
  }

  private async handleBinary(data: ArrayBuffer, peerId: string, metadata: unknown): Promise<void> {
    if (!isAssetBinaryMetadata(metadata)) {
      return;
    }
    const pending = this.pending.get(metadata.requestId);
    if (!pending || pending.assetId !== metadata.asset.id || pending.sourcePeerId !== peerId) {
      return;
    }
    try {
      await this.assetService.putAssetBlob(metadata.asset, new Blob([data], { type: metadata.asset.mimeType || 'application/octet-stream' }));
      this.finish(metadata.requestId, true);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Ресурс сцены получен.' });
    } catch (error) {
      this.finish(metadata.requestId, false);
      this.patchSession({ lastRequestAt: nowIso(), message: error instanceof Error ? error.message : 'Не удалось сохранить ресурс сцены.' });
    }
  }

  private handleProgress(percent: number, peerId: string, metadata: unknown): void {
    if (!isAssetBinaryMetadata(metadata)) {
      return;
    }
    const pending = this.pending.get(metadata.requestId);
    if (!pending || pending.sourcePeerId !== peerId) {
      return;
    }
    this.patchSession({ lastRequestAt: nowIso(), message: `Ресурс сцены загружается: ${Math.round(percent * 100)}%.` });
  }

  private finish(requestId: string, ok: boolean): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeout);
    this.pending.delete(requestId);
    pending.resolve(ok);
  }

  private startRequest(input: {
    assetId: string;
    reason: AssetRequestReason;
    sourcePeerId: string;
    resolve: (ok: boolean) => void;
    failOnPublishError: boolean;
  }): string {
    const requestId = createId('asset_request');
    const timeout = window.setTimeout(() => {
      this.pending.delete(requestId);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Ресурс сцены недоступен.' });
      input.resolve(false);
    }, ASSET_REQUEST_TIMEOUT_MS);
    this.pending.set(requestId, {
      assetId: input.assetId,
      reason: input.reason,
      sourcePeerId: input.sourcePeerId,
      timeout,
      resolve: input.resolve
    });
    void this.syncService.publishAssetMessage({
      type: 'request',
      requestId,
      assetId: input.assetId,
      reason: input.reason,
      requestedAt: nowIso()
    }, input.sourcePeerId).catch(() => {
      if (input.failOnPublishError) {
        this.finish(requestId, false);
      }
    });
    return requestId;
  }
}

function isAssetBinaryMetadata(value: unknown): value is AssetBinaryMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Partial<AssetBinaryMetadata>;
  return (
    metadata.type === 'asset' &&
    typeof metadata.requestId === 'string' &&
    Boolean(metadata.asset) &&
    typeof metadata.asset?.id === 'string' &&
    typeof metadata.asset?.name === 'string' &&
    typeof metadata.asset?.mimeType === 'string' &&
    metadata.asset?.storage === 'indexeddb' &&
    typeof metadata.asset?.createdAt === 'string'
  );
}
