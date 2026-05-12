import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/date';
import { createSceneMusicState } from '../audio/sceneAudio';
import type { ActorRef, MapAsset, TableParticipant, TableScene, TokenState } from './types';

export const SAFE_TACTICAL_PLACEMENT = {
  characterX: 360,
  adversaryX: 600,
  defaultY: 520,
  arrangedStartY: 380,
  characterStepY: 92,
  adversaryStepY: 86
} as const;

export function createTableScene(input?: Partial<TableScene>): TableScene {
  const now = nowIso();
  return {
    id: input?.id ?? createId('scene'),
    name: input?.name ?? 'Открывающая сцена',
    subtitle: input?.subtitle ?? '',
    mode: input?.mode ?? 'scene',
    backgroundAssetId: input?.backgroundAssetId,
    backgroundUrl: input?.backgroundUrl ?? '',
    music: createSceneMusicState(input?.music),
    layers: input?.layers ?? [],
    tokens: input?.tokens ?? [],
    notes: input?.notes ?? '',
    createdAt: input?.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now
  };
}

export function createTokenState(actor: ActorRef, input?: Partial<TokenState>): TokenState {
  const defaultPosition = defaultTokenPositionForActor(actor);
  return {
    id: input?.id ?? tokenIdForActor(actor),
    actor,
    x: input?.x ?? defaultPosition.x,
    y: input?.y ?? defaultPosition.y,
    width: input?.width ?? 72,
    height: input?.height ?? 72,
    rotation: input?.rotation ?? 0,
    hidden: input?.hidden ?? false,
    locked: input?.locked ?? false,
    tint: input?.tint,
    aura: input?.aura,
    ownership: input?.ownership ?? {
      ownerId: null,
      editableBy: ['gm'],
      visibility: 'public'
    }
  };
}

export function defaultTokenPositionForActor(actor: ActorRef): Pick<TokenState, 'x' | 'y'> {
  return {
    x: actor.kind === 'character' ? SAFE_TACTICAL_PLACEMENT.characterX : SAFE_TACTICAL_PLACEMENT.adversaryX,
    y: SAFE_TACTICAL_PLACEMENT.defaultY
  };
}

export function arrangedTokenPositionForActor(actor: ActorRef, index: number): Pick<TokenState, 'x' | 'y'> {
  const isCharacter = actor.kind === 'character';
  return {
    x: isCharacter ? SAFE_TACTICAL_PLACEMENT.characterX : SAFE_TACTICAL_PLACEMENT.adversaryX,
    y: SAFE_TACTICAL_PLACEMENT.arrangedStartY + index * (isCharacter ? SAFE_TACTICAL_PLACEMENT.characterStepY : SAFE_TACTICAL_PLACEMENT.adversaryStepY)
  };
}

export function createLocalParticipant(input?: Partial<TableParticipant>): TableParticipant {
  return {
    id: input?.id ?? 'local-gm',
    name: input?.name ?? 'Мастер',
    role: input?.role ?? 'gm',
    actorIds: input?.actorIds ?? [],
    connected: input?.connected ?? true,
    updatedAt: input?.updatedAt ?? nowIso()
  };
}

export function createMapAsset(input: Omit<MapAsset, 'id' | 'createdAt'> & Partial<Pick<MapAsset, 'id' | 'createdAt'>>): MapAsset {
  return {
    id: input.id ?? createId('asset'),
    name: input.name,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteSize: input.byteSize,
    storage: input.storage,
    url: input.url,
    createdAt: input.createdAt ?? nowIso()
  };
}

export function tokenIdForActor(actor: ActorRef): string {
  return `${actor.kind}:${actor.id}`;
}
