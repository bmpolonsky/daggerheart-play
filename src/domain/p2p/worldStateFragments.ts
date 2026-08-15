import type { GameCustomContent } from '../game/gameDocument';
import { emptyCustomContent } from '../game/gameDocument';
import type { PersistedState, SceneTableState } from '../rules/types';
import type { TableScene, TokenState } from '../tabletop/types';

export const WORLD_STATE_KEYS = {
  manifest: 'manifest',
  game: 'game',
  characters: 'characters',
  encounter: 'encounter',
  rollLog: 'rollLog',
  feed: 'feed',
  ui: 'ui',
  sceneTable: 'sceneTable',
  customContent: 'customContent'
} as const;

export type WorldStateFragments = Record<string, unknown>;

interface SceneWithoutTokens extends Omit<TableScene, 'tokens'> {
  tokens?: never;
}

type SceneTableWithoutScenes = Omit<SceneTableState, 'scenes'>;

export interface DecodedWorldState {
  state: PersistedState;
  customContent: GameCustomContent;
}

export function sceneFragmentKey(sceneId: string): string {
  return `scene:${sceneId}`;
}

export function sceneTokensFragmentKey(sceneId: string): string {
  return `sceneTokens:${sceneId}`;
}

export function encodeWorldState(
  state: PersistedState,
  customContent: GameCustomContent = emptyCustomContent()
): WorldStateFragments {
  const { scenes, ...sceneTable } = state.sceneTable;
  const fragments: WorldStateFragments = {
    [WORLD_STATE_KEYS.manifest]: { schemaVersion: state.schemaVersion },
    [WORLD_STATE_KEYS.game]: state.game,
    [WORLD_STATE_KEYS.characters]: state.characters,
    [WORLD_STATE_KEYS.encounter]: state.encounter,
    [WORLD_STATE_KEYS.rollLog]: state.rollLog,
    [WORLD_STATE_KEYS.feed]: state.feed,
    [WORLD_STATE_KEYS.ui]: state.ui,
    [WORLD_STATE_KEYS.sceneTable]: sceneTable,
    [WORLD_STATE_KEYS.customContent]: customContent
  };

  for (const [sceneId, scene] of Object.entries(scenes)) {
    const { tokens, ...sceneWithoutTokens } = scene;
    fragments[sceneFragmentKey(sceneId)] = sceneWithoutTokens;
    fragments[sceneTokensFragmentKey(sceneId)] = tokens;
  }

  return toJsonValue(fragments);
}

export function decodeWorldState(fragments: WorldStateFragments): DecodedWorldState | null {
  const manifest = fragments[WORLD_STATE_KEYS.manifest] as { schemaVersion?: unknown } | undefined;
  const sceneTable = fragments[WORLD_STATE_KEYS.sceneTable] as SceneTableWithoutScenes | undefined;
  if (!manifest || typeof manifest.schemaVersion !== 'number' || !sceneTable) return null;

  const scenes: Record<string, TableScene> = {};
  for (const sceneId of sceneTable.sceneOrder) {
    const scene = fragments[sceneFragmentKey(sceneId)] as SceneWithoutTokens | undefined;
    if (!scene) continue;
    const tokens = fragments[sceneTokensFragmentKey(sceneId)];
    scenes[sceneId] = {
      ...scene,
      tokens: Array.isArray(tokens) ? tokens as TokenState[] : []
    };
  }

  const state = {
    schemaVersion: manifest.schemaVersion,
    game: fragments[WORLD_STATE_KEYS.game],
    characters: fragments[WORLD_STATE_KEYS.characters],
    encounter: fragments[WORLD_STATE_KEYS.encounter],
    rollLog: fragments[WORLD_STATE_KEYS.rollLog],
    feed: fragments[WORLD_STATE_KEYS.feed],
    ui: fragments[WORLD_STATE_KEYS.ui],
    sceneTable: { ...sceneTable, scenes }
  } as PersistedState;

  return {
    state: toJsonValue(state),
    customContent: toJsonValue(
      (fragments[WORLD_STATE_KEYS.customContent] as GameCustomContent | undefined) ?? emptyCustomContent()
    )
  };
}

export function changedWorldStateFragments(
  previous: WorldStateFragments,
  next: WorldStateFragments
): { upserts: WorldStateFragments; deletes: string[] } {
  const upserts: WorldStateFragments = {};
  for (const [key, value] of Object.entries(next)) {
    if (jsonSignature(previous[key]) !== jsonSignature(value)) upserts[key] = value;
  }
  return {
    upserts,
    deletes: Object.keys(previous).filter((key) => !(key in next))
  };
}

function jsonSignature(value: unknown): string {
  return JSON.stringify(value);
}

function toJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
