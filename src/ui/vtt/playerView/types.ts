import type { TraitId } from '../../../domain/rules/types';
import type { PlayerActivationQueueItem } from '../../../services/PlayerActivationQueueService';
import type { PlayerPresence } from '../../../services/PlayerPresenceService';

export type TableViewRole = 'player' | 'gm';
export type PlayerSheetSectionId = 'overview' | 'traits' | 'actions' | 'features' | 'cards' | 'gear';
export type SharedToolsTab = 'scenes' | 'characters' | 'combat' | 'cards' | 'library' | 'notes' | 'handouts' | 'generators' | 'settings';

export type PlayerRosterActor = {
  tokenId: string;
  actorId: string;
  kind: 'character' | 'companion' | 'adversary' | 'environment';
  name: string;
  subtitle: string;
  imageUrl: string;
  isOnScene: boolean;
  hidden?: boolean;
  ownerName?: string;
  evasion?: number;
  hope?: { value: number; max: number };
  hp?: { marked: number; max: number };
  stress?: { marked: number; max: number };
  activationRequest?: PlayerActivationQueueItem;
  presence?: PlayerPresence;
};

export type ConnectedPlayerRow = {
  id: string;
  actorId: string;
  playerName: string;
  characterName: string;
  peerId: string;
  inCall: boolean;
  micMuted: boolean;
  cameraOff: boolean;
  activationRequest?: PlayerActivationQueueItem;
};

export type SceneActorGroups = {
  heroes: PlayerRosterActor[];
  adversaries: PlayerRosterActor[];
  environments: PlayerRosterActor[];
};

export type PlayerViewedActor = { kind: 'character' | 'adversary' | 'environment'; actorId: string };
export type PlayerMobileLayer = 'feed' | 'scene' | 'sheet' | 'tools';
export type PlayerRollType = 'action' | 'reaction';

export type PlayerRollDraft =
  | { kind: 'trait'; title: string; subtitle: string; trait: TraitId; difficulty?: number; notes?: string; rollType?: PlayerRollType }
  | { kind: 'weapon'; title: string; subtitle: string; trait: TraitId; damageFormula: string; damageType: string; rollType?: PlayerRollType }
  | { kind: 'card'; title: string; subtitle: string; trait: TraitId; cardId: string; difficulty?: number; notes?: string; rollType?: PlayerRollType }
  | { kind: 'companion'; title: string; subtitle: string; trait: TraitId; damageFormula: string; damageType: string; difficulty?: number; notes?: string; rollType?: PlayerRollType };
