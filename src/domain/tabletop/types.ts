import type { DamageType, TraitId } from '../rules/types';
import type { SceneMusicState } from '../audio/sceneAudio';

export type TableActorKind = 'character' | 'adversary' | 'environment' | 'npc' | 'companion';
export type SceneLayerKind = 'background' | 'overlay' | 'fog' | 'annotation';
export type TableGridType = 'none' | 'square';
export type TableSyncRole = 'gm' | 'player' | 'observer';
export type TableVisibility = 'public' | 'gm';

export interface ActorRef {
  kind: TableActorKind;
  id: string;
}

export interface Ownership {
  ownerId: string | null;
  editableBy: TableSyncRole[];
  visibility: TableVisibility;
}

export interface TableParticipant {
  id: string;
  name: string;
  role: TableSyncRole;
  actorIds: string[];
  peerId?: string;
  connected: boolean;
  updatedAt: string;
}

export interface MapAsset {
  id: string;
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  byteSize?: number;
  storage: 'indexeddb' | 'remote';
  url?: string;
  resourcePath?: string;
  createdAt: string;
}

export interface SceneLayer {
  id: string;
  kind: SceneLayerKind;
  name: string;
  assetId?: string;
  url?: string;
  opacity: number;
  visible: boolean;
  gridType: TableGridType;
  gridSize: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TokenState {
  id: string;
  actor: ActorRef;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  hidden: boolean;
  locked: boolean;
  tint?: string;
  aura?: string;
  ownership: Ownership;
}

export interface TableScene {
  id: string;
  name: string;
  subtitle: string;
  mode: 'scene' | 'tactical';
  backgroundAssetId?: string;
  backgroundUrl: string;
  music: SceneMusicState;
  layers: SceneLayer[];
  tokens: TokenState[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RollContext {
  actor?: ActorRef;
  target?: ActorRef;
  trait?: TraitId;
  difficulty: number;
  damageFormula?: string;
  damageType?: DamageType;
  sourceName?: string;
  advantageCount?: number;
  disadvantageCount?: number;
}

export interface SyncEvent {
  id: string;
  createdAt: string;
  authorId: string;
  kind: 'scene' | 'actor' | 'roll' | 'presence' | 'asset' | 'snapshot' | 'snapshotRequest' | 'playerRequest' | 'playerTokenMove' | 'playerRestChoice' | 'playerRollIntent' | 'playerDecision' | 'playerActivation' | 'playerVoiceControl' | 'playerCharacterCreate' | 'callPresence' | 'feed';
  value: unknown;
}

export type SyncTargetPeer = string | undefined;

export interface SyncEventContext {
  sourcePeerId?: string;
  verifiedSourcePeerId?: string;
}

export interface SyncTransport {
  readonly id: string;
  readonly label: string;
  connect(roomId: string, participant: TableParticipant): Promise<void>;
  disconnect(): Promise<void>;
  publish(event: SyncEvent, targetPeer?: SyncTargetPeer): Promise<void>;
  subscribe(listener: (event: SyncEvent, context?: SyncEventContext) => void): () => void;
}
