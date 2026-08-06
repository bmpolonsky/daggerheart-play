import { createId } from '../../core/utils/id';
import { nowIso } from '../../core/utils/date';
import { createSceneMusicState } from '../audio/sceneAudio';
import { normalizeSceneBackgroundFraming } from './sceneBackground';
import type { ActorRef, MapAsset, TableParticipant, TableScene, TokenState } from './types';

export const SAFE_TACTICAL_PLACEMENT = {
  characterX: 360,
  adversaryX: 600,
  defaultY: 520,
  arrangedCharacterX: 420,
  arrangedAdversaryX: 540,
  arrangedStartY: 200,
  arrangedStepY: 160,
  arrangedRowsPerColumn: 4,
  arrangedColumnStepX: 180,
  arrangedMaxColumns: 3,
  slotClearance: 140
} as const;

export const RANDOM_TOKEN_PLACEMENT = {
  minX: 320,
  maxX: 960,
  minY: 160,
  maxY: 560,
  clearance: 120,
  attempts: 24
} as const;

export function createTableScene(input?: Partial<TableScene>): TableScene {
  const now = nowIso();
  return {
    id: input?.id ?? createId('scene'),
    name: input?.name ?? 'Открывающая сцена',
    subtitle: input?.subtitle ?? '',
    mode: input?.mode ?? 'scene',
    allowTokenOverflow: input?.allowTokenOverflow ?? false,
    backgroundAssetId: input?.backgroundAssetId,
    backgroundUrl: input?.backgroundUrl ?? '',
    backgroundFraming: normalizeSceneBackgroundFraming(input?.backgroundFraming),
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
    x: actor.kind === 'character' || actor.kind === 'companion' ? SAFE_TACTICAL_PLACEMENT.characterX : SAFE_TACTICAL_PLACEMENT.adversaryX,
    y: SAFE_TACTICAL_PLACEMENT.defaultY
  };
}

export function arrangedTokenPositionForActor(actor: ActorRef, index: number): Pick<TokenState, 'x' | 'y'> {
  const isCharacter = actor.kind === 'character' || actor.kind === 'companion';
  const capacity = SAFE_TACTICAL_PLACEMENT.arrangedRowsPerColumn * SAFE_TACTICAL_PLACEMENT.arrangedMaxColumns;
  const slot = Math.max(0, Math.floor(index)) % capacity;
  const row = slot % SAFE_TACTICAL_PLACEMENT.arrangedRowsPerColumn;
  const column = Math.floor(slot / SAFE_TACTICAL_PLACEMENT.arrangedRowsPerColumn);
  return {
    x: (isCharacter ? SAFE_TACTICAL_PLACEMENT.arrangedCharacterX : SAFE_TACTICAL_PLACEMENT.arrangedAdversaryX)
      + (isCharacter ? -1 : 1) * column * SAFE_TACTICAL_PLACEMENT.arrangedColumnStepX,
    y: SAFE_TACTICAL_PLACEMENT.arrangedStartY + row * SAFE_TACTICAL_PLACEMENT.arrangedStepY
  };
}

export function nextArrangedTokenPositionForActor(actor: ActorRef, tokens: TokenState[]): Pick<TokenState, 'x' | 'y'> {
  const sameKindTokens = tokens.filter((token) => token.actor.kind === actor.kind);
  const capacity = SAFE_TACTICAL_PLACEMENT.arrangedRowsPerColumn * SAFE_TACTICAL_PLACEMENT.arrangedMaxColumns;
  for (let index = 0; index < capacity; index += 1) {
    const candidate = arrangedTokenPositionForActor(actor, index);
    const occupied = sameKindTokens.some((token) => (
      Math.hypot(token.x - candidate.x, token.y - candidate.y) < SAFE_TACTICAL_PLACEMENT.slotClearance
    ));
    if (!occupied) return candidate;
  }
  return arrangedTokenPositionForActor(actor, sameKindTokens.length);
}

export function randomAvailableTokenPosition(
  tokens: TokenState[],
  random: () => number = Math.random
): Pick<TokenState, 'x' | 'y'> {
  let bestCandidate = randomTokenPosition(random);
  let bestClearance = distanceToNearestToken(bestCandidate, tokens);
  if (bestClearance >= RANDOM_TOKEN_PLACEMENT.clearance) return bestCandidate;

  for (let attempt = 1; attempt < RANDOM_TOKEN_PLACEMENT.attempts; attempt += 1) {
    const candidate = randomTokenPosition(random);
    const clearance = distanceToNearestToken(candidate, tokens);
    if (clearance >= RANDOM_TOKEN_PLACEMENT.clearance) return candidate;
    if (clearance > bestClearance) {
      bestCandidate = candidate;
      bestClearance = clearance;
    }
  }

  return bestCandidate;
}

function randomTokenPosition(random: () => number): Pick<TokenState, 'x' | 'y'> {
  return {
    x: randomCoordinate(RANDOM_TOKEN_PLACEMENT.minX, RANDOM_TOKEN_PLACEMENT.maxX, random),
    y: randomCoordinate(RANDOM_TOKEN_PLACEMENT.minY, RANDOM_TOKEN_PLACEMENT.maxY, random)
  };
}

function randomCoordinate(min: number, max: number, random: () => number): number {
  const value = random();
  const normalized = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
  return Math.round(min + normalized * (max - min));
}

function distanceToNearestToken(position: Pick<TokenState, 'x' | 'y'>, tokens: TokenState[]): number {
  if (tokens.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...tokens.map((token) => Math.hypot(token.x - position.x, token.y - position.y)));
}

export function createLocalParticipant(input?: Partial<TableParticipant>): TableParticipant {
  return {
    id: input?.id ?? 'local-gm',
    name: input?.name ?? 'Мастер',
    role: input?.role ?? 'gm',
    actorIds: input?.actorIds ?? [],
    peerId: input?.peerId,
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
