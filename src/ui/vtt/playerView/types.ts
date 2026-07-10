import type { TraitId } from '../../../domain/rules/types';
import type { PlayerActivationQueueItem } from '../../../services/PlayerActivationQueueService';
import type { PlayerPresence } from '../../../services/PlayerPresenceService';

export type TableViewRole = 'player' | 'gm';
export type PlayerSheetSectionId = 'overview' | 'traits' | 'actions' | 'features' | 'cards' | 'gear';
export type SharedToolsTab = 'scenes' | 'characters' | 'combat' | 'cards' | 'library' | 'notes' | 'handouts' | 'settings';

export type PlayerRosterActor = {
  tokenId: string;
  actorId: string;
  kind: 'character' | 'adversary' | 'environment';
  name: string;
  subtitle: string;
  imageUrl: string;
  isOnScene: boolean;
  hidden?: boolean;
  hope?: { value: number; max: number };
  hp?: { marked: number; max: number };
  stress?: { marked: number; max: number };
  activationRequest?: PlayerActivationQueueItem;
  presence?: PlayerPresence;
};

export type PlayerViewedActor = { kind: 'character' | 'adversary' | 'environment'; actorId: string };
export type PlayerMobileLayer = 'feed' | 'scene' | 'sheet';
export type PlayerRollType = 'action' | 'reaction';

export type PlayerRollDraft =
  | { kind: 'trait'; title: string; subtitle: string; trait: TraitId; difficulty?: number; notes?: string; rollType?: PlayerRollType }
  | { kind: 'weapon'; title: string; subtitle: string; trait: TraitId; damageFormula: string; damageType: string; rollType?: PlayerRollType }
  | { kind: 'card'; title: string; subtitle: string; trait: TraitId; cardId: string; difficulty?: number; notes?: string; rollType?: PlayerRollType };
