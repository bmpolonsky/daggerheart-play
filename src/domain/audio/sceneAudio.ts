import { clamp } from '../../core/utils/clamp';
import { nowIso } from '../../core/utils/date';

export interface SceneMusicState {
  assetId?: string;
  sourceUrl: string;
  title: string;
  deliveryMode: SceneMusicDeliveryMode;
  playing: boolean;
  volume: number;
  position: number;
  startedAt: string | null;
  updatedAt: string;
  revision: number;
}

export type SceneMusicDeliveryMode = 'download' | 'broadcast';

export type SceneMusicPatch = Partial<Pick<SceneMusicState, 'assetId' | 'sourceUrl' | 'title' | 'deliveryMode' | 'playing' | 'volume' | 'position' | 'startedAt'>>;

export function createSceneMusicState(input?: SceneMusicPatch & Partial<Pick<SceneMusicState, 'updatedAt' | 'revision'>>): SceneMusicState {
  const updatedAt = input?.updatedAt ?? nowIso();
  return normalizeSceneMusicState({
    assetId: input?.assetId,
    sourceUrl: input?.sourceUrl ?? '',
    title: input?.title ?? '',
    deliveryMode: input?.deliveryMode ?? 'download',
    playing: input?.playing ?? false,
    volume: input?.volume ?? 0.72,
    position: input?.position ?? 0,
    startedAt: input?.startedAt ?? null,
    updatedAt,
    revision: input?.revision ?? 0
  });
}

export function normalizeSceneMusicState(input?: Partial<SceneMusicState> | null): SceneMusicState {
  const updatedAt = typeof input?.updatedAt === 'string' && input.updatedAt ? input.updatedAt : nowIso();
  const sourceUrl = typeof input?.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  const assetId = typeof input?.assetId === 'string' && input.assetId.trim() ? input.assetId.trim() : undefined;
  return {
    ...(assetId ? { assetId } : {}),
    sourceUrl,
    title: typeof input?.title === 'string' ? input.title.trim() : '',
    deliveryMode: input?.deliveryMode === 'broadcast' ? 'broadcast' : 'download',
    playing: Boolean((sourceUrl || assetId) && input?.playing),
    volume: clamp(Number.isFinite(input?.volume) ? Number(input?.volume) : 0.72, 0, 1),
    position: Math.max(0, Number.isFinite(input?.position) ? Number(input?.position) : 0),
    startedAt: typeof input?.startedAt === 'string' && input.startedAt ? input.startedAt : null,
    updatedAt,
    revision: Math.max(0, Number.isFinite(input?.revision) ? Math.trunc(Number(input?.revision)) : 0)
  };
}

export function setSceneMusicTrack(current: SceneMusicState, patch: Pick<SceneMusicPatch, 'assetId' | 'sourceUrl' | 'title'>, updatedAt = nowIso()): SceneMusicState {
  const sourceUrl = patch.sourceUrl?.trim() ?? '';
  const assetId = patch.assetId?.trim() || undefined;
  return bumpSceneMusic({
    ...current,
    assetId,
    sourceUrl,
    title: patch.title?.trim() ?? current.title,
    playing: false,
    position: 0,
    startedAt: null,
    updatedAt
  });
}

export function playSceneMusic(current: SceneMusicState, updatedAt = nowIso()): SceneMusicState {
  const normalized = normalizeSceneMusicState(current);
  if (!normalized.sourceUrl && !normalized.assetId) {
    return bumpSceneMusic({ ...normalized, playing: false, startedAt: null, updatedAt });
  }
  return bumpSceneMusic({
    ...normalized,
    playing: true,
    startedAt: updatedAt,
    updatedAt
  });
}

export function pauseSceneMusic(current: SceneMusicState, updatedAt = nowIso(), position?: number): SceneMusicState {
  const nextPosition = position ?? effectiveSceneMusicPosition(current, Date.parse(updatedAt));
  return bumpSceneMusic({
    ...normalizeSceneMusicState(current),
    playing: false,
    position: Math.max(0, nextPosition),
    startedAt: null,
    updatedAt
  });
}

export function stopSceneMusic(current: SceneMusicState, updatedAt = nowIso()): SceneMusicState {
  return bumpSceneMusic({
    ...normalizeSceneMusicState(current),
    playing: false,
    position: 0,
    startedAt: null,
    updatedAt
  });
}

export function setSceneMusicVolume(current: SceneMusicState, volume: number, updatedAt = nowIso()): SceneMusicState {
  return bumpSceneMusic({
    ...normalizeSceneMusicState(current),
    volume: clamp(volume, 0, 1),
    updatedAt
  });
}

export function setSceneMusicDeliveryMode(current: SceneMusicState, deliveryMode: SceneMusicDeliveryMode, updatedAt = nowIso()): SceneMusicState {
  return bumpSceneMusic({
    ...normalizeSceneMusicState(current),
    deliveryMode,
    updatedAt
  });
}

export function effectiveSceneMusicPosition(music: SceneMusicState, nowMs = Date.now()): number {
  const normalized = normalizeSceneMusicState(music);
  if (!normalized.playing || !normalized.startedAt) {
    return normalized.position;
  }
  const startedAtMs = Date.parse(normalized.startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return normalized.position;
  }
  return Math.max(0, normalized.position + Math.max(0, nowMs - startedAtMs) / 1000);
}

export function sceneMusicDisplayTitle(music: SceneMusicState): string {
  const normalized = normalizeSceneMusicState(music);
  if (normalized.title) return normalized.title;
  if (!normalized.sourceUrl) return '';
  try {
    const url = new URL(normalized.sourceUrl);
    return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? normalized.sourceUrl);
  } catch {
    return normalized.sourceUrl.split('/').filter(Boolean).at(-1) ?? normalized.sourceUrl;
  }
}

function bumpSceneMusic(music: SceneMusicState): SceneMusicState {
  const normalized = normalizeSceneMusicState(music);
  return {
    ...normalized,
    revision: normalized.revision + 1
  };
}
