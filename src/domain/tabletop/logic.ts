import { clamp } from '../../core/utils/clamp';
import type { Adversary, Character } from '../rules/types';
import type { ActorRef, Ownership, TableScene, TableVisibility, TokenState } from './types';
import { arrangedTokenPositionForActor, createTokenState, tokenIdForActor } from './factories';

export const DEFAULT_SCENE_WIDTH = 960;
export const DEFAULT_SCENE_HEIGHT = 960;

export interface RangeMeasurement {
  cells: number;
  category: 'Вплотную' | 'Близко' | 'Средне' | 'Далеко' | 'Очень далеко';
  line: {
    left: number;
    top: number;
    width: number;
    angle: number;
    labelLeft: number;
    labelTop: number;
  } | null;
}

export interface TokenFlagPatch {
  hidden?: boolean;
  locked?: boolean;
  ownership?: Partial<Pick<Ownership, 'visibility'>>;
}

export function tokenIdFor(kind: ActorRef['kind'], id: string): string {
  return tokenIdForActor({ kind, id });
}

export function patchTokenFlags(token: TokenState, patch: TokenFlagPatch): TokenState {
  const visibility = sanitizeTokenVisibility(patch.ownership?.visibility);
  return {
    ...token,
    hidden: typeof patch.hidden === 'boolean' ? patch.hidden : token.hidden,
    locked: typeof patch.locked === 'boolean' ? patch.locked : token.locked,
    ownership: visibility
      ? {
          ...token.ownership,
          visibility
        }
      : token.ownership
  };
}

export function moveTokenWithinWorld(token: TokenState, x: number, y: number): TokenState {
  if (token.locked) return token;
  return {
    ...token,
    x: clamp(Number.isFinite(x) ? x : token.x, 0, DEFAULT_SCENE_WIDTH),
    y: clamp(Number.isFinite(y) ? y : token.y, 0, DEFAULT_SCENE_HEIGHT)
  };
}

export function syncSceneTokens(scene: TableScene, characters: Character[], adversaries: Adversary[]): TableScene {
  const actorIds = new Set<string>([
    ...characters.map((character) => tokenIdFor('character', character.id)),
    ...adversaries.map((adversary) => tokenIdFor('adversary', adversary.id))
  ]);
  const nextTokens = scene.tokens.filter((token) => (
    (token.actor.kind !== 'character' && token.actor.kind !== 'adversary') || actorIds.has(token.id)
  ));
  const existing = new Set(nextTokens.map((token) => token.id));

  characters.forEach((character, index) => {
    const actor: ActorRef = { kind: 'character', id: character.id };
    const id = tokenIdForActor(actor);
    if (!existing.has(id)) {
      nextTokens.push(createTokenState(actor, arrangedTokenPositionForActor(actor, index)));
    }
  });

  adversaries.forEach((adversary, index) => {
    const actor: ActorRef = { kind: 'adversary', id: adversary.id };
    const id = tokenIdForActor(actor);
    if (!existing.has(id)) {
      nextTokens.push(createTokenState(actor, arrangedTokenPositionForActor(actor, index)));
    }
  });

  if (JSON.stringify(nextTokens) === JSON.stringify(scene.tokens)) return scene;
  return { ...scene, tokens: nextTokens };
}

export function autoArrangeTokens(tokens: TokenState[]): TokenState[] {
  let heroIndex = 0;
  let adversaryIndex = 0;
  return tokens.map((token) => {
    if (token.actor.kind === 'character') {
      const next = { ...token, hidden: false, ...arrangedTokenPositionForActor(token.actor, heroIndex) };
      heroIndex += 1;
      return next;
    }
    const next = { ...token, hidden: false, ...arrangedTokenPositionForActor(token.actor, adversaryIndex) };
    adversaryIndex += 1;
    return next;
  });
}

export function measureRange(source: TokenState | null, target: TokenState | null, gridSize: number): RangeMeasurement | null {
  if (!source) return null;
  if (!target) {
    return { cells: 0, category: 'Вплотную', line: null };
  }
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const width = Math.hypot(dx, dy);
  const cells = width / Math.max(1, gridSize);
  return {
    cells,
    category: rangeCategoryForCells(cells),
    line: {
      left: source.x,
      top: source.y,
      width,
      angle: Math.atan2(dy, dx),
      labelLeft: source.x + dx / 2,
      labelTop: source.y + dy / 2
    }
  };
}

export function rangeCategoryForCells(cells: number): RangeMeasurement['category'] {
  if (cells <= 1) return 'Вплотную';
  if (cells <= 3) return 'Близко';
  if (cells <= 6) return 'Средне';
  if (cells <= 12) return 'Далеко';
  return 'Очень далеко';
}

export function isTokenVisibleToRole(token: TokenState, role: 'gm' | 'player' | 'observer'): boolean {
  if (role === 'gm') return true;
  if (token.hidden) return false;
  return token.ownership.visibility === 'public';
}

function sanitizeTokenVisibility(visibility: TableVisibility | undefined): TableVisibility | null {
  if (!visibility) return null;
  return visibility === 'gm' ? 'gm' : 'public';
}
