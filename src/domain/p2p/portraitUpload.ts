import type { MapAsset } from '../tabletop/types';

export const MAX_PORTRAIT_BYTES = 50 * 1024 * 1024;
export type PortraitUploadMessage =
  | { type: 'portrait-offer'; requestId: string; actorId: string; participantId: string; asset: MapAsset }
  | { type: 'portrait-ready'; requestId: string; ticket?: { path: string; token: string } }
  | { type: 'portrait-complete'; requestId: string }
  | { type: 'portrait-result'; requestId: string; ok: boolean };

export function isPortraitAsset(value: unknown): value is MapAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as MapAsset;
  return typeof asset.id === 'string' && /^asset_[a-zA-Z0-9_-]+$/.test(asset.id)
    && typeof asset.name === 'string' && asset.name.length <= 1024
    && typeof asset.mimeType === 'string' && /^image\/[a-zA-Z0-9.+-]+$/.test(asset.mimeType)
    && asset.storage === 'indexeddb' && typeof asset.createdAt === 'string'
    && Number.isSafeInteger(asset.byteSize) && asset.byteSize! > 0 && asset.byteSize! <= MAX_PORTRAIT_BYTES;
}

export function isPortraitUploadMessage(value: Record<string, unknown>): value is Record<string, unknown> & PortraitUploadMessage {
  if (typeof value.requestId !== 'string' || value.requestId.length > 128) return false;
  switch (value.type) {
    case 'portrait-offer': return typeof value.actorId === 'string' && typeof value.participantId === 'string' && isPortraitAsset(value.asset);
    case 'portrait-ready': {
      const ticket = value.ticket as { path?: unknown; token?: unknown } | undefined;
      return ticket === undefined || Boolean(ticket && typeof ticket.path === 'string' && typeof ticket.token === 'string');
    }
    case 'portrait-complete': return true;
    case 'portrait-result': return typeof value.ok === 'boolean';
    default: return false;
  }
}
