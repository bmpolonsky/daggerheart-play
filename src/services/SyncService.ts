import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import { hasStringFields, isRecord } from '../core/utils/guards';
import type { DamageType, DeathMoveChoice, DiceVisualTone, FeedEntry, PersistedState, RollPublication, TraitId } from '../domain/rules/types';
import type { SyncEvent, SyncEventContext, SyncTargetPeer, SyncTransport, TableParticipant } from '../domain/tabletop/types';
import { hydratePersistedState, isPersistedState, normalizePersistedState, snapshotPersistedState } from '../stores/persistedState';
import { isPlayerActivationQueueMessage, type PlayerActivationQueueMessage } from './PlayerActivationQueueService';
import { isPlayerPresence, isPlayerVoiceControlMessage, type PlayerPresence, type PlayerVoiceControlMessage } from './PlayerPresenceService';

export type SyncServiceMode = 'authority' | 'readonly';
type SyncEventKind = SyncEvent['kind'];
type SyncValueGuard<T> = (value: unknown) => value is T;

interface SyncChannel<T> {
  kind: SyncEventKind;
  guard?: SyncValueGuard<T>;
}

export interface PlayerTokenMoveMessage {
  sceneId: string;
  tokenId: string;
  actorId: string;
  x: number;
  y: number;
}

export interface PlayerRestChoiceMessage {
  type: 'playerRestChoice';
  participantId: string;
  restEntryId: string;
  actorId: string;
  choices: string[];
  updatedAt: string;
}

export interface SnapshotRequestMessage {
  requestedAt: string;
  reason: 'join' | 'peer-reconnect' | 'manual';
}

export interface PlayerCharacterResourcePatch {
  hope?: { value: number };
  hp?: { marked: number };
  stress?: { marked: number };
  armor?: { markedSlots: number };
  domainCards?: Array<{ id: string; tokens?: { value: number } }>;
  companion?: { stress?: { marked: number } };
}

export interface PlayerCharacterResourcesMessage {
  type: 'playerCharacterResources';
  participantId: string;
  actorId: string;
  actorName?: string;
  resources: PlayerCharacterResourcePatch;
  updatedAt: string;
}

export type PlayerRollIntent =
  | {
      type: 'duality';
      rollType: 'action' | 'reaction';
      trait?: TraitId | null;
      difficulty: number;
      manualModifier?: number;
      advantageCount?: number;
      disadvantageCount?: number;
      experienceIds?: string[];
      spendHopeForExperiences?: boolean;
      notes?: string;
    }
  | {
      type: 'manualDice';
      formula: string;
      label?: string;
      advantageCount?: number;
      disadvantageCount?: number;
      diceTones?: DiceVisualTone[];
      notes?: string;
    }
  | {
      type: 'damage';
      formula: string;
      critical?: boolean;
      damageType?: DamageType;
      notes?: string;
    };

export interface PlayerRollIntentMessage {
  type: 'playerRollIntent';
  intentId: string;
  participantId: string;
  actorId: string;
  actorName?: string;
  publication?: RollPublication;
  createdAt: string;
  intent: PlayerRollIntent;
  resourcePatch?: PlayerCharacterResourcePatch;
  teamworkEntryId?: string;
}

export type PlayerDecision =
  | {
      kind: 'deathMove';
      deathMoveEntryId: string;
      choice: DeathMoveChoice;
      allocation?: { hpCleared: number; stressCleared: number };
    }
  | {
      kind: 'teamworkRoll';
      teamworkEntryId: string;
      trait?: TraitId;
    };

export interface PlayerDecisionMessage {
  type: 'playerDecision';
  decisionId: string;
  participantId: string;
  actorId: string;
  actorName?: string;
  createdAt: string;
  decision: PlayerDecision;
}

export type AssetRequestReason = 'scene-background';

export interface AssetRequestMessage {
  type: 'request';
  requestId: string;
  assetId: string;
  reason: AssetRequestReason;
  requestedAt: string;
}

export interface AssetUnavailableMessage {
  type: 'unavailable';
  requestId: string;
  assetId: string;
  reason: string;
}

export type AssetMessage =
  | AssetRequestMessage
  | AssetUnavailableMessage;

const syncChannels = {
  playerRequest: channel<unknown>('playerRequest'),
  playerActivation: channel<PlayerActivationQueueMessage>('playerActivation', isPlayerActivationQueueMessage),
  playerPresence: channel<PlayerPresence>('presence', isPlayerPresence),
  playerVoiceControl: channel<PlayerVoiceControlMessage>('playerVoiceControl', isPlayerVoiceControlMessage),
  feed: channel<FeedEntry>('feed', isFeedEntry),
  playerTokenMove: channel<PlayerTokenMoveMessage>('playerTokenMove', isPlayerTokenMoveMessage),
  playerRestChoice: channel<PlayerRestChoiceMessage>('playerRestChoice', isPlayerRestChoiceMessage),
  playerRollIntent: channel<PlayerRollIntentMessage>('playerRollIntent', isPlayerRollIntentMessage),
  playerDecision: channel<PlayerDecisionMessage>('playerDecision', isPlayerDecisionMessage),
  snapshotRequest: channel<SnapshotRequestMessage>('snapshotRequest', isSnapshotRequestMessage),
  playerCharacterResources: channel<PlayerCharacterResourcesMessage>('actor', isPlayerCharacterResourcesMessage),
  asset: channel<AssetMessage>('asset', isAssetMessage)
};

export class LocalSyncTransport implements SyncTransport {
  readonly id = 'local';
  readonly label = 'Local only';
  private listeners = new Set<(event: SyncEvent, context?: SyncEventContext) => void>();

  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    this.listeners.clear();
  }

  async publish(event: SyncEvent, _targetPeer?: SyncTargetPeer): Promise<void> {
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: (event: SyncEvent, context?: SyncEventContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class SyncService {
  private transport: SyncTransport = new LocalSyncTransport();
  private participant: TableParticipant | null = null;
  private mode: SyncServiceMode = 'authority';
  private unsubscribeSnapshot: (() => void) | null = null;

  getTransport(): SyncTransport {
    return this.transport;
  }

  getMode(): SyncServiceMode {
    return this.mode;
  }

  setTransport(transport: SyncTransport): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    this.transport = transport;
  }

  async connectLocal(participant: TableParticipant): Promise<void> {
    await this.connectAuthority('local', participant);
  }

  async connectAuthority(roomId: string, participant: TableParticipant): Promise<void> {
    this.participant = participant;
    this.mode = 'authority';
    await this.transport.connect(roomId, participant);
  }

  async connectReadOnly(
    roomId: string,
    participant: TableParticipant,
    onSnapshot: (state: PersistedState, event: SyncEvent) => void = (state) => hydratePersistedState(state)
  ): Promise<void> {
    this.unsubscribeSnapshot?.();
    this.participant = participant;
    this.mode = 'readonly';
    this.unsubscribeSnapshot = this.transport.subscribe((event) => {
      if (event.kind !== 'snapshot' || !isPersistedState(event.value)) {
        return;
      }
      onSnapshot(normalizePersistedState(event.value), event);
    });
    try {
      await this.transport.connect(roomId, participant);
    } catch (error) {
      this.unsubscribeSnapshot?.();
      this.unsubscribeSnapshot = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    await this.transport.disconnect();
    this.participant = null;
    this.mode = 'authority';
  }

  async publishPlayerRequest(request: unknown): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRequest, request);
  }

  subscribePlayerRequests(listener: (request: unknown, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRequest, listener);
  }

  async publishPlayerActivation(message: PlayerActivationQueueMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerActivation, message);
  }

  subscribePlayerActivations(listener: (message: PlayerActivationQueueMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerActivation, listener);
  }

  async publishPlayerPresence(presence: PlayerPresence): Promise<boolean> {
    return this.publishChannel(syncChannels.playerPresence, presence);
  }

  subscribePlayerPresence(listener: (presence: PlayerPresence, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerPresence, listener);
  }

  async publishPlayerVoiceControl(message: PlayerVoiceControlMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerVoiceControl, message, targetPeer);
  }

  subscribePlayerVoiceControls(listener: (message: PlayerVoiceControlMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerVoiceControl, listener);
  }

  async publishFeedEntry(entry: FeedEntry): Promise<boolean> {
    return this.publishChannel(syncChannels.feed, entry);
  }

  subscribeFeedEntries(listener: (entry: FeedEntry, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.feed, listener);
  }

  async publishPlayerTokenMove(move: PlayerTokenMoveMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerTokenMove, move);
  }

  subscribePlayerTokenMoves(listener: (move: PlayerTokenMoveMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerTokenMove, listener);
  }

  async publishPlayerRestChoice(message: Omit<PlayerRestChoiceMessage, 'type' | 'updatedAt'>): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRestChoice, {
      ...message,
      type: 'playerRestChoice',
      updatedAt: nowIso()
    });
  }

  subscribePlayerRestChoices(listener: (message: PlayerRestChoiceMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRestChoice, listener);
  }

  async publishPlayerRollIntent(message: PlayerRollIntentMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRollIntent, message);
  }

  subscribePlayerRollIntents(listener: (message: PlayerRollIntentMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRollIntent, listener);
  }

  async publishPlayerDecision(message: PlayerDecisionMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerDecision, message);
  }

  subscribePlayerDecisions(listener: (message: PlayerDecisionMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerDecision, listener);
  }

  async publishSnapshotRequest(reason: SnapshotRequestMessage['reason'] = 'join', targetPeer?: SyncTargetPeer): Promise<boolean> {
    const createdAt = nowIso();
    return this.publishChannel(syncChannels.snapshotRequest, { requestedAt: createdAt, reason }, targetPeer);
  }

  subscribeSnapshotRequests(listener: (request: SnapshotRequestMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.snapshotRequest, listener);
  }

  async publishPlayerCharacterResources(message: PlayerCharacterResourcesMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerCharacterResources, message);
  }

  subscribePlayerCharacterResources(listener: (message: PlayerCharacterResourcesMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerCharacterResources, listener);
  }

  async publishAssetMessage(message: AssetMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.asset, message, targetPeer);
  }

  subscribeAssetMessages(listener: (message: AssetMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.asset, listener);
  }

  async publishSnapshot(snapshot: PersistedState = snapshotPersistedState(), targetPeer?: SyncTargetPeer): Promise<boolean> {
    if (this.mode === 'readonly') {
      return false;
    }
    await this.transport.publish(this.createEvent('snapshot', snapshot), targetPeer);
    return true;
  }

  private async publishChannel<T>(channel: SyncChannel<T>, value: T, targetPeer?: SyncTargetPeer): Promise<boolean> {
    await this.transport.publish(this.createEvent(channel.kind, value), targetPeer);
    return true;
  }

  private subscribeChannel<T>(channel: SyncChannel<T>, listener: (value: T, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.transport.subscribe((event, context) => {
      if (event.kind !== channel.kind) return;
      if (channel.guard && !channel.guard(event.value)) return;
      listener(event.value as T, event, context);
    });
  }

  private createEvent(kind: SyncEventKind, value: unknown): SyncEvent {
    return {
      id: createId(syncEventIdPrefix(kind)),
      createdAt: nowIso(),
      authorId: this.currentAuthorId(),
      kind,
      value
    };
  }

  private currentAuthorId(): string {
    return this.participant?.id ?? (this.mode === 'authority' ? 'local-gm' : 'local-player');
  }
}

function channel<T>(kind: SyncEventKind, guard?: SyncValueGuard<T>): SyncChannel<T> {
  return { kind, guard };
}

function syncEventIdPrefix(kind: SyncEventKind): string {
  return `sync_${kind.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

function isPlayerTokenMoveMessage(value: unknown): value is PlayerTokenMoveMessage {
  if (!isRecord(value)) return false;
  return (
    hasStringFields(value, ['sceneId', 'tokenId', 'actorId']) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isPlayerRestChoiceMessage(value: unknown): value is PlayerRestChoiceMessage {
  if (!isRecord(value) || value.type !== 'playerRestChoice') return false;
  return (
    hasStringFields(value, ['participantId', 'restEntryId', 'actorId', 'updatedAt']) &&
    Array.isArray(value.choices) &&
    value.choices.every((choice) => typeof choice === 'string')
  );
}

function isPlayerRollIntentMessage(value: unknown): value is PlayerRollIntentMessage {
  if (!isRecord(value) || value.type !== 'playerRollIntent' || !isRecord(value.intent)) return false;
  return (
    hasStringFields(value, ['intentId', 'participantId', 'actorId', 'createdAt']) &&
    (value.actorName === undefined || typeof value.actorName === 'string') &&
    (value.publication === undefined || value.publication === 'public' || value.publication === 'gm' || value.publication === 'private') &&
    (value.teamworkEntryId === undefined || typeof value.teamworkEntryId === 'string') &&
    isPlayerRollIntent(value.intent) &&
    (value.resourcePatch === undefined || isPlayerCharacterResourcePatch(value.resourcePatch))
  );
}

function isPlayerDecisionMessage(value: unknown): value is PlayerDecisionMessage {
  if (!isRecord(value) || value.type !== 'playerDecision' || !isRecord(value.decision)) return false;
  return (
    hasStringFields(value, ['decisionId', 'participantId', 'actorId', 'createdAt']) &&
    (value.actorName === undefined || typeof value.actorName === 'string') &&
    isPlayerDecision(value.decision)
  );
}

function isPlayerDecision(value: unknown): value is PlayerDecision {
  if (!isRecord(value)) return false;
  if (value.kind === 'deathMove') {
    return (
      typeof value.deathMoveEntryId === 'string' &&
      (value.choice === 'blazeOfGlory' || value.choice === 'avoidDeath' || value.choice === 'riskItAll') &&
      (value.allocation === undefined || isOptionalNumberRecord(value.allocation, ['hpCleared', 'stressCleared']))
    );
  }
  if (value.kind === 'teamworkRoll') {
    return (
      typeof value.teamworkEntryId === 'string' &&
      (value.trait === undefined || isTraitId(value.trait))
    );
  }
  return false;
}

function isTraitId(value: unknown): value is TraitId {
  return value === 'agility' || value === 'strength' || value === 'finesse' || value === 'instinct' || value === 'presence' || value === 'knowledge';
}

function isSnapshotRequestMessage(value: unknown): value is SnapshotRequestMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.requestedAt === 'string' &&
    (value.reason === 'join' || value.reason === 'peer-reconnect' || value.reason === 'manual')
  );
}

function isPlayerCharacterResourcesMessage(value: unknown): value is PlayerCharacterResourcesMessage {
  if (!isRecord(value) || value.type !== 'playerCharacterResources' || !isRecord(value.resources)) return false;
  return (
    hasStringFields(value, ['participantId', 'actorId', 'updatedAt']) &&
    (value.actorName === undefined || typeof value.actorName === 'string') &&
    isPlayerCharacterResourcePatch(value.resources)
  );
}

function isPlayerCharacterResourcePatch(value: unknown): value is PlayerCharacterResourcePatch {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumberRecord(value.hope, ['value']) &&
    isOptionalNumberRecord(value.hp, ['marked']) &&
    isOptionalNumberRecord(value.stress, ['marked']) &&
    isOptionalNumberRecord(value.armor, ['markedSlots']) &&
    isOptionalDomainCardResourceList(value.domainCards) &&
    isOptionalCompanionResourcePatch(value.companion)
  );
}

function isOptionalCompanionResourcePatch(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return value.stress === undefined || isOptionalNumberRecord(value.stress, ['marked']);
}

function isPlayerRollIntent(value: unknown): value is PlayerRollIntent {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'duality') {
    return (
      (value.rollType === 'action' || value.rollType === 'reaction') &&
      typeof value.difficulty === 'number' &&
      Number.isFinite(value.difficulty) &&
      (value.trait === undefined || value.trait === null || typeof value.trait === 'string') &&
      (value.manualModifier === undefined || (typeof value.manualModifier === 'number' && Number.isFinite(value.manualModifier))) &&
      (value.advantageCount === undefined || (typeof value.advantageCount === 'number' && Number.isFinite(value.advantageCount))) &&
      (value.disadvantageCount === undefined || (typeof value.disadvantageCount === 'number' && Number.isFinite(value.disadvantageCount))) &&
      (value.experienceIds === undefined || (Array.isArray(value.experienceIds) && value.experienceIds.every((id) => typeof id === 'string'))) &&
      (value.spendHopeForExperiences === undefined || typeof value.spendHopeForExperiences === 'boolean') &&
      (value.notes === undefined || typeof value.notes === 'string')
    );
  }
  if (value.type === 'manualDice') {
    return (
      typeof value.formula === 'string' &&
      (value.label === undefined || typeof value.label === 'string') &&
      (value.advantageCount === undefined || (typeof value.advantageCount === 'number' && Number.isFinite(value.advantageCount))) &&
      (value.disadvantageCount === undefined || (typeof value.disadvantageCount === 'number' && Number.isFinite(value.disadvantageCount))) &&
      (value.diceTones === undefined || (Array.isArray(value.diceTones) && value.diceTones.every(isDiceVisualTone))) &&
      (value.notes === undefined || typeof value.notes === 'string')
    );
  }
  if (value.type === 'damage') {
    return (
      typeof value.formula === 'string' &&
      (value.critical === undefined || typeof value.critical === 'boolean') &&
      (value.damageType === undefined || typeof value.damageType === 'string') &&
      (value.notes === undefined || typeof value.notes === 'string')
    );
  }
  return false;
}

function isOptionalNumberRecord(value: unknown, fields: string[]): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return fields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]));
}

function isDiceVisualTone(value: unknown): value is DiceVisualTone {
  return value === 'hope' || value === 'fear' || value === 'neutral' || value === 'advantage' || value === 'disadvantage' || value === 'damage' || value === 'critical';
}

function isOptionalDomainCardResourceList(value: unknown): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((item) => (
    isRecord(item) &&
    typeof item.id === 'string' &&
    (item.tokens === undefined || isOptionalNumberRecord(item.tokens, ['value']))
  ));
}

function isFeedEntry(value: unknown): value is FeedEntry {
  return isRecord(value) && hasStringFields(value, ['id', 'createdAt', 'type']);
}

function isAssetMessage(value: unknown): value is AssetMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'request':
      return (
        hasStringFields(value, ['requestId', 'assetId', 'reason', 'requestedAt']) &&
        isAssetRequestReason(value.reason)
      );
    case 'unavailable':
      return hasStringFields(value, ['requestId', 'assetId', 'reason']);
    default:
      return false;
  }
}

function isAssetRequestReason(value: unknown): value is AssetRequestReason {
  return value === 'scene-background';
}
