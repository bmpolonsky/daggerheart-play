import { Store } from '../core/store/Store';
import { clamp, toSafeInteger } from '../core/utils/clamp';
import { nowIso } from '../core/utils/date';
import { createId } from '../core/utils/id';
import { buildPlayerInviteRoomCode, buildPlayerInviteUrl, createShortRoomCode, normalizeSessionRoomId } from '../domain/p2p/sessionLinks';
import { readP2PNetworkSettings, trysteroOptionsForNetworkSettings } from '../domain/p2p/networkSettings';
import { createCharacter, sanitizeWealth } from '../domain/rules/factories';
import { syncCharacterDefeatedCondition } from '../domain/rules/characterDamage';
import { buildEffectiveCharacterStats } from '../domain/rules/effects';
import { ActorStatus, normalizeStatusTag } from '../domain/rules/statuses';
import type { SyncEventContext, SyncTargetPeer, TableParticipant } from '../domain/tabletop/types';
import type { Character, CharacterCondition, FeedEntry, PersistedState } from '../domain/rules/types';
import { gameStore, charactersStore, resetAllStores, subscribeToSyncedGameStores } from '../stores/gameStores';
import { hydratePersistedState, snapshotPersistedState } from '../stores/persistedState';
import type { PlayerActionRequest, SubmitPlayerActionRequestInput } from './PlayerActionRequestService';
import type { PlayerActionRequestService } from './PlayerActionRequestService';
import type { PlayerActivationInput, PlayerActivationQueueItem, PlayerActivationQueueService } from './PlayerActivationQueueService';
import type { PlayerPresence, PlayerPresenceService } from './PlayerPresenceService';
import type { AudioService } from './AudioService';
import type { AssetService } from './AssetService';
import type { DiceService } from './DiceService';
import type { FeedService } from './FeedService';
import type { CharacterService } from './CharacterService';
import type {
  AssetRequestReason,
  PlayerCharacterResourcePatch,
  PlayerCharacterCreateMessage,
  PlayerCharacterResourcesMessage,
  PlayerCharacterUpdateMessage,
  PlayerDecision,
  PlayerDecisionMessage,
  PlayerRestChoiceMessage,
  PlayerRollIntent,
  PlayerRollIntentMessage,
  PlayerTokenMoveMessage,
  SyncService
} from './SyncService';
import type { SceneTableService } from './SceneTableService';
import type { SceneAudioBroadcastService } from './SceneAudioBroadcastService';
import type { CallPresenceMessage, MediaCallService } from './MediaCallService';
import type { TrysteroP2PTransportOptions } from './TrysteroSyncTransport';
import { toastService } from './ToastService';
import {
  forgetActiveSession,
  initialInviteDraftState,
  persistActiveSession,
  persistInviteDraft,
  persistRoomCodeRefreshBlockedUntil,
  readActiveSession
} from './p2p/P2PSessionPersistence';
import { P2PRoomConnection, type P2PRoomConnectionConfig, type P2PRoomConnectionEvent } from './p2p/P2PRoomConnection';
import type { P2PTransportAdapter, P2PTransportPeerDiagnostic, P2PTransportRouteDiagnostic, P2PTransportRouteSwitchEvent } from './p2p/P2PTransportAdapter';
import { createConfiguredP2PTransport } from './p2p/MultiStrategyP2PTransport';
import { P2PAssetTransferService } from './P2PAssetTransferService';

export type P2PSessionRole = 'gm' | 'player';
export type P2PConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'error';

export interface P2PSessionState {
  connected: boolean;
  status: P2PConnectionStatus;
  role: P2PSessionRole | null;
  roomId: string;
  peerId: string | null;
  peers: string[];
  lastSnapshotAt: string | null;
  lastRequestAt: string | null;
  message: string;
  routes: P2PTransportRouteDiagnostic[];
  routePeers: P2PTransportPeerDiagnostic[];
}

export interface P2PSessionStartInput {
  roomId: string;
  participantName?: string;
  participantId?: string;
  actorIds?: string[];
}

export interface P2PSessionInvite {
  roomId: string;
  inviteUrl: string;
}

export interface P2PStoredSessionSummary {
  role: P2PSessionRole;
  roomId: string;
  participantName: string;
}

export interface P2PInviteDraftState {
  roomId: string;
  inviteUrl: string;
  roomCodeRefreshBlockedUntil: number;
}

export interface P2PInviteContext {
  origin: string;
  basePath?: string;
}

export interface PlayerActorContext {
  participantId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}

interface RemotePeerContext {
  logicalPeerId?: string;
  verifiedPeerId?: string;
}

const AUTO_SNAPSHOT_DELAY_MS = 350;
const PRODUCT_SYNC_RECOVERY_POLL_MS = 5000;
const ROOM_CODE_REFRESH_COOLDOWN_MS = 30_000;

export class P2PSessionService {
  private sessionStore = new Store<P2PSessionState>({
    connected: false,
    status: 'disconnected',
    role: null,
    roomId: '',
    peerId: null,
    peers: [],
    lastSnapshotAt: null,
    lastRequestAt: null,
    message: 'Связь с сервером мастера не подключена.',
    routes: [],
    routePeers: []
  });
  readonly session$ = this.sessionStore.toStream();
  private inviteStore = new Store<P2PInviteDraftState>(initialInviteDraftState());
  readonly invite$ = this.inviteStore.toStream();

  private snapshotTimer: number | undefined;
  private productRecoveryTimer: number | undefined;
  private roomCodeRefreshTimer: number | undefined;
  private activeRoomConnection: P2PRoomConnection | null = null;
  private startInFlight: { role: P2PSessionRole; roomId: string; promise: Promise<void> } | null = null;
  private assetTransferService: P2PAssetTransferService;
  private publishedPlayerFeedEntrySignatures = new Map<string, string>();
  private publishingPlayerFeedEntryIds = new Set<string>();
  private playerCharacterFullSignatures = new Map<string, string>();
  private playerCharacterRevisions = new Map<string, number>();
  private processedPlayerCharacterCreateIds = new Set<string>();
  private subscriptions = new SubscriptionBag();
  private suppressPlayerStoreForwarding = false;
  private playerActorContext: PlayerActorContext = {};
  private localParticipantId: string | null = null;
  private actorOwnerVerifiedPeers = new Map<string, string>();

  constructor(
    private syncService: SyncService,
    private playerActionRequestService: PlayerActionRequestService,
    private playerActivationQueueService: PlayerActivationQueueService,
    private playerPresenceService: PlayerPresenceService,
    private feedService: FeedService,
    private sceneTableService: SceneTableService,
    private diceService: DiceService | undefined,
    assetService: AssetService,
    private audioService?: AudioService,
    private sceneAudioBroadcastService?: SceneAudioBroadcastService,
    private transportFactory: (options: TrysteroP2PTransportOptions) => P2PTransportAdapter = (options) => createConfiguredP2PTransport(options),
    private roomConnectionConfig: P2PRoomConnectionConfig = {},
    private mediaCallService?: MediaCallService,
    private characterService?: CharacterService
  ) {
    this.assetTransferService = new P2PAssetTransferService(
      syncService,
      assetService,
      sceneTableService,
      () => this.sessionStore.get(),
      () => this.activeRoomConnection,
      (patch) => this.patchSession(patch)
    );
    this.scheduleRoomCodeRefreshCooldown(this.inviteStore.get().roomCodeRefreshBlockedUntil);
  }

  setInviteRoomId(roomId: string): void {
    this.inviteStore.update((state) => ({
      ...state,
      roomId: normalizeSessionRoomId(roomId, ''),
      inviteUrl: ''
    }));
    this.persistInviteDraft();
  }

  async refreshGmRoomCode(): Promise<void> {
    const draft = this.inviteStore.get();
    if (draft.roomCodeRefreshBlockedUntil > Date.now()) return;

    const session = this.sessionStore.get();
    const hasActiveGmRoom = session.role === 'gm' && (session.connected || session.status === 'connecting') && Boolean(session.roomId);
    this.setRoomCodeRefreshBlockedUntil(Date.now() + ROOM_CODE_REFRESH_COOLDOWN_MS);
    if (hasActiveGmRoom) {
      await this.stop();
    }
    this.setInviteRoomId(createShortRoomCode());
    toastService.show(hasActiveGmRoom ? 'Старая комната закрыта. Новая ссылка готова.' : 'Код комнаты обновлен. Новая ссылка готова.', 'success');
  }

  previewInviteUrl(context: P2PInviteContext): string {
    const roomId = this.getGmRoomId();
    if (!roomId) return '';
    return buildPlayerInviteUrl({
      ...context,
      roomId,
      networkSettings: this.isActiveGmRoom(roomId) ? undefined : readP2PNetworkSettings()
    });
  }

  getGmRoomId(): string {
    const session = this.sessionStore.get();
    if (session.role === 'gm' && session.roomId) {
      return session.roomId;
    }
    return this.inviteStore.get().roomId;
  }

  hasConnectedPlayers(): boolean {
    const session = this.sessionStore.get();
    return session.role === 'gm' && session.peers.length > 0;
  }

  canPublishSnapshotToPlayers(): boolean {
    const session = this.sessionStore.get();
    return session.role === 'gm' && session.connected && session.peers.length > 0;
  }

  setPlayerActorContext(context: PlayerActorContext): void {
    this.playerActorContext = {
      participantId: context.participantId?.trim() || undefined,
      actorId: context.actorId?.trim() || undefined,
      actorName: context.actorName?.trim() || this.playerActorContext.actorName?.trim() || undefined
    };
  }

  isConnectedPlayerSession(): boolean {
    const session = this.sessionStore.get();
    return session.role === 'player' && session.connected;
  }

  storedSession(): P2PStoredSessionSummary | null {
    const saved = readActiveSession();
    if (!saved) return null;
    return {
      role: saved.role,
      roomId: normalizeSessionRoomId(saved.roomId, ''),
      participantName: saved.participantName
    };
  }

  storedSessionForRoom(roomId: string): P2PStoredSessionSummary | null {
    const saved = this.storedSession();
    return saved?.roomId === roomId ? saved : null;
  }

  async createGmInviteFromDraft(input: P2PInviteContext & { participantName?: string }): Promise<P2PSessionInvite> {
    const draft = this.inviteStore.get();
    try {
      const active = this.sessionStore.get();
      const hasActiveGmRoom = active.role === 'gm' && (active.connected || active.status === 'connecting') && Boolean(active.roomId);
      const roomId = hasActiveGmRoom ? active.roomId : buildPlayerInviteRoomCode(draft.roomId, readP2PNetworkSettings());
      if (!hasActiveGmRoom) {
        await this.startGmRoom({
          roomId,
          participantName: input.participantName
        });
      }
      const invite: P2PSessionInvite = {
        roomId,
        inviteUrl: buildPlayerInviteUrl({
          origin: input.origin,
          basePath: input.basePath,
          roomId,
          networkSettings: hasActiveGmRoom ? undefined : readP2PNetworkSettings()
        })
      };
      this.inviteStore.set({
        roomId: invite.roomId,
        inviteUrl: invite.inviteUrl,
        roomCodeRefreshBlockedUntil: draft.roomCodeRefreshBlockedUntil
      });
      this.persistInviteDraft();
      return invite;
    } catch (error) {
      toastService.show(error instanceof Error ? error.message : 'Не удалось создать приглашение.', 'error');
      throw error;
    }
  }

  async ensureGmRoom(participantName?: string): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role === 'gm' && (session.connected || session.status === 'connecting')) {
      return true;
    }
    if (await this.restoreActiveSession('gm', participantName)) {
      return true;
    }

    const draft = this.inviteStore.get();
    const roomId = normalizeSessionRoomId(draft.roomId, createShortRoomCode());
    this.inviteStore.update((state) => ({
      ...state,
      roomId,
      inviteUrl: ''
    }));
    this.persistInviteDraft();
    await this.startGmRoom({
      roomId,
      participantName
    });
    return true;
  }

  async startGmRoom(input: P2PSessionStartInput): Promise<void> {
    const roomId = buildPlayerInviteRoomCode(input.roomId, readP2PNetworkSettings());
    await this.startRoom('gm', roomId, () => this.openGmRoom({ ...input, roomId }));
  }

  private async openGmRoom(input: P2PSessionStartInput): Promise<void> {
    await this.stop({ forgetSession: false });
    const roomId = normalizeSessionRoomId(input.roomId);
    const transport = this.createTransport();
    const participant = this.createParticipant('gm', input.participantName, {
      id: input.participantId
    });
    this.localParticipantId = participant.id;
    this.sceneTableService.upsertParticipantPresence({
      id: participant.id,
      name: participant.name,
      role: 'gm',
      actorIds: participant.actorIds,
      peerId: transport.peerId,
      connected: true
    });
    this.audioService?.setVoiceTransport(transport);
    this.sceneAudioBroadcastService?.setTransport(transport);
    this.mediaCallService?.setMediaTransport(transport);
    this.mediaCallService?.setRoom({ roomId, participantId: participant.id, displayName: participant.name, role: 'gm' });
    this.sceneTableService.ensurePlayerSeatsForCharacters(Object.values(charactersStore.get().entities));
    this.syncService.setTransport(transport);
    this.bindCallPresenceSync();
    this.subscriptions.add(this.syncService.subscribeSnapshotRequests((_request, _event, context) => {
      this.patchSession({ lastRequestAt: nowIso(), message: 'Игрок запрашивает данные игры.' });
      void this.publishSnapshot({ targetPeer: context?.sourcePeerId });
    }));
    this.patchSession({ status: 'connecting', role: 'gm', roomId, message: 'Открываем комнату.' });
    await this.syncService.connectAuthority(roomId, participant);
    this.subscriptions.add(this.syncService.subscribePlayerRequests((request) => {
      this.playerActionRequestService.receiveRemote(request as PlayerActionRequest);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Получена заявка игрока.' });
    }));
    this.subscriptions.add(this.syncService.subscribeFeedEntries((entry) => {
      if (entry.type !== 'message') {
        this.patchSession({ lastRequestAt: nowIso(), message: 'Событие игрока отклонено.' });
        return;
      }
      this.feedService.receiveRemote(entry);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Получено сообщение игрока.' });
    }));
    this.subscriptions.add(this.syncService.subscribePlayerTokenMoves((move) => {
      const moved = this.sceneTableService.moveTokenInScene(move.sceneId, move.tokenId, move.x, move.y, move.actorId);
      if (!moved) {
        this.patchSession({ lastRequestAt: nowIso(), message: 'Движение токена отклонено.' });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Токен игрока перемещен.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerRestChoices((message, _event, context) => {
      if (!this.applyPlayerRestChoice(message, remotePeerContext(context))) {
        this.patchSession({ lastRequestAt: nowIso(), message: this.playerActorRejectionMessage(message.participantId, message.actorId, 'Выбор отдыха отклонен') });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Выбор отдыха игрока обновлен.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerRollIntents((message, _event, context) => {
      if (!this.applyPlayerRollIntent(message, remotePeerContext(context))) {
        this.patchSession({ lastRequestAt: nowIso(), message: this.playerActorRejectionMessage(message.participantId, message.actorId, 'Бросок игрока отклонен') });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Бросок игрока выполнен.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerDecisions((message, _event, context) => {
      if (!this.applyPlayerDecision(message, remotePeerContext(context))) {
        this.patchSession({ lastRequestAt: nowIso(), message: this.playerActorRejectionMessage(message.participantId, message.actorId, 'Выбор игрока отклонен') });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Выбор игрока ожидает подтверждения мастера.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerCharacterCreates((message) => {
      if (!this.applyPlayerCharacterCreate(message)) {
        this.patchSession({ lastRequestAt: nowIso(), message: 'Создание персонажа отклонено.' });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Персонаж игрока создан.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerActivations((message) => {
      this.playerActivationQueueService.receiveRemote(message);
      this.patchSession({ lastRequestAt: nowIso(), message: message.type === 'raise' ? 'Игрок поднял руку.' : 'Очередь активаций обновлена.' });
    }));
    this.subscriptions.add(this.syncService.subscribePlayerPresence((presence, _event, context) => {
      this.playerPresenceService.upsert(presence);
      this.upsertParticipantFromPlayerPresence(presence, remotePeerContext(context));
    }));
    this.subscriptions.add(this.syncService.subscribePlayerCharacterResources((message, _event, context) => {
      if (!this.applyPlayerCharacterResources(message, remotePeerContext(context))) {
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Ресурсы персонажа игрока обновлены.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.syncService.subscribePlayerCharacterUpdates((message, _event, context) => {
      if (!this.applyPlayerCharacterUpdate(message, remotePeerContext(context))) {
        this.patchSession({ lastRequestAt: nowIso(), message: this.playerActorRejectionMessage(message.participantId, message.actorId, 'Изменения персонажа отклонены') });
        return;
      }
      this.patchSession({ lastRequestAt: nowIso(), message: 'Изменения персонажа игрока применены.' });
      void this.publishSnapshot();
    }));
    this.subscriptions.add(this.assetTransferService.subscribeGm());
    subscribeToSyncedGameStores(() => this.scheduleSnapshot()).forEach((unsubscribe) => this.subscriptions.add(unsubscribe));
    this.sessionStore.update((state) => {
      const peers = this.activeRoomConnection?.peers() ?? [];
      return {
        ...state,
        connected: true,
        status: 'connected',
        role: 'gm',
        roomId,
        peerId: transport.peerId,
        peers,
        routes: transport.routeDiagnostics(),
        routePeers: transport.peerDiagnostics(),
        lastSnapshotAt: state.role === 'gm' && state.roomId === roomId ? state.lastSnapshotAt : null,
        lastRequestAt: state.role === 'gm' && state.roomId === roomId ? state.lastRequestAt : null,
        message: peers.length > 0 ? 'Игрок подключился.' : 'Комната мастера открыта.'
      };
    });
    this.persistActiveSession('gm', roomId, input.participantName);
  }

  async startPlayerRoom(input: P2PSessionStartInput): Promise<void> {
    const roomId = buildPlayerInviteRoomCode(input.roomId, readP2PNetworkSettings());
    await this.startRoom('player', roomId, () => this.openPlayerRoom({ ...input, roomId }));
  }

  private async openPlayerRoom(input: P2PSessionStartInput): Promise<void> {
    await this.stop({ forgetSession: false });
    resetAllStores();
    const participant = this.createParticipant('player', input.participantName, {
      id: input.participantId,
      actorIds: input.actorIds
    });
    this.localParticipantId = participant.id;
    this.setPlayerActorContext({
      participantId: participant.id,
      actorId: input.actorIds?.[0],
      actorName: input.participantName
    });
    const roomId = normalizeSessionRoomId(input.roomId);
    const transport = this.createTransport();
    this.sceneTableService.upsertParticipantPresence({
      id: participant.id,
      name: participant.name,
      role: 'player',
      actorIds: participant.actorIds,
      peerId: transport.peerId,
      connected: true
    });
    this.audioService?.setVoiceTransport(transport);
    this.sceneAudioBroadcastService?.setTransport(transport);
    this.mediaCallService?.setMediaTransport(transport);
    this.mediaCallService?.setRoom({ roomId, participantId: participant.id, displayName: participant.name, role: 'player' });
    this.syncService.setTransport(transport);
    this.bindCallPresenceSync();
    this.patchSession({ status: 'connecting', role: 'player', roomId, message: 'Подключаемся к серверу мастера.' });
    try {
      await this.syncService.connectReadOnly(roomId, participant, (state) => {
        this.suppressPlayerStoreForwarding = true;
        try {
          hydratePersistedState(this.preserveUnacknowledgedPlayerCharacter(state));
          this.capturePlayerForwardingBaseline();
          this.patchSession({ lastSnapshotAt: nowIso(), message: 'Данные игры получены.' });
        } finally {
          this.suppressPlayerStoreForwarding = false;
        }
      });
      this.assetTransferService.subscribePlayer(transport).forEach((unsubscribe) => this.subscriptions.add(unsubscribe));
      this.capturePlayerForwardingBaseline();
      this.subscriptions.add(this.feedService.feed$.subscribe(() => {
        void this.forwardPlayerFeedEntries();
      }));
      this.subscriptions.add(charactersStore.subscribe(() => {
        // A character mutation must travel immediately as one authoritative
        // document. Sending the legacy resource subset first lets the GM publish
        // an older snapshot that can overwrite Hand/Vault, trackers, notes, or
        // level-up changes before the full update is delivered.
        void this.forwardPlayerCharacterUpdate();
      }));
      await this.syncService.publishSnapshotRequest('join', transport.gmPeerId() ?? undefined);
    } catch (error) {
      this.audioService?.setVoiceTransport(null);
      this.sceneAudioBroadcastService?.setTransport(null);
      this.mediaCallService?.setMediaTransport(null);
      this.subscriptions.clear();
      await this.syncService.disconnect().catch(() => undefined);
      this.patchSession({
        connected: false,
        status: 'error',
        role: 'player',
        roomId,
        peerId: null,
        peers: [],
        routes: [],
        routePeers: [],
        message: error instanceof Error ? error.message : 'Не удалось подключиться к серверу мастера.'
      });
      throw error;
    }
    this.subscriptions.add(this.syncService.subscribePlayerRequests((request) => {
      const received = this.playerActionRequestService.receiveRemote(request as PlayerActionRequest);
      if (received && received.status !== 'pending') {
        this.patchSession({ lastRequestAt: nowIso(), message: `Заявка ${received.status === 'approved' ? 'принята' : 'отклонена'} мастером.` });
      }
    }));
    this.subscriptions.add(this.syncService.subscribePlayerActivations((message) => {
      this.playerActivationQueueService.receiveRemote(message);
      if (message.type === 'clear') {
        this.patchSession({ lastRequestAt: nowIso(), message: 'Мастер дал активацию.' });
      }
    }));
    this.subscriptions.add(this.syncService.subscribePlayerVoiceControls((message) => {
      const peerMatches = !message.peerId || message.peerId === transport.peerId;
      if (message.type === 'forceMute' && peerMatches) {
        this.audioService?.muteVoiceChat();
        this.patchSession({ lastRequestAt: nowIso(), message: 'Мастер заглушил микрофон.' });
      }
    }));
    this.sessionStore.update((state) => ({
      ...state,
      connected: true,
      status: 'connected',
      role: 'player',
      roomId,
      peerId: transport.peerId,
      peers: state.role === 'player' && state.roomId === roomId ? state.peers : [],
      routes: transport.routeDiagnostics(),
      routePeers: transport.peerDiagnostics(),
      lastSnapshotAt: state.role === 'player' && state.roomId === roomId ? state.lastSnapshotAt : null,
      lastRequestAt: state.role === 'player' && state.roomId === roomId ? state.lastRequestAt : null,
      message: state.lastSnapshotAt ? 'Вы подключены к серверу мастера.' : 'Ждем данные игры от мастера.'
    }));
    this.startPlayerProductRecoveryPolling();
    this.persistActiveSession('player', roomId, input.participantName);
  }

  private async startRoom(role: P2PSessionRole, roomId: string, start: () => Promise<void>): Promise<void> {
    const inFlight = this.startInFlight;
    if (inFlight?.role === role && inFlight.roomId === roomId) {
      await inFlight.promise;
      return;
    }
    if (this.isActiveRoom(role, roomId)) {
      return;
    }
    if (inFlight) {
      await inFlight.promise.catch(() => undefined);
      if (this.startInFlight !== inFlight) {
        return this.startRoom(role, roomId, start);
      }
      if (this.isActiveRoom(role, roomId)) {
        return;
      }
    }

    const promise = start();
    this.startInFlight = { role, roomId, promise };
    try {
      await promise;
    } finally {
      if (this.startInFlight?.promise === promise) {
        this.startInFlight = null;
      }
    }
  }

  private isActiveRoom(role: P2PSessionRole, roomId: string): boolean {
    const session = this.sessionStore.get();
    return session.role === role && session.roomId === roomId && (session.connected || session.status === 'connecting');
  }

  async stop(options: { forgetSession?: boolean } = {}): Promise<void> {
    window.clearTimeout(this.snapshotTimer);
    this.snapshotTimer = undefined;
    this.stopPlayerProductRecoveryPolling();
    this.activeRoomConnection = null;
    this.assetTransferService.clear(false);
    this.publishedPlayerFeedEntrySignatures.clear();
    this.publishingPlayerFeedEntryIds.clear();
    this.playerCharacterFullSignatures.clear();
    this.playerCharacterRevisions.clear();
    this.processedPlayerCharacterCreateIds.clear();
    this.actorOwnerVerifiedPeers.clear();
    this.suppressPlayerStoreForwarding = false;
    this.playerActorContext = {};
    this.localParticipantId = null;
    this.subscriptions.clear();
    await this.syncService.disconnect();
    this.audioService?.setVoiceTransport(null);
    this.sceneAudioBroadcastService?.setTransport(null);
    this.mediaCallService?.setMediaTransport(null);
    if (options.forgetSession !== false) {
      forgetActiveSession();
    }
    this.sessionStore.set({
      connected: false,
      status: 'disconnected',
      role: null,
      roomId: '',
      peerId: null,
      peers: [],
      lastSnapshotAt: null,
      lastRequestAt: null,
      message: 'Связь с сервером мастера отключена.',
      routes: [],
      routePeers: []
    });
  }

  async restoreActiveSession(role: P2PSessionRole, participantName?: string): Promise<boolean> {
    const saved = readActiveSession();
    if (!saved || saved.role !== role || !saved.roomId) {
      return false;
    }
    const roomId = normalizeSessionRoomId(saved.roomId);
    const session = this.sessionStore.get();
    if (session.connected && session.role === role && session.roomId === roomId) {
      return true;
    }
    const input = {
      roomId,
      participantName: participantName?.trim() || saved.participantName
    };
    if (role === 'gm') {
      await this.startGmRoom(input);
    } else {
      await this.startPlayerRoom(input);
    }
    this.patchSession({ message: 'Связь с сервером мастера восстановлена после перезагрузки.' });
    return true;
  }

  async publishSnapshot(options: { requirePeers?: boolean; targetPeer?: SyncTargetPeer } = {}): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role === 'gm' && session.peers.length === 0) {
      if (options.requirePeers) {
        this.patchSession({ message: 'Некому отправлять обновление: подключенных игроков нет.' });
      }
      return false;
    }
    const ok = await this.syncService.publishSnapshot(snapshotPersistedState(), options.targetPeer);
    if (ok) {
      this.patchSession({ lastSnapshotAt: nowIso(), message: 'Данные игры отправлены игрокам.' });
    }
    return ok;
  }

  async requestAsset(assetId: string, reason: AssetRequestReason = 'scene-background'): Promise<boolean> {
    return await this.assetTransferService.request(assetId, reason);
  }

  async submitPlayerRequest(input: SubmitPlayerActionRequestInput): Promise<PlayerActionRequest> {
    const request = this.playerActionRequestService.submit(input);
    await this.syncService.publishPlayerRequest(request);
    this.patchSession({ lastRequestAt: nowIso(), message: 'Заявка отправлена мастеру.' });
    return request;
  }

  async sendChatMessage(authorName: string, body: string): Promise<void> {
    const session = this.sessionStore.get();
    this.feedService.addMessage(authorName, body);
    if (session.role !== 'player' || !session.connected) {
      return;
    }
    void this.forwardPlayerFeedEntries();
  }

  async publishPlayerTokenMove(move: PlayerTokenMoveMessage): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role !== 'player' || !session.connected) {
      return false;
    }
    try {
      await this.syncService.publishPlayerTokenMove(move);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Движение токена отправлено мастеру.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить движение токена.';
      this.patchSession({ status: 'error', message });
      return false;
    }
  }

  async updateRestParticipantChoices(restEntryId: string, actorId: string, choices: string[]): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role === 'player' && session.connected) {
      const context = this.requirePlayerActorContext(actorId);
      if (!context) {
        this.patchSession({ status: 'degraded', message: 'Выбор отдыха отклонен: персонаж не назначен этому игроку.' });
        return false;
      }
      try {
        await this.syncService.publishPlayerRestChoice({ participantId: context.participantId, restEntryId, actorId, choices });
        this.patchSession({ lastRequestAt: nowIso(), message: 'Выбор отдыха отправлен мастеру.' });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось отправить выбор отдыха.';
        this.patchSession({ status: 'degraded', message });
        return false;
      }
    }
    const updated = this.feedService.updateRestParticipantChoices(restEntryId, actorId, choices);
    if (!updated) {
      return false;
    }
    if (session.role === 'gm') {
      if (session.connected) {
        void this.publishSnapshot();
      }
      return true;
    }
    if (session.role !== 'player' || !session.connected) return true;
    return true;
  }

  async submitPlayerRollIntent(input: { actorId: string; actorName?: string; publication?: PlayerRollIntentMessage['publication']; intent: PlayerRollIntent; resourcePatch?: PlayerCharacterResourcePatch; teamworkEntryId?: string }): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role !== 'player' || !session.connected) {
      return false;
    }
    const context = this.requirePlayerActorContext(input.actorId);
    if (!context) {
      this.patchSession({ status: 'degraded', message: 'Бросок не отправлен: персонаж не назначен этому игроку.' });
      return false;
    }
    try {
      await this.syncService.publishPlayerRollIntent({
        type: 'playerRollIntent',
        intentId: createId('roll-intent'),
        participantId: context.participantId,
        actorId: input.actorId,
        actorName: input.actorName?.trim() || context.actorName || undefined,
        publication: input.publication,
        createdAt: nowIso(),
        intent: input.intent,
        resourcePatch: input.resourcePatch,
        teamworkEntryId: input.teamworkEntryId
      });
      this.patchSession({ lastRequestAt: nowIso(), message: 'Бросок отправлен мастеру.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить бросок мастеру.';
      this.patchSession({ status: 'degraded', message });
      return false;
    }
  }

  async submitPlayerDecision(input: { actorId: string; actorName?: string; decision: PlayerDecision }): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role !== 'player' || !session.connected) {
      return false;
    }
    const context = this.requirePlayerActorContext(input.actorId);
    if (!context) {
      this.patchSession({ status: 'degraded', message: 'Выбор не отправлен: персонаж не назначен этому игроку.' });
      return false;
    }
    try {
      await this.syncService.publishPlayerDecision({
        type: 'playerDecision',
        decisionId: createId('decision'),
        participantId: context.participantId,
        actorId: input.actorId,
        actorName: input.actorName?.trim() || context.actorName || undefined,
        createdAt: nowIso(),
        decision: input.decision
      });
      this.patchSession({ lastRequestAt: nowIso(), message: 'Выбор отправлен мастеру.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить выбор мастеру.';
      this.patchSession({ status: 'degraded', message });
      return false;
    }
  }

  async submitPlayerCharacterCreate(input: { draft: Partial<Character>; participantName?: string }): Promise<boolean> {
    const session = this.sessionStore.get();
    if (session.role !== 'player' || !session.connected) {
      return false;
    }
    const participantId = this.playerActorContext.participantId?.trim();
    if (!participantId) {
      this.patchSession({ status: 'degraded', message: 'Персонаж не отправлен: место игрока не определено.' });
      return false;
    }
    try {
      await this.syncService.publishPlayerCharacterCreate({
        type: 'playerCharacterCreate',
        requestId: createId('character-create'),
        participantId,
        participantName: input.participantName?.trim() || this.playerActorContext.actorName?.trim() || undefined,
        draft: input.draft,
        createdAt: nowIso()
      });
      this.patchSession({ lastRequestAt: nowIso(), message: 'Персонаж отправлен мастеру.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить персонажа мастеру.';
      this.patchSession({ status: 'degraded', message });
      return false;
    }
  }

  async raiseHand(input: PlayerActivationInput): Promise<boolean> {
    const session = this.session$.get();
    if (session.role !== 'player' || !session.connected) {
      this.patchSession({ message: 'Подключитесь к комнате, чтобы поднять руку.' });
      return false;
    }
    try {
      const message = this.playerActivationQueueService.raise(input);
      await this.syncService.publishPlayerActivation(message);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Рука поднята.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось поднять руку.';
      this.patchSession({ status: 'error', message });
      return false;
    }
  }

  async lowerHand(input: Pick<PlayerActivationInput, 'requesterId' | 'actorId'>): Promise<boolean> {
    const session = this.session$.get();
    if (session.role !== 'player' || !session.connected) {
      this.playerActivationQueueService.lower(input);
      return false;
    }
    try {
      const message = this.playerActivationQueueService.lower(input);
      await this.syncService.publishPlayerActivation(message);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Рука опущена.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось опустить руку.';
      this.patchSession({ status: 'error', message });
      return false;
    }
  }

  async clearRaisedHand(item: Pick<PlayerActivationQueueItem, 'requesterId' | 'actorId'>): Promise<boolean> {
    const session = this.session$.get();
    if (session.role !== 'gm' || !session.connected) {
      return false;
    }
    try {
      const message = this.playerActivationQueueService.clear(item);
      await this.syncService.publishPlayerActivation(message);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Активация передана игроку.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить очередь активаций.';
      this.patchSession({ status: 'error', message });
      return false;
    }
  }

  async publishPresence(input: Omit<PlayerPresence, 'peerId' | 'updatedAt'>): Promise<boolean> {
    const session = this.session$.get();
    if (session.role !== 'player' || !session.connected || !session.peerId) {
      return false;
    }
    try {
      const presence: PlayerPresence = {
        ...input,
        peerId: session.peerId,
        connected: true,
        updatedAt: nowIso()
      };
      this.playerPresenceService.upsert(presence);
      this.upsertParticipantFromPlayerPresence(presence);
      await this.syncService.publishPlayerPresence(presence);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить статус игрока.';
      this.patchSession({ status: 'degraded', message });
      return false;
    }
  }

  async forceMutePlayer(input: { actorId: string; peerId?: string }): Promise<boolean> {
    const session = this.session$.get();
    if (session.role !== 'gm' || !session.connected) {
      return false;
    }
    try {
      await this.syncService.publishPlayerVoiceControl(this.playerPresenceService.createForceMute(input), input.peerId || undefined);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Команда заглушить микрофон отправлена.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось заглушить микрофон игрока.';
      this.patchSession({ status: 'error', message });
      return false;
    }
  }

  private capturePlayerForwardingBaseline(): void {
    for (const entry of this.feedService.feed$.get()) {
      this.publishedPlayerFeedEntrySignatures.set(entry.id, playerFeedEntrySignature(entry));
    }
    for (const character of Object.values(charactersStore.get().entities)) {
      this.playerCharacterFullSignatures.set(character.id, playerCharacterFullSignature(character));
      if (character.playerSyncRevision?.revision) {
        this.playerCharacterRevisions.set(character.id, character.playerSyncRevision.revision);
      }
    }
  }

  private preserveUnacknowledgedPlayerCharacter(state: PersistedState): PersistedState {
    const actorId = this.playerActorContext.actorId;
    if (!actorId) return state;
    const latestPublishedRevision = this.playerCharacterRevisions.get(actorId);
    if (!latestPublishedRevision) return state;
    const incoming = state.characters.entities[actorId];
    const local = charactersStore.get().entities[actorId];
    if (!incoming || !local) return state;
    const incomingRevision = incoming.playerSyncRevision;
    if (incomingRevision && incomingRevision.participantId === this.playerActorContext.participantId && incomingRevision.revision >= latestPublishedRevision) return state;
    return {
      ...state,
      characters: {
        ...state.characters,
        entities: { ...state.characters.entities, [actorId]: local }
      }
    };
  }

  private async forwardPlayerCharacterUpdate(): Promise<void> {
    if (this.suppressPlayerStoreForwarding) return;
    const session = this.session$.get();
    if (session.role !== 'player' || !session.connected) return;
    const context = this.requirePlayerActorContext();
    if (!context) return;
    const character = charactersStore.get().entities[context.actorId];
    if (!character) return;
    const signature = playerCharacterFullSignature(character);
    const previousSignature = this.playerCharacterFullSignatures.get(character.id);
    if (previousSignature === signature) return;
    const previousRevision = this.playerCharacterRevisions.get(character.id) ?? character.playerSyncRevision?.revision ?? 0;
    const revision = previousRevision + 1;
    // Reserve this version before awaiting transport so rapid store emissions do
    // not enqueue duplicate full snapshots. A later local mutation gets a new
    // signature and is still published immediately.
    this.playerCharacterFullSignatures.set(character.id, signature);
    this.playerCharacterRevisions.set(character.id, revision);
    try {
      await this.syncService.publishPlayerCharacterUpdate({
        type: 'playerCharacterUpdate',
        participantId: context.participantId,
        actorId: character.id,
        actorName: context.actorName ?? (character.playerName || character.name),
        character,
        revision,
        updatedAt: nowIso()
      });
      this.patchSession({ lastRequestAt: nowIso(), message: 'Изменения персонажа отправлены мастеру.' });
    } catch (error) {
      if (this.playerCharacterFullSignatures.get(character.id) === signature) {
        if (previousSignature === undefined) this.playerCharacterFullSignatures.delete(character.id);
        else this.playerCharacterFullSignatures.set(character.id, previousSignature);
      }
      if (this.playerCharacterRevisions.get(character.id) === revision) {
        if (previousRevision > 0) this.playerCharacterRevisions.set(character.id, previousRevision);
        else this.playerCharacterRevisions.delete(character.id);
      }
      this.patchSession({ status: 'degraded', message: error instanceof Error ? error.message : 'Не удалось отправить изменения персонажа мастеру.' });
    }
  }

  private async forwardPlayerFeedEntries(): Promise<void> {
    if (this.suppressPlayerStoreForwarding) {
      return;
    }
    const session = this.session$.get();
    if (session.role !== 'player' || !session.connected) {
      return;
    }
    const entries = [...this.feedService.feed$.get()].reverse();
    for (const entry of entries) {
      if (entry.type !== 'message') {
        this.publishedPlayerFeedEntrySignatures.set(entry.id, playerFeedEntrySignature(entry));
        continue;
      }
      if (this.publishedPlayerFeedEntrySignatures.get(entry.id) === playerFeedEntrySignature(entry) || this.publishingPlayerFeedEntryIds.has(entry.id)) {
        continue;
      }
      await this.publishPlayerFeedEntry(entry);
    }
  }

  private async publishPlayerFeedEntry(entry: FeedEntry): Promise<void> {
    this.publishingPlayerFeedEntryIds.add(entry.id);
    try {
      const context = this.playerActorContext.participantId ? this.playerActorContext : null;
      await this.syncService.publishFeedEntry(context?.participantId ? { ...entry, participantId: context.participantId } : entry);
      this.publishedPlayerFeedEntrySignatures.set(entry.id, playerFeedEntrySignature(entry));
      this.patchSession({ lastRequestAt: nowIso(), message: 'Сообщение отправлено мастеру.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить событие мастеру.';
      this.patchSession({ status: 'degraded', message });
    } finally {
      this.publishingPlayerFeedEntryIds.delete(entry.id);
    }
  }

  private applyPlayerCharacterResources(message: PlayerCharacterResourcesMessage, peerContext?: RemotePeerContext): boolean {
    if (!this.authorizePlayerActor(message.participantId, message.actorId, peerContext)) {
      this.patchSession({ lastRequestAt: nowIso(), message: 'Ресурсы персонажа отклонены.' });
      return false;
    }
    const character = charactersStore.get().entities[message.actorId];
    if (!character) return false;
    const resources = message.resources;
    const nextDomainCards = resources.domainCards
      ? character.domainCards.map((card) => {
          const remote = resources.domainCards?.find((item) => item.id === card.id);
          if (!remote?.tokens) return card;
          return {
            ...card,
            tokens: {
              ...card.tokens,
              value: clamp(toSafeInteger(remote.tokens.value, card.tokens.value), 0, card.tokens.max)
            }
          };
        })
      : character.domainCards;
    const effective = buildEffectiveCharacterStats(character);
    const updated: Character = syncCharacterDefeatedCondition({
      ...character,
      hope: resources.hope
        ? { ...character.hope, value: clamp(toSafeInteger(resources.hope.value, character.hope.value), 0, effective.hope.max) }
        : character.hope,
      hp: resources.hp
        ? { ...character.hp, marked: clamp(toSafeInteger(resources.hp.marked, character.hp.marked), 0, character.hp.max) }
        : character.hp,
      stress: resources.stress
        ? { ...character.stress, marked: clamp(toSafeInteger(resources.stress.marked, character.stress.marked), 0, character.stress.max) }
        : character.stress,
      armor: resources.armor
        ? { ...character.armor, markedSlots: clamp(toSafeInteger(resources.armor.markedSlots, character.armor.markedSlots), 0, character.armor.score) }
        : character.armor,
      wealth: resources.wealth
        ? sanitizeWealth({ ...character.wealth, ...resources.wealth })
        : character.wealth,
      activeBeastform: character.activeBeastform ?? null,
      companion: resources.companion?.stress && character.companion
        ? {
          ...character.companion,
          stress: {
            ...character.companion.stress,
            marked: clamp(toSafeInteger(resources.companion.stress.marked, character.companion.stress.marked), 0, character.companion.stress.max)
          }
        }
        : character.companion ?? null,
      domainCards: nextDomainCards,
      conditions: resources.conditions ? normalizePlayerConditionList(resources.conditions) : character.conditions,
      updatedAt: message.updatedAt
    });
    const applied = playerCharacterResourceSignature(character) !== playerCharacterResourceSignature(updated);
    if (!applied) return false;
    const deathMoveActor = !hasConditionTag(character.conditions, ActorStatus.Defeated) && hasConditionTag(updated.conditions, ActorStatus.Defeated)
      ? { id: updated.id, name: updated.name }
      : null;
    const actor = this.playerChangeActor(message.participantId, message.actorName);
    if (this.characterService) {
      this.characterService.applyTrustedPlayerUpdate(character.id, updated, actor);
    } else {
      charactersStore.update((state) => ({
        ...state,
        entities: { ...state.entities, [updated.id]: updated },
        updatedAt: nowIso()
      }));
    }
    if (deathMoveActor) {
      this.feedService.requestDeathMove({
        actor: {
          actorId: deathMoveActor.id,
          actorName: deathMoveActor.name,
          actorType: 'character'
        },
        publication: 'public'
      });
    }
    return applied;
  }

  private applyPlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, peerContext?: RemotePeerContext): boolean {
    if (!this.authorizePlayerActor(message.participantId, message.actorId, peerContext)) return false;
    if (!this.characterService) return false;
    return this.characterService.applyTrustedPlayerUpdate(
      message.actorId,
      message.character,
      this.playerChangeActor(message.participantId, message.actorName),
      { participantId: message.participantId, revision: message.revision }
    );
  }

  private playerChangeActor(participantId: string, actorName?: string) {
    return {
      id: participantId,
      name: actorName?.trim() || this.sceneTableService.sceneTable$.get().participants[participantId]?.name || 'Игрок',
      role: 'player' as const
    };
  }

  private applyPlayerCharacterCreate(message: PlayerCharacterCreateMessage): boolean {
    if (this.processedPlayerCharacterCreateIds.has(message.requestId)) {
      return true;
    }
    const participantId = message.participantId.trim();
    if (!participantId) {
      return false;
    }
    const sceneTable = this.sceneTableService.sceneTable$.get();
    const currentParticipant = sceneTable.participants[participantId];
    if (currentParticipant?.role === 'player' && currentParticipant.actorIds.some((actorId) => charactersStore.get().entities[actorId])) {
      this.processedPlayerCharacterCreateIds.add(message.requestId);
      return true;
    }

    const character = createCharacter({
      ...message.draft,
      id: undefined,
      playerName: message.participantName?.trim() || currentParticipant?.name || message.draft.playerName || ''
    });
    charactersStore.update((state) => ({
      ...state,
      entities: { ...state.entities, [character.id]: character },
      order: [...state.order, character.id],
      selectedId: character.id,
      updatedAt: nowIso()
    }));

    if (currentParticipant?.role === 'player') {
      this.sceneTableService.updatePlayerSeat(participantId, {
        name: currentParticipant.name || message.participantName || character.name,
        characterId: character.id
      });
    } else {
      this.sceneTableService.createPlayerSeat({
        id: participantId,
        name: message.participantName || character.playerName || character.name,
        characterId: character.id
      });
    }

    this.processedPlayerCharacterCreateIds.add(message.requestId);
    return true;
  }

  private applyPlayerRestChoice(message: PlayerRestChoiceMessage, peerContext?: RemotePeerContext): boolean {
    if (!this.authorizePlayerActor(message.participantId, message.actorId, peerContext)) {
      return false;
    }
    return Boolean(this.feedService.updateRestParticipantChoices(message.restEntryId, message.actorId, message.choices));
  }

  private applyPlayerDecision(message: PlayerDecisionMessage, peerContext?: RemotePeerContext): boolean {
    if (!this.authorizePlayerActor(message.participantId, message.actorId, peerContext)) {
      return false;
    }
    if (message.decision.kind === 'deathMove') {
      return Boolean(this.feedService.updateDeathMove(message.decision.deathMoveEntryId, {
        choice: message.decision.choice
      }, { actorId: message.actorId }));
    }
    if (message.decision.kind === 'teamworkRoll') {
      return Boolean(this.feedService.requestTeamworkParticipantRoll(
        message.decision.teamworkEntryId,
        message.actorId,
        message.decision.trait
      ));
    }
    return false;
  }

  private applyPlayerRollIntent(message: PlayerRollIntentMessage, peerContext?: RemotePeerContext): boolean {
    if (!this.diceService || !this.authorizePlayerActor(message.participantId, message.actorId, peerContext)) {
      return false;
    }
    if (message.resourcePatch) {
      this.applyPlayerCharacterResourcePatch(message.actorId, message.resourcePatch, message.createdAt);
    }
    try {
      switch (message.intent.type) {
        case 'duality': {
          const request = {
            actorId: message.actorId,
            actorName: message.actorName,
            trait: message.intent.trait,
            difficulty: message.intent.difficulty,
            manualModifier: message.intent.manualModifier,
            advantageCount: message.intent.advantageCount,
            disadvantageCount: message.intent.disadvantageCount,
            experienceIds: message.intent.experienceIds,
            spendHopeForExperiences: message.intent.spendHopeForExperiences,
            publication: message.publication,
            notes: message.intent.notes,
            applyConsequences: gameStore.get().autoApplyRollConsequences
          };
          const roll = message.intent.rollType === 'reaction'
            ? this.diceService.rollReaction(request)
            : this.diceService.rollAction(request);
          if (message.teamworkEntryId) {
            this.feedService.recordTeamworkParticipantResult(message.teamworkEntryId, message.actorId, {
              rollId: roll.id,
              rollType: roll.type,
              trait: roll.trait,
              total: roll.total,
              difficulty: roll.difficulty,
              success: roll.success,
              outcome: roll.outcome,
              note: `${roll.actorName}: ${roll.total} ${roll.success ? 'успех' : 'провал'}`
            });
          }
          return true;
        }
        case 'manualDice':
          this.diceService.rollManualDice({
            actorId: message.actorId,
            actorName: message.actorName,
            formula: message.intent.formula,
            label: message.intent.label,
            advantageCount: message.intent.advantageCount,
            disadvantageCount: message.intent.disadvantageCount,
            diceTones: message.intent.diceTones,
            publication: message.publication,
            notes: message.intent.notes
          });
          return true;
        case 'damage':
          this.diceService.rollDamage({
            actorId: message.actorId,
            actorName: message.actorName,
            formula: message.intent.formula,
            critical: message.intent.critical,
            damageType: message.intent.damageType,
            publication: message.publication,
            notes: message.intent.notes
          });
          return true;
      }
    } catch {
      return false;
    }
  }

  async approveRequest(id: string, reviewerId: string): Promise<PlayerActionRequest | null> {
    const request = this.playerActionRequestService.approve(id, reviewerId);
    if (request) {
      await this.syncService.publishPlayerRequest(request);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Заявка принята и отправлена игроку.' });
    }
    return request;
  }

  async rejectRequest(id: string, reviewerId: string, reason?: string): Promise<PlayerActionRequest | null> {
    const request = this.playerActionRequestService.reject(id, reviewerId, reason);
    if (request) {
      await this.syncService.publishPlayerRequest(request);
      this.patchSession({ lastRequestAt: nowIso(), message: 'Заявка отклонена и отправлена игроку.' });
    }
    return request;
  }

  private scheduleSnapshot(): void {
    const session = this.session$.get();
    if (session.role !== 'gm' || session.peers.length === 0) {
      return;
    }
    window.clearTimeout(this.snapshotTimer);
    this.snapshotTimer = window.setTimeout(() => {
      void this.publishSnapshot();
    }, AUTO_SNAPSHOT_DELAY_MS);
  }

  private startPlayerProductRecoveryPolling(): void {
    this.stopPlayerProductRecoveryPolling();
    this.productRecoveryTimer = window.setInterval(() => {
      const session = this.session$.get();
      if (session.role !== 'player' || !session.connected) {
        this.stopPlayerProductRecoveryPolling();
        return;
      }
      if (!session.lastSnapshotAt || session.status === 'degraded' || session.peers.length === 0) {
        void this.requestSnapshotFromGm(session.lastSnapshotAt ? 'peer-reconnect' : 'manual');
      }
    }, this.roomConnectionConfig.heartbeatMs ?? PRODUCT_SYNC_RECOVERY_POLL_MS);
  }

  private stopPlayerProductRecoveryPolling(): void {
    window.clearInterval(this.productRecoveryTimer);
    this.productRecoveryTimer = undefined;
  }

  private createTransport(): P2PRoomConnection {
    const connection = new P2PRoomConnection(this.transportFactory(trysteroOptionsForNetworkSettings(readP2PNetworkSettings())), this.roomConnectionConfig);
    this.activeRoomConnection = connection;
    this.subscriptions.add(connection.subscribeRoomEvents((event) => this.handleRoomConnectionEvent(event)));
    return connection;
  }

  private persistActiveSession(role: P2PSessionRole, roomId: string, participantName?: string): void {
    persistActiveSession({
      role,
      roomId: buildPlayerInviteRoomCode(roomId, readP2PNetworkSettings()),
      participantName
    });
  }

  private isActiveGmRoom(roomId: string): boolean {
    const session = this.sessionStore.get();
    return session.role === 'gm' && session.roomId === roomId && (session.connected || session.status === 'connecting');
  }

  private handleRoomConnectionEvent(event: P2PRoomConnectionEvent): void {
    const routes = this.activeRoomConnection?.routeDiagnostics() ?? [];
    const routePeers = this.activeRoomConnection?.peerDiagnostics() ?? [];
    if (event.type === 'ready') {
      this.patchSession({ peerId: event.peerId, peers: event.peers, status: 'connected', routes, routePeers });
      return;
    }
    if (event.type === 'peer-joined') {
      const session = this.session$.get();
      const isGmRestored = session.role === 'player' && event.role === 'gm';
      void this.mediaCallService?.publishPresence();
      this.patchSession({
        peers: event.peers,
        routes,
        routePeers,
        status: session.role === 'gm' || isGmRestored ? 'connected' : session.status,
        message: session.role === 'gm' ? 'Игрок подключился.' : isGmRestored ? 'Соединение с мастером восстановлено.' : session.message
      });
      return;
    }
    if (event.type === 'peer-left') {
      this.audioService?.removeRemoteVoicePeer(event.peerId);
      this.sceneAudioBroadcastService?.removeRemotePeer(event.peerId);
      this.mediaCallService?.removeRemotePeer(event.peerId);
      this.playerPresenceService.markDisconnectedByPeer(event.peerId);
      this.sceneTableService.markParticipantDisconnectedByPeer(event.peerId);
      const playerLostGm = event.role === 'gm' && !this.activeRoomConnection?.gmPeerId();
      this.patchSession((state) => ({
        ...state,
        peers: event.peers,
        routes,
        routePeers,
        status: state.role === 'player' && state.connected && (playerLostGm || event.peers.length === 0) ? 'degraded' : state.status,
        message:
          state.role === 'gm'
            ? 'Игрок отключился.'
            : playerLostGm || event.peers.length === 0
              ? 'Соединение с мастером прервалось.'
              : state.message
      }));
      return;
    }
    if (event.type === 'gm-lost') {
      this.patchSession({
        peers: event.peers,
        routes,
        routePeers,
        status: 'degraded',
        message: 'Мастер не отвечает. Пытаемся переподключиться.'
      });
      void this.requestSnapshotFromGm('peer-reconnect');
      return;
    }
    if (event.type === 'gm-restored') {
      this.patchSession({
        peers: event.peers,
        routes,
        routePeers,
        status: 'connected',
        message: 'Соединение с мастером восстановлено.'
      });
      void this.requestSnapshotFromGm('peer-reconnect');
      void this.republishPendingRequests();
      void this.republishRaisedHand();
      void this.mediaCallService?.publishPresence();
      return;
    }
    if (event.type === 'diagnostics-updated') {
      this.patchSession({ peers: event.peers, routes, routePeers });
      return;
    }
    if (event.type === 'route-switched') {
      this.patchSession({ peers: event.peers, routes, routePeers });
      void this.handleAckRouteSwitch(event.switch);
      return;
    }
    if (event.type === 'error') {
      this.patchSession({ status: 'error', message: event.message, routes, routePeers });
    }
  }

  private async handleAckRouteSwitch(routeSwitch: P2PTransportRouteSwitchEvent): Promise<void> {
    const session = this.sessionStore.get();
    if (!session.connected || !session.role) {
      return;
    }
    await this.mediaCallService?.publishPresence();
    if (session.role === 'gm') {
      await this.publishSnapshot({ targetPeer: routeSwitch.peerId });
      return;
    }
    await this.republishPlayerPresence();
    await this.requestSnapshotFromGm('peer-reconnect');
    await this.republishPendingRequests();
    await this.republishRaisedHand();
    await this.assetTransferService.retryPendingRequestsForPeer(routeSwitch.peerId);
  }

  private createParticipant(role: TableParticipant['role'], participantName?: string, options: { id?: string; actorIds?: string[] } = {}): TableParticipant {
    return {
      id: options.id?.trim() || (role === 'gm' ? 'local-gm' : `${role}-${Date.now()}`),
      name: participantName?.trim() || (role === 'gm' ? 'Мастер' : 'Игрок'),
      role,
      actorIds: options.actorIds ?? [],
      connected: true,
      updatedAt: nowIso()
    };
  }

  private bindCallPresenceSync(): void {
    if (!this.mediaCallService) return;
    this.subscriptions.add(this.syncService.subscribeCallPresence((presence, _event, context) => {
      this.mediaCallService?.receiveRemotePresence(presence, context?.sourcePeerId);
      this.upsertParticipantFromCallPresence(presence, context?.sourcePeerId);
    }));
  }

  renameLocalParticipant(name: string): void {
    const session = this.session$.get();
    const participantId = this.localParticipantId ?? (session.role === 'player' ? this.playerActorContext.participantId : 'local-gm');
    const displayName = name.trim();
    if (!participantId || !displayName || !session.role) return;
    const current = this.sceneTableService.sceneTable$.get().participants[participantId];
    this.sceneTableService.upsertParticipantPresence({
      id: participantId,
      name: displayName,
      role: session.role === 'gm' ? 'gm' : 'player',
      actorIds: current?.actorIds ?? (this.playerActorContext.actorId ? [this.playerActorContext.actorId] : []),
      peerId: session.peerId ?? current?.peerId,
      connected: session.connected
    });
  }

  private upsertParticipantFromCallPresence(presence: CallPresenceMessage, peerId?: string): void {
    const participant = this.findExistingParticipantForPresence({
      participantId: presence.participantId,
      peerId
    });
    if (!participant) {
      return;
    }
    this.sceneTableService.upsertParticipantPresence({
      id: participant.id,
      name: presence.displayName,
      role: participant.role,
      actorIds: participant.actorIds,
      peerId,
      connected: presence.connected
    });
  }

  private upsertParticipantFromPlayerPresence(presence: PlayerPresence, peerContext?: RemotePeerContext): void {
    const participant = this.findExistingParticipantForPresence({
      participantId: presence.requesterId,
      actorId: presence.actorId,
      peerId: presence.peerId
    });
    if (!participant) {
      return;
    }
    this.sceneTableService.upsertParticipantPresence({
      id: participant.id,
      name: presence.playerName || presence.actorName,
      role: participant.role,
      actorIds: participant.actorIds.length > 0 ? participant.actorIds : presence.actorId ? [presence.actorId] : [],
      peerId: presence.peerId,
      connected: presence.connected
    });
    if (peerContext?.verifiedPeerId && (!participant.peerId || participant.peerId === peerContext.logicalPeerId || participant.peerId === presence.peerId) && presence.peerId === peerContext.logicalPeerId) {
      this.actorOwnerVerifiedPeers.set(presence.actorId, peerContext.verifiedPeerId);
    }
  }

  private findExistingParticipantForPresence(input: { participantId?: string; actorId?: string; peerId?: string }): TableParticipant | null {
    const participants = Object.values(this.sceneTableService.sceneTable$.get().participants);
    const participantId = input.participantId?.trim();
    const actorId = input.actorId?.trim();
    const peerId = input.peerId?.trim();
    return (
      participants.find((participant) => participantId && participant.id === participantId)
      ?? participants.find((participant) => actorId && participant.role === 'player' && participant.actorIds.includes(actorId))
      ?? participants.find((participant) => peerId && participant.peerId === peerId)
      ?? null
    );
  }

  private async republishPendingRequests(): Promise<void> {
    const pending = this.playerActionRequestService.requests$.get().filter((request) => request.status === 'pending');
    for (const request of pending) {
      await this.syncService.publishPlayerRequest(request);
    }
    if (pending.length > 0) {
      this.patchSession({ lastRequestAt: nowIso(), message: 'Ожидающие заявки отправлены мастеру.' });
    }
  }

  private async republishRaisedHand(): Promise<void> {
    const local = this.playerActivationQueueService.local$.get();
    if (!local.raised || !local.actorId) {
      return;
    }
    const current = this.playerActivationQueueService.queue$.get().find((item) => item.actorId === local.actorId);
    if (!current) {
      return;
    }
    await this.syncService.publishPlayerActivation({ type: 'raise', request: current });
    this.patchSession({ lastRequestAt: nowIso(), message: 'Поднятая рука отправлена мастеру.' });
  }

  private async republishPlayerPresence(): Promise<void> {
    const participantId = this.playerActorContext.participantId?.trim();
    const actorId = this.playerActorContext.actorId?.trim();
    if (!participantId || !actorId) {
      return;
    }
    const participant = this.sceneTableService.sceneTable$.get().participants[participantId];
    await this.publishPresence({
      requesterId: participantId,
      actorId,
      actorName: this.playerActorContext.actorName?.trim() || participant?.name || 'Игрок',
      playerName: participant?.name || this.playerActorContext.actorName?.trim() || 'Игрок',
      connected: true,
      voiceMuted: false,
      voiceLive: false
    });
  }

  private async requestSnapshotFromGm(reason: 'join' | 'peer-reconnect' | 'manual'): Promise<void> {
    try {
      await this.syncService.publishSnapshotRequest(reason, this.activeRoomConnection?.gmPeerId() ?? undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось запросить данные у мастера.';
      this.patchSession({ status: 'degraded', message });
    }
  }

  private patchSession(patch: Partial<P2PSessionState> | ((state: P2PSessionState) => P2PSessionState)): void {
    if (typeof patch === 'function') {
      this.sessionStore.update(patch);
      return;
    }
    this.sessionStore.update((state) => ({ ...state, ...patch }));
  }

  private persistInviteDraft(): void {
    persistInviteDraft(this.inviteStore.get());
  }

  private setRoomCodeRefreshBlockedUntil(value: number): void {
    persistRoomCodeRefreshBlockedUntil(value);
    this.inviteStore.update((state) => ({ ...state, roomCodeRefreshBlockedUntil: value > Date.now() ? value : 0 }));
    this.scheduleRoomCodeRefreshCooldown(value);
  }

  private scheduleRoomCodeRefreshCooldown(value: number): void {
    if (typeof window === 'undefined') return;
    window.clearTimeout(this.roomCodeRefreshTimer);
    this.roomCodeRefreshTimer = undefined;
    if (value <= Date.now()) return;
    this.roomCodeRefreshTimer = window.setTimeout(() => this.setRoomCodeRefreshBlockedUntil(0), value - Date.now());
  }

  private requirePlayerActorContext(actorId?: string): { participantId: string; actorId: string; actorName?: string } | null {
    const participantId = this.playerActorContext.participantId?.trim();
    const contextActorId = this.playerActorContext.actorId?.trim();
    if (!participantId || !contextActorId) {
      return null;
    }
    if (actorId && contextActorId !== actorId) {
      return null;
    }
    return {
      participantId,
      actorId: contextActorId,
      actorName: this.playerActorContext.actorName?.trim() || undefined
    };
  }

  private participantOwnsActor(participantId: string, actorId: string): boolean {
    const participant = this.sceneTableService.sceneTable$.get().participants[participantId];
    return participant?.role === 'player' && participant.actorIds.includes(actorId);
  }

  private authorizePlayerActor(participantId: string, actorId: string, peerContext?: RemotePeerContext): boolean {
    const logicalPeerId = peerContext?.logicalPeerId;
    const verifiedPeerId = peerContext?.verifiedPeerId;
    const requester = this.sceneTableService.sceneTable$.get().participants[participantId];
    if (this.participantOwnsActor(participantId, actorId)) {
      const peerParticipant = logicalPeerId ? this.participantForPeer(logicalPeerId) : null;
      if (peerParticipant && peerParticipant.id !== participantId) {
        return false;
      }
      const verifiedPeerId = this.actorOwnerVerifiedPeers.get(actorId);
      if (peerContext?.verifiedPeerId && verifiedPeerId && verifiedPeerId !== peerContext.verifiedPeerId) {
        return false;
      }
      if (peerContext?.verifiedPeerId && !verifiedPeerId && (!requester?.peerId || requester.peerId !== logicalPeerId)) {
        return false;
      }
      this.bindActorOwnerPeer(actorId, peerContext);
      return true;
    }
    if (requester?.role === 'player') {
      return false;
    }
    const owner = this.ownerParticipantForActor(actorId);
    if (!owner) {
      return false;
    }
    const peerParticipant = logicalPeerId ? this.participantForPeer(logicalPeerId) : null;
    if (peerParticipant && peerParticipant.id !== owner.id) {
      return false;
    }
    if (peerContext?.verifiedPeerId) {
      const verifiedPeerId = this.actorOwnerVerifiedPeers.get(actorId);
      if (verifiedPeerId && verifiedPeerId !== peerContext.verifiedPeerId) {
        return false;
      }
      if (!verifiedPeerId && (!owner.peerId || owner.peerId !== logicalPeerId)) {
        return false;
      }
    }
    this.bindActorOwnerPeer(actorId, peerContext);
    return true;
  }

  private bindActorOwnerPeer(actorId: string, peerContext?: RemotePeerContext): void {
    if (!peerContext?.verifiedPeerId) {
      return;
    }
    this.actorOwnerVerifiedPeers.set(actorId, peerContext.verifiedPeerId);
    const owner = this.ownerParticipantForActor(actorId);
    if (!owner) {
      return;
    }
  }

  private playerActorRejectionMessage(participantId: string, actorId: string, prefix: string): string {
    const participants = this.sceneTableService.sceneTable$.get().participants;
    const requester = participants[participantId];
    const owner = this.ownerParticipantForActor(actorId);
    if (!requester && owner) {
      return `${prefix}: участник не найден, персонаж назначен "${owner.name}".`;
    }
    if (requester && owner && requester.id !== owner.id) {
      return `${prefix}: "${requester.name}" не владеет персонажем "${owner.name}".`;
    }
    if (requester) {
      return `${prefix}: персонаж не назначен "${requester.name}".`;
    }
    return `${prefix}: персонаж не назначен этому игроку.`;
  }

  private applyPlayerCharacterResourcePatch(actorId: string, resources: PlayerCharacterResourcePatch, updatedAt: string): boolean {
    return this.applyPlayerCharacterResources({
      type: 'playerCharacterResources',
      participantId: this.ownerParticipantIdForActor(actorId) ?? '',
      actorId,
      resources,
      updatedAt
    });
  }

  private ownerParticipantIdForActor(actorId: string): string | null {
    return this.ownerParticipantForActor(actorId)?.id ?? null;
  }

  private ownerParticipantForActor(actorId: string): TableParticipant | null {
    return Object.values(this.sceneTableService.sceneTable$.get().participants)
      .find((item) => item.role === 'player' && item.actorIds.includes(actorId)) ?? null;
  }

  private participantForPeer(peerId: string): TableParticipant | null {
    return Object.values(this.sceneTableService.sceneTable$.get().participants)
      .find((item) => item.role === 'player' && item.peerId === peerId) ?? null;
  }
}

class SubscriptionBag {
  private subscriptions: Array<() => void> = [];

  add(unsubscribe: () => void): void {
    this.subscriptions.push(unsubscribe);
  }

  clear(): void {
    const subscriptions = this.subscriptions;
    this.subscriptions = [];
    subscriptions.forEach((unsubscribe) => unsubscribe());
  }
}

function playerCharacterResourceSignature(character: Character): string {
  return JSON.stringify({
    hope: character.hope.value,
    hp: character.hp.marked,
    stress: character.stress.marked,
    armor: character.armor.markedSlots,
    wealth: character.wealth,
    activeBeastform: character.activeBeastform ?? null,
    companion: character.companion ? { stress: character.companion.stress.marked, unavailableUntilLongRest: character.companion.unavailableUntilLongRest } : null,
    conditions: character.conditions.map((condition) => [condition.id, condition.name, condition.notes ?? '']),
    domainCards: character.domainCards.map((card) => [card.id, card.tokens.value])
  });
}

function playerCharacterFullSignature(character: Character): string {
  const { changeHistory: _history, updatedAt: _updatedAt, ...canonical } = character;
  return JSON.stringify(canonical);
}

function playerFeedEntrySignature(entry: FeedEntry): string {
  return JSON.stringify(entry);
}

function remotePeerContext(context?: SyncEventContext): RemotePeerContext | undefined {
  if (!context?.sourcePeerId && !context?.verifiedSourcePeerId) {
    return undefined;
  }
  return {
    logicalPeerId: context.sourcePeerId,
    verifiedPeerId: context.verifiedSourcePeerId ?? context.sourcePeerId
  };
}

function normalizePlayerConditionList(conditions: CharacterCondition[]): CharacterCondition[] {
  const seen = new Set<string>();
  return conditions.flatMap((condition) => {
    const name = normalizeStatusTag(condition.name);
    if (!name) return [];
    const key = name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: condition.id.trim() || createId('condition'),
      name,
      notes: condition.notes?.trim() || undefined
    }];
  });
}

function hasConditionTag(conditions: CharacterCondition[], tag: ActorStatus): boolean {
  return conditions.some((condition) => normalizeStatusTag(condition.name) === tag);
}
