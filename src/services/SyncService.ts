import { withSessionFeatures } from '../domain/p2p/sessionFeatures';
import { isValidExtraDice, type ExtraDieTerm } from '../domain/rules/extraDice';
import { isPortraitUploadMessage, type PortraitUploadMessage } from '../domain/p2p/portraitUpload';
import { createId } from '../core/utils/id';
import { nowIso } from '../core/utils/date';
import { hasStringFields, isRecord } from '../core/utils/guards';
import type { Character, CharacterCondition, DamageType, DeathMoveChoice, DiceVisualTone, FeedEntry, PersistedState, RollPublication, TraitId } from '../domain/rules/types';
import type { SyncEvent, SyncEventContext, SyncTargetPeer, SyncTransport, TableParticipant } from '../domain/tabletop/types';
import { migratePersistedState } from '../domain/migrations/persistedState';
import { hydratePersistedState, isPersistedState, snapshotPersistedState } from '../stores/persistedState';
import { isPlayerActivationQueueMessage, type PlayerActivationQueueMessage } from './PlayerActivationQueueService';
import { isPlayerPresence, isPlayerVoiceControlMessage, type PlayerPresence, type PlayerVoiceControlMessage } from './PlayerPresenceService';
import { isCallPresenceMessage, type CallPresenceMessage } from './MediaCallService';
import { reportOperationalError } from '../core/observability/sentry';
import { isCharacterPatch, type CharacterPatch } from '../domain/p2p/characterPatch';

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
  wealth?: { coins?: number; handfuls?: number; bags?: number; chests?: number };
  domainCards?: Array<{ id: string; tokens?: { value: number } }>;
  companion?: { stress?: { marked: number } };
  conditions?: CharacterCondition[];
}

export interface PlayerCharacterResourcesMessage {
  type: 'playerCharacterResources';
  participantId: string;
  actorId: string;
  actorName?: string;
  resources: PlayerCharacterResourcePatch;
  updatedAt: string;
}

export type PlayerCharacterUpdateMessage = {
  type: 'playerCharacterUpdate';
  participantId: string;
  actorId: string;
  actorName?: string;
  revision: number;
  updatedAt: string;
} & ({ character: Character; patch?: never } | { character?: never; patch: CharacterPatch });

export interface PlayerCharacterUpdateAckMessage {
  type: 'playerCharacterUpdateAck';
  participantId: string;
  actorId: string;
  revision: number;
  acknowledgedAt: string;
  /** Omitted by older authorities: treat as accepted. */
  accepted?: boolean;
  reason?: string;
  /** Optional correlation for authorities that persist operation receipts. */
  operationHash?: string;
}

export interface PlayerCharacterCreateMessage {
  type: 'playerCharacterCreate';
  requestId: string;
  participantId: string;
  participantName?: string;
  draft: Partial<Character>;
  createdAt: string;
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
      extraDice?: ExtraDieTerm[];
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

export interface PlayerRollAckMessage {
  type: 'playerRollAck';
  intentId: string;
  accepted: boolean;
  operationHash?: string;
  reason?: string;
}

export type SessionCapabilitiesMessage =
  | { type: 'request'; requestId: string }
  | { type: 'response'; requestId: string; extraActionDiceV1: boolean };


export type PlayerDecision =
  | {
      kind: 'deathMove';
      deathMoveEntryId: string;
      choice: DeathMoveChoice;
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

export type AssetRequestReason = 'scene-background' | 'scene-music' | 'portrait';

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
  | PortraitUploadMessage
  | AssetRequestMessage
  | AssetUnavailableMessage;

const syncChannels = {
  playerRequest: channel<unknown>('playerRequest'),
  playerActivation: channel<PlayerActivationQueueMessage>('playerActivation', isPlayerActivationQueueMessage),
  playerPresence: channel<PlayerPresence>('presence', isPlayerPresence),
  playerVoiceControl: channel<PlayerVoiceControlMessage>('playerVoiceControl', isPlayerVoiceControlMessage),
  callPresence: channel<CallPresenceMessage>('callPresence', isCallPresenceMessage),
  feed: channel<FeedEntry>('feed', isFeedEntry),
  playerTokenMove: channel<PlayerTokenMoveMessage>('playerTokenMove', isPlayerTokenMoveMessage),
  playerRestChoice: channel<PlayerRestChoiceMessage>('playerRestChoice', isPlayerRestChoiceMessage),
  playerRollIntent: channel<PlayerRollIntentMessage>('playerRollIntent', isPlayerRollIntentMessage),
  playerRollAck: channel<PlayerRollAckMessage>('playerRollAck', isPlayerRollAckMessage),
  sessionCapabilities: channel<SessionCapabilitiesMessage>('sessionCapabilities', isSessionCapabilitiesMessage),
  playerDecision: channel<PlayerDecisionMessage>('playerDecision', isPlayerDecisionMessage),
  playerCharacterCreate: channel<PlayerCharacterCreateMessage>('playerCharacterCreate', isPlayerCharacterCreateMessage),
  snapshotRequest: channel<SnapshotRequestMessage>('snapshotRequest', isSnapshotRequestMessage),
  playerCharacterResources: channel<PlayerCharacterResourcesMessage>('actor', isPlayerCharacterResourcesMessage),
  playerCharacterUpdate: channel<PlayerCharacterUpdateMessage>('actor', isPlayerCharacterUpdateMessage),
  playerCharacterUpdateAck: channel<PlayerCharacterUpdateAckMessage>('playerCharacterUpdateAck', isPlayerCharacterUpdateAckMessage),
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
    try {
      await this.transport.connect(roomId, participant);
    } catch (error) {
      this.reportNetworkError(error, 'connect', { roomId, participantId: participant.id });
      throw error;
    }
  }

  async connectReadOnly(
    roomId: string,
    participant: TableParticipant,
    onSnapshot: (state: PersistedState, event: SyncEvent, context?: SyncEventContext) => void = (state) => hydratePersistedState(state)
  ): Promise<void> {
    this.unsubscribeSnapshot?.();
    this.participant = participant;
    this.mode = 'readonly';
    const seenSnapshotIds = createEventDeduper();
    this.unsubscribeSnapshot = this.transport.subscribe((event, context) => {
      if (event.kind !== 'snapshot' || !isPersistedState(event.value)) {
        return;
      }
      if (seenSnapshotIds(event.id)) return;
      onSnapshot(migratePersistedState(event.value), event, context);
    });
    try {
      await this.transport.connect(roomId, participant);
    } catch (error) {
      this.unsubscribeSnapshot?.();
      this.unsubscribeSnapshot = null;
      this.reportNetworkError(error, 'connect', { roomId, participantId: participant.id });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    try {
      await this.transport.disconnect();
    } catch (error) {
      this.reportNetworkError(error, 'disconnect');
      throw error;
    }
    this.participant = null;
    this.mode = 'authority';
  }

  async publishPlayerRequest(request: unknown, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRequest, request, targetPeer);
  }

  subscribePlayerRequests(listener: (request: unknown, event: SyncEvent, context?: SyncEventContext) => void): () => void {
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

  subscribePlayerPresence(listener: (presence: PlayerPresence, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerPresence, listener);
  }

  async publishPlayerVoiceControl(message: PlayerVoiceControlMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerVoiceControl, message, targetPeer);
  }

  subscribePlayerVoiceControls(listener: (message: PlayerVoiceControlMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerVoiceControl, listener);
  }

  async publishCallPresence(message: CallPresenceMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.callPresence, message);
  }

  subscribeCallPresence(listener: (message: CallPresenceMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.callPresence, listener);
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

  subscribePlayerRestChoices(listener: (message: PlayerRestChoiceMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRestChoice, listener);
  }

  async publishPlayerRollIntent(message: PlayerRollIntentMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRollIntent, message);
  }

  subscribePlayerRollIntents(listener: (message: PlayerRollIntentMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRollIntent, listener);
  }

  async publishPlayerRollAck(message: PlayerRollAckMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerRollAck, message, targetPeer);
  }

  subscribePlayerRollAcks(listener: (message: PlayerRollAckMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerRollAck, listener);
  }

  async publishSessionCapabilities(message: SessionCapabilitiesMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.sessionCapabilities, message, targetPeer);
  }

  subscribeSessionCapabilities(listener: (message: SessionCapabilitiesMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.sessionCapabilities, listener);
  }

  async publishPlayerDecision(message: PlayerDecisionMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerDecision, message);
  }

  subscribePlayerDecisions(listener: (message: PlayerDecisionMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerDecision, listener);
  }

  async publishPlayerCharacterCreate(message: PlayerCharacterCreateMessage): Promise<boolean> {
    return this.publishChannel(syncChannels.playerCharacterCreate, message);
  }

  subscribePlayerCharacterCreates(listener: (message: PlayerCharacterCreateMessage, event: SyncEvent) => void): () => void {
    return this.subscribeChannel(syncChannels.playerCharacterCreate, listener);
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

  subscribePlayerCharacterResources(listener: (message: PlayerCharacterResourcesMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerCharacterResources, listener);
  }

  async publishPlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerCharacterUpdate, message, targetPeer);
  }

  subscribePlayerCharacterUpdates(listener: (message: PlayerCharacterUpdateMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerCharacterUpdate, listener);
  }

  async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    return this.publishChannel(syncChannels.playerCharacterUpdateAck, message, targetPeer);
  }

  subscribePlayerCharacterUpdateAcks(listener: (message: PlayerCharacterUpdateAckMessage, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    return this.subscribeChannel(syncChannels.playerCharacterUpdateAck, listener);
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
    try {
      const peerId = (this.transport as SyncTransport & { peerId?: string }).peerId;
      const advertised = this.mode === 'authority' && peerId ? withSessionFeatures(snapshot, peerId) : snapshot;
      await this.transport.publish(this.createEvent('snapshot', advertised), targetPeer);
    } catch (error) {
      this.reportNetworkError(error, 'publish', { eventKind: 'snapshot', targetPeer });
      throw error;
    }
    return true;
  }

  private async publishChannel<T>(channel: SyncChannel<T>, value: T, targetPeer?: SyncTargetPeer): Promise<boolean> {
    try {
      await this.transport.publish(this.createEvent(channel.kind, value), targetPeer);
    } catch (error) {
      this.reportNetworkError(error, 'publish', { eventKind: channel.kind, targetPeer });
      throw error;
    }
    return true;
  }

  private reportNetworkError(error: unknown, operation: string, details: Record<string, string | undefined> = {}): void {
    reportOperationalError(error, {
      area: 'network',
      operation,
      tags: {
        transport: this.transport.id,
        syncMode: this.mode
      },
      details: {
        participantId: this.participant?.id,
        ...details
      }
    });
  }

  private subscribeChannel<T>(channel: SyncChannel<T>, listener: (value: T, event: SyncEvent, context?: SyncEventContext) => void): () => void {
    const wasDelivered = createEventDeduper();
    return this.transport.subscribe((event, context) => {
      if (event.kind !== channel.kind) return;
      if (channel.guard && !channel.guard(event.value)) return;
      if (wasDelivered(event.id)) return;
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

function createEventDeduper(): (eventId: string) => boolean {
  const seenEventIds = new Set<string>();
  const seenEventOrder: string[] = [];
  return (eventId: string): boolean => {
    if (seenEventIds.has(eventId)) {
      return true;
    }
    seenEventIds.add(eventId);
    seenEventOrder.push(eventId);
    while (seenEventOrder.length > 1000) {
      const removed = seenEventOrder.shift();
      if (removed) seenEventIds.delete(removed);
    }
    return false;
  };
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

function isPlayerRollAckMessage(value: unknown): value is PlayerRollAckMessage {
  return isRecord(value)
    && value.type === 'playerRollAck'
    && typeof value.intentId === 'string'
    && typeof value.accepted === 'boolean'
    && (value.reason === undefined || typeof value.reason === 'string')
    && (value.operationHash === undefined || (typeof value.operationHash === 'string' && /^[a-f0-9]{64}$/.test(value.operationHash)));
}

function isSessionCapabilitiesMessage(value: unknown): value is SessionCapabilitiesMessage {
  return isRecord(value) && typeof value.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= 128
    && (value.type === 'request' || (value.type === 'response' && typeof value.extraActionDiceV1 === 'boolean'));
}

function isPlayerDecisionMessage(value: unknown): value is PlayerDecisionMessage {
  if (!isRecord(value) || value.type !== 'playerDecision' || !isRecord(value.decision)) return false;
  return (
    hasStringFields(value, ['decisionId', 'participantId', 'actorId', 'createdAt']) &&
    (value.actorName === undefined || typeof value.actorName === 'string') &&
    isPlayerDecision(value.decision)
  );
}

function isPlayerCharacterCreateMessage(value: unknown): value is PlayerCharacterCreateMessage {
  if (!isRecord(value) || value.type !== 'playerCharacterCreate' || !isRecord(value.draft)) return false;
  return (
    hasStringFields(value, ['requestId', 'participantId', 'createdAt']) &&
    (value.participantName === undefined || typeof value.participantName === 'string')
  );
}

function isPlayerDecision(value: unknown): value is PlayerDecision {
  if (!isRecord(value)) return false;
  if (value.kind === 'deathMove') {
    return (
      typeof value.deathMoveEntryId === 'string' &&
      (value.choice === 'blazeOfGlory' || value.choice === 'avoidDeath' || value.choice === 'riskItAll')
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

export function isPlayerCharacterUpdateMessage(value: unknown): value is PlayerCharacterUpdateMessage {
  if (!isRecord(value) || value.type !== 'playerCharacterUpdate') return false;
  return (
    hasStringFields(value, ['participantId', 'actorId', 'updatedAt']) &&
    (value.actorName === undefined || typeof value.actorName === 'string') &&
    (value.patch === undefined
      ? isRecord(value.character) && value.character.id === value.actorId
      : value.character === undefined && isCharacterPatch(value.patch)) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0
  );
}

function isPlayerCharacterUpdateAckMessage(value: unknown): value is PlayerCharacterUpdateAckMessage {
  if (!isRecord(value) || value.type !== 'playerCharacterUpdateAck') return false;
  return (
    hasStringFields(value, ['participantId', 'actorId', 'acknowledgedAt']) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0 &&
    (value.accepted === undefined || typeof value.accepted === 'boolean') &&
    (value.reason === undefined || typeof value.reason === 'string') &&
    (value.operationHash === undefined || (typeof value.operationHash === 'string' && /^[a-f0-9]{64}$/.test(value.operationHash)))
  );
}

function isPlayerCharacterResourcePatch(value: unknown): value is PlayerCharacterResourcePatch {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumberRecord(value.hope, ['value']) &&
    isOptionalNumberRecord(value.hp, ['marked']) &&
    isOptionalNumberRecord(value.stress, ['marked']) &&
    isOptionalNumberRecord(value.armor, ['markedSlots']) &&
    isOptionalWealthResourcePatch(value.wealth) &&
    isOptionalDomainCardResourceList(value.domainCards) &&
    isOptionalCompanionResourcePatch(value.companion) &&
    isOptionalConditionList(value.conditions)
  );
}

function isOptionalConditionList(value: unknown): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((condition) => (
    isRecord(condition) &&
    typeof condition.id === 'string' &&
    typeof condition.name === 'string' &&
    (condition.notes === undefined || typeof condition.notes === 'string')
  ));
}

function isOptionalCompanionResourcePatch(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return value.stress === undefined || isOptionalNumberRecord(value.stress, ['marked']);
}

function isOptionalWealthResourcePatch(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return ['coins', 'handfuls', 'bags', 'chests'].every((field) => (
    value[field] === undefined || (typeof value[field] === 'number' && Number.isFinite(value[field]))
  ));
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
      isValidExtraDice(value.extraDice) &&
      (value.notes === undefined || typeof value.notes === 'string')
    );
  }
  if (value.type === 'manualDice') {
    if (value.extraDice !== undefined) return false;
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
    if (value.extraDice !== undefined) return false;
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
  if (isPortraitUploadMessage(value)) return true;
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
  return value === 'scene-background' || value === 'scene-music' || value === 'portrait';
}

/** Stable operation digest, independent of object insertion order and transport metadata.
 * A synchronous SHA-256 implementation keeps this available on HTTP/local previews
 * where Web Crypto's secure-context-only subtle API may be unavailable.
 */
export function playerCharacterUpdateOperationHash(message: PlayerCharacterUpdateMessage): string {
  const operation = message.patch
    ? { kind: 'patch', set: message.patch.set, unset: [...new Set(message.patch.unset)].sort() }
    : { kind: 'character', character: message.character };
  return characterOperationSha256(canonicalOperationJson(operation));
}

function canonicalOperationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonicalOperationJson(item ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalOperationJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function characterOperationSha256(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index++) {
      const before15 = words[index - 15];
      const before2 = words[index - 2];
      const sigma0 = rotate(before15, 7) ^ rotate(before15, 18) ^ (before15 >>> 3);
      const sigma1 = rotate(before2, 17) ^ rotate(before2, 19) ^ (before2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index++) hash[index] = (hash[index] + result[index]) >>> 0;
  }
  return hash.map(word => word.toString(16).padStart(8, '0')).join('');
}

/** Complete effect-bearing player roll semantics; timestamps and routing IDs do not change an operation. */
export function playerRollIntentOperationHash(message: PlayerRollIntentMessage): string {
  return characterOperationSha256(canonicalOperationJson({
    participantId: message.participantId, actorId: message.actorId, actorName: message.actorName,
    intent: message.intent, publication: message.publication,
    resourcePatch: message.resourcePatch, teamworkEntryId: message.teamworkEntryId
  }));
}
