import assert from "node:assert/strict";
import { charactersStore } from "../../src/stores/gameStores";
import { characterService, diceService } from "../../src/services/serviceRegistry";
import { SyncService } from "../../src/services/SyncService";
import { P2PSessionService } from "../../src/services/P2PSessionService";
import { MediaCallService } from "../../src/services/MediaCallService";
import { P2PRoomConnection } from "../../src/services/p2p/P2PRoomConnection";
import { MultiStrategyP2PTransport } from "../../src/services/p2p/MultiStrategyP2PTransport";
import type { P2PBinaryPayload, P2PTargetPeer, P2PTransportAdapter, P2PTransportMode, P2PTransportStrategy, P2PWireEnvelope } from "../../src/services/p2p/P2PTransportAdapter";
import { PlayerActionRequestService } from "../../src/services/PlayerActionRequestService";
import { PlayerActivationQueueService } from "../../src/services/PlayerActivationQueueService";
import { PlayerPresenceService } from "../../src/services/PlayerPresenceService";
import { FeedService } from "../../src/services/FeedService";
import { SceneTableService } from "../../src/services/SceneTableService";
import { AssetService } from "../../src/services/AssetService";
import type { GameDocumentStore } from "../../src/core/persistence/gameDocumentStore";
import { createGameDocument, gameDocumentCustomContent, gameDocumentToPersistedState, type GameDocument } from "../../src/domain/game/gameDocument";
import type { PersistedState } from "../../src/domain/rules/types";
import { mapRawClassItem, mapRawEquipmentItem } from "../../src/domain/content/mappers";
import type { GenericLibraryItem, LibraryClassItem, LibraryEquipmentItem, RawClassItem, RawEquipmentItem } from "../../src/domain/content/types";
import type { SyncEvent } from "../../src/domain/tabletop/types";

export async function waitFor(assertion: () => void, timeoutMs = 8000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Timed out waiting for assertion.');
}

interface ScriptedP2PTransportOptions {
  appId?: string;
  strategy?: P2PTransportMode;
}

export class ScriptedP2PNetwork {
  connects = 0;
  transportStrategies: Array<P2PTransportMode | undefined> = [];
  deliveredSnapshots = 0;
  droppedSnapshots = 0;
  droppedSnapshotRequests = 0;
  snapshotRequests = 0;
  controlMessages: Record<string, number> = {};
  dataMessages: Record<string, number> = {};
  binaryMessages: Record<string, number> = {};
  mediaMessages: Record<string, number> = {};
  private nextPeerNumber = 1;
  private readonly rooms = new Map<string, Set<ScriptedP2PTransport>>();
  private disabledStrategies = new Set<P2PTransportStrategy>();
  private rejectingStrategies = new Set<P2PTransportStrategy>();

  constructor(private drops: { dropSnapshots: number; dropSnapshotRequests: number; suppressPeerJoinNotifications?: boolean; disabledStrategies?: P2PTransportStrategy[] }) {
    this.disabledStrategies = new Set(drops.disabledStrategies ?? []);
  }

  setStrategyEnabled(strategy: P2PTransportStrategy, enabled: boolean): void {
    if (enabled) {
      this.disabledStrategies.delete(strategy);
      return;
    }
    this.disabledStrategies.add(strategy);
  }

  setStrategySendRejecting(strategy: P2PTransportStrategy, rejecting: boolean): void {
    if (rejecting) {
      this.rejectingStrategies.add(strategy);
      return;
    }
    this.rejectingStrategies.delete(strategy);
  }

  emitStrategyError(strategy: P2PTransportStrategy, message = `${strategy} transport error`): void {
    for (const peers of this.rooms.values()) {
      for (const transport of peers) {
        if (transport.strategy === strategy) {
          transport.emitError(message);
        }
      }
    }
  }

  createTransport(options: ScriptedP2PTransportOptions): P2PTransportAdapter {
    this.transportStrategies.push(options.strategy);
    if (!options.strategy || options.strategy === 'auto') {
      return new MultiStrategyP2PTransport({
        mode: 'auto',
        ackTimeoutMs: 40,
        createTransport: (childOptions) => this.createTransport(childOptions)
      });
    }
    return new ScriptedP2PTransport(this, options);
  }

  connect(roomId: string, transport: ScriptedP2PTransport): void {
    if (this.disabledStrategies.has(transport.strategy)) {
      throw new Error(`${transport.strategy} disabled`);
    }
    this.connects += 1;
    transport.roomId = roomId;
    transport.peerId = `peer-${this.nextPeerNumber++}`;
    const roomKey = this.roomKey(transport.strategy, roomId);
    const peers = this.rooms.get(roomKey) ?? new Set<ScriptedP2PTransport>();
    this.rooms.set(roomKey, peers);
    const existingPeers = Array.from(peers);
    peers.add(transport);
    existingPeers.forEach((peer) => {
      peer.publishedMediaStreams.forEach((metadata, stream) => {
        transport.emitMediaStream(stream, peer.peerId, metadata);
      });
      transport.publishedMediaStreams.forEach((metadata, stream) => {
        peer.emitMediaStream(stream, transport.peerId, metadata);
      });
    });
    if (this.drops.suppressPeerJoinNotifications) {
      return;
    }
    existingPeers.forEach((peer) => {
      peer.notifyPeerJoin(transport.peerId);
      transport.notifyPeerJoin(peer.peerId);
    });
  }

  disconnect(transport: ScriptedP2PTransport): void {
    this.disconnectPeer(transport.peerId);
  }

  disconnectPeer(peerId: string, options: { notify?: boolean } = {}): boolean {
    const notify = options.notify !== false;
    let disconnected = false;
    for (const peers of this.rooms.values()) {
      const transports = Array.from(peers).filter((peer) => peer.peerId === peerId || peer.logicalPeerId === peerId);
      for (const transport of transports) {
        peers.delete(transport);
        disconnected = true;
        if (notify) {
          peers.forEach((peer) => peer.notifyPeerLeave(transport.peerId));
        }
        transport.roomId = '';
      }
    }
    return disconnected;
  }

  publish(sender: ScriptedP2PTransport, envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): void {
    if (this.rejectingStrategies.has(sender.strategy)) {
      throw new Error(`${sender.strategy} send rejected`);
    }
    if (this.disabledStrategies.has(sender.strategy)) {
      return;
    }
    const recipients = Array.from(this.rooms.get(this.roomKey(sender.strategy, sender.roomId)) ?? [])
      .filter((peer) => peer !== sender && (!targetPeer || peer.peerId === targetPeer));
    if (recipients.length === 0) {
      return;
    }
    const event = envelope.channel === 'data' && isTestSyncEvent(envelope.payload) ? envelope.payload : null;
    if (event) {
      this.dataMessages[event.kind] = (this.dataMessages[event.kind] ?? 0) + recipients.length;
    }
    if (envelope.channel === 'control' && isTestControlPayload(envelope.payload)) {
      this.controlMessages[envelope.payload.type] = (this.controlMessages[envelope.payload.type] ?? 0) + recipients.length;
    }
    if (event?.kind === 'snapshotRequest') {
      this.snapshotRequests += recipients.length;
    }
    if (event?.kind === 'snapshot' && this.drops.dropSnapshots > 0) {
      this.drops.dropSnapshots -= 1;
      this.droppedSnapshots += 1;
      return;
    }
    if (event?.kind === 'snapshotRequest' && this.drops.dropSnapshotRequests > 0) {
      this.drops.dropSnapshotRequests -= 1;
      this.droppedSnapshotRequests += 1;
      return;
    }
    if (event?.kind === 'snapshot') {
      this.deliveredSnapshots += recipients.length;
    }
    recipients.forEach((peer) => peer.emit(envelope, sender.peerId));
  }

  async publishBinary(sender: ScriptedP2PTransport, data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown): Promise<void> {
    if (this.disabledStrategies.has(sender.strategy)) {
      throw new Error(`${sender.strategy} disabled`);
    }
    const recipients = Array.from(this.rooms.get(this.roomKey(sender.strategy, sender.roomId)) ?? [])
      .filter((peer) => peer !== sender && (!targetPeer || peer.peerId === targetPeer));
    if (recipients.length === 0) {
      throw new Error('No binary recipient available');
    }
    const kind = metadata && typeof metadata === 'object' && typeof (metadata as { type?: unknown }).type === 'string'
      ? (metadata as { type: string }).type
      : 'unknown';
    this.binaryMessages[kind] = (this.binaryMessages[kind] ?? 0) + recipients.length;
    const buffer = await binaryPayloadToArrayBuffer(data);
    recipients.forEach((peer) => peer.emitBinary(buffer.slice(0), sender.peerId, metadata));
  }

  publishMediaStream(sender: ScriptedP2PTransport, stream: MediaStream, metadata?: unknown): void {
    if (this.disabledStrategies.has(sender.strategy)) {
      return;
    }
    const recipients = Array.from(this.rooms.get(this.roomKey(sender.strategy, sender.roomId)) ?? []).filter((peer) => peer !== sender);
    const kind = metadata && typeof metadata === 'object' && typeof (metadata as { kind?: unknown }).kind === 'string'
      ? (metadata as { kind: string }).kind
      : 'unknown';
    this.mediaMessages[kind] = (this.mediaMessages[kind] ?? 0) + recipients.length;
    recipients.forEach((peer) => peer.emitMediaStream(stream, sender.peerId, metadata));
  }

  private roomKey(strategy: P2PTransportStrategy, roomId: string): string {
    return `${strategy}:${roomId}`;
  }
}

class ScriptedP2PTransport implements P2PTransportAdapter {
  readonly id = 'scripted-p2p';
  readonly label = 'Scripted P2P';
  peerId = '';
  roomId = '';
  logicalPeerId = '';
  readonly strategy: P2PTransportStrategy;
  private readonly listeners = new Set<(envelope: P2PWireEnvelope, context?: { sourcePeerId?: string }) => void>();
  private readonly peerJoinListeners = new Set<(peerId: string) => void>();
  private readonly peerLeaveListeners = new Set<(peerId: string) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();
  private readonly binaryListeners = new Set<(data: ArrayBuffer, peerId: string, metadata?: unknown) => void>();
  private readonly mediaStreamListeners = new Set<(stream: MediaStream, peerId: string, metadata?: unknown) => void>();
  readonly publishedMediaStreams = new Map<MediaStream, unknown>();

  constructor(private readonly network: ScriptedP2PNetwork, options: ScriptedP2PTransportOptions) {
    this.strategy = options.strategy && options.strategy !== 'auto' ? options.strategy : 'nostr';
  }

  async connect(roomId: string): Promise<void> {
    this.network.connect(roomId, this);
  }

  async disconnect(): Promise<void> {
    this.network.disconnect(this);
    this.listeners.clear();
    this.binaryListeners.clear();
    this.mediaStreamListeners.clear();
    this.publishedMediaStreams.clear();
  }

  async send(envelope: P2PWireEnvelope, targetPeer?: P2PTargetPeer): Promise<void> {
    this.logicalPeerId = envelope.sender.peerId;
    this.network.publish(this, envelope, targetPeer);
  }

  async sendBinary(data: P2PBinaryPayload, targetPeer?: P2PTargetPeer, metadata?: unknown): Promise<void> {
    await this.network.publishBinary(this, data, targetPeer, metadata);
  }

  subscribe(listener: (envelope: P2PWireEnvelope, context?: { sourcePeerId?: string }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeBinary(listener: (data: ArrayBuffer, peerId: string, metadata?: unknown) => void): () => void {
    this.binaryListeners.add(listener);
    return () => this.binaryListeners.delete(listener);
  }

  onPeerJoin(listener: (peerId: string) => void): () => void {
    this.peerJoinListeners.add(listener);
    return () => this.peerJoinListeners.delete(listener);
  }

  onPeerLeave(listener: (peerId: string) => void): () => void {
    this.peerLeaveListeners.add(listener);
    return () => this.peerLeaveListeners.delete(listener);
  }

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async publishMediaStream(stream: MediaStream, metadata?: unknown): Promise<void> {
    this.publishedMediaStreams.set(stream, metadata);
    this.network.publishMediaStream(this, stream, metadata);
  }

  removeMediaStream(stream: MediaStream): void {
    this.publishedMediaStreams.delete(stream);
  }

  subscribeMediaStreams(listener: (stream: MediaStream, peerId: string, metadata?: unknown) => void): () => void {
    this.mediaStreamListeners.add(listener);
    return () => this.mediaStreamListeners.delete(listener);
  }

  emit(envelope: P2PWireEnvelope, sourcePeerId: string): void {
    this.listeners.forEach((listener) => listener(envelope, { sourcePeerId }));
  }

  emitBinary(data: ArrayBuffer, peerId: string, metadata?: unknown): void {
    this.binaryListeners.forEach((listener) => listener(data, peerId, metadata));
  }

  emitMediaStream(stream: MediaStream, peerId: string, metadata?: unknown): void {
    this.mediaStreamListeners.forEach((listener) => listener(stream, peerId, metadata));
  }

  notifyPeerJoin(peerId: string): void {
    this.peerJoinListeners.forEach((listener) => listener(peerId));
  }

  notifyPeerLeave(peerId: string): void {
    this.peerLeaveListeners.forEach((listener) => listener(peerId));
  }

  emitError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message));
  }
}

function isTestSyncEvent(value: unknown): value is SyncEvent {
  return Boolean(value && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string');
}

function isTestControlPayload(value: unknown): value is { type: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string');
}

async function binaryPayloadToArrayBuffer(data: P2PBinaryPayload): Promise<ArrayBuffer> {
  if (data instanceof Blob) {
    return data.arrayBuffer();
  }
  if (data instanceof ArrayBuffer) {
    return data.slice(0);
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function createTestP2PSession(network: ScriptedP2PNetwork, options: { dice?: boolean; assetService?: AssetService; sceneTableService?: SceneTableService; syncService?: SyncService; mediaCallService?: MediaCallService } = {}): P2PSessionService {
  return new P2PSessionService(
    options.syncService ?? new SyncService(),
    new PlayerActionRequestService(),
    new PlayerActivationQueueService(),
    new PlayerPresenceService(),
    new FeedService(),
    options.sceneTableService ?? new SceneTableService(),
    options.dice ? diceService : undefined,
    options.assetService ?? new AssetService(null),
    undefined,
    undefined,
    (options) => network.createTransport(options),
    { heartbeatMs: 100, gmTimeoutMs: 400 },
    options.mediaCallService
  );
}

export function createTestPlayerSync(network: ScriptedP2PNetwork): SyncService {
  const sync = new SyncService();
  sync.setTransport(new P2PRoomConnection(network.createTransport({}), { heartbeatMs: 100, gmTimeoutMs: 400 }));
  return sync;
}

export function installTimerWindow(): () => void {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined
      },
      clearTimeout,
      setTimeout,
      clearInterval,
      setInterval,
      location: { pathname: '/' }
    },
    configurable: true
  });
  return () => Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
}

export function createFakeSceneAudioElement(playResults: Array<Error | DOMException | undefined>) {
  const attributes = new Map<string, string>();
  let src = '';
  let playCount = 0;
  let paused = true;
  const element = {
    autoplay: false,
    preload: '',
    loop: false,
    volume: 1,
    currentTime: 0,
    get paused() {
      return paused;
    },
    get src() {
      return src;
    },
    set src(value: string) {
      src = value;
      attributes.set('src', value);
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => {
      attributes.delete(name);
      if (name === 'src') src = '';
    },
    load: () => undefined,
    pause: () => {
      paused = true;
    },
    play: async () => {
      playCount += 1;
      const result = playResults.shift();
      if (result) throw result;
      paused = false;
    }
  } as unknown as HTMLAudioElement;

  return {
    element,
    playCalls: () => playCount
  };
}

export function firstCharacter() {
  const state = charactersStore.get();
  const character = state.entities[state.order[0]] ?? characterService.createCharacter({ name: 'Ари, демо-герой', playerName: 'Игрок' });
  assert.ok(character);
  return character;
}

export class MemoryGameDocumentStore implements GameDocumentStore {
  state: GameDocument | null = null;
  private activeId: string | null = null;
  private gameIndex = 0;
  private games = new Map<string, GameDocument>();
  private order: string[] = [];
  private sharedCharacters: PersistedState['characters'] | null = null;
  private sharedParticipants: PersistedState['sceneTable']['participants'] | null = null;
  private listeners = new Set<(document: GameDocument | null) => void>();

  async load(): Promise<GameDocument | null> {
    return this.state;
  }

  async save(document: GameDocument): Promise<void> {
    this.activeId ??= `memory-game-${++this.gameIndex}`;
    this.updateShared(document);
    this.games.set(this.activeId, document);
    this.state = this.compose(document);
    if (!this.order.includes(this.activeId)) {
      this.order = [this.activeId, ...this.order];
    }
    this.emit();
  }

  async delete(): Promise<void> {
    if (this.activeId) {
      this.games.delete(this.activeId);
    }
    this.order = this.order.filter((id) => this.games.has(id));
    this.activeId = this.order[0] ?? null;
    this.state = this.activeId ? this.compose(this.games.get(this.activeId) ?? null) : null;
    this.emit();
  }

  async list() {
    return this.order.map((id) => {
      const document = this.games.get(id);
      assert.ok(document);
      return {
      id,
      name: document.manifest.name,
      updatedAt: document.manifest.updatedAt,
      active: id === this.activeId
      };
    });
  }

  async create(document: GameDocument): Promise<string> {
    const id = `memory-game-${++this.gameIndex}`;
    this.activeId = id;
    this.updateShared(document);
    this.games.set(id, document);
    this.state = this.compose(document);
    this.order = [id, ...this.order];
    this.emit();
    return id;
  }

  async remove(id: string): Promise<GameDocument | null> {
    this.games.delete(id);
    this.order = this.order.filter((gameId) => gameId !== id);
    if (this.activeId === id) {
      this.activeId = this.order[0] ?? null;
      this.state = this.activeId ? this.compose(this.games.get(this.activeId) ?? null) : null;
    }
    this.emit();
    return this.state;
  }

  async setActive(id: string): Promise<GameDocument | null> {
    const document = this.games.get(id) ?? null;
    if (!document) {
      return null;
    }
    this.activeId = id;
    this.state = this.compose(document);
    this.emit();
    return this.state;
  }

  subscribe(listener: (document: GameDocument | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private updateShared(document: GameDocument): void {
    const state = gameDocumentToPersistedState(document);
    this.sharedCharacters = state.characters;
    this.sharedParticipants = state.sceneTable.participants;
  }

  private compose(document: GameDocument | null): GameDocument | null {
    if (!document || !this.sharedCharacters || !this.sharedParticipants) {
      return document;
    }
    const state = gameDocumentToPersistedState(document);
    return createGameDocument({
      ...state,
      characters: this.sharedCharacters,
      sceneTable: {
        ...state.sceneTable,
        participants: this.sharedParticipants
      }
    }, gameDocumentCustomContent(document));
  }
}

export function equipmentFixture(): LibraryEquipmentItem[] {
  return [
    equipmentItem({ slug: 'leather-armor', name: 'Кожаный Доспех', type_slug: 'armor', armor_score: 3, base_thresholds: [6, 13] }),
    equipmentItem({ slug: 'full-plate-armor', name: 'Латный Доспех', type_slug: 'armor', armor_score: 4, base_thresholds: [8, 17], features: [{ id: 1, name: 'Очень тяжёлое', main_body: '−2 к [Уклонению](/rule/evasion); −1 к [Проворности](/rule/agility)' }] }),
    equipmentItem({ slug: 'broadsword', name: 'Палаш', type_slug: 'primary-weapon', char_trait: 'agility', range: 'melee', damage_ty: 'physical', die_num: 1, die_size: 8, bonus: 0, burden: 1, features: [{ id: 2, name: 'Надёжное', main_body: '+1 к броскам атаки' }] }),
    equipmentItem({ slug: 'longbow', name: 'Длинный лук', type_slug: 'primary-weapon', char_trait: 'agility', range: 'veryfar', damage_ty: 'physical', die_num: 1, die_size: 8, bonus: 3, burden: 2, features: [{ id: 3, name: 'Громоздкое', main_body: '−1 к [Искусности](/rule/finesse)' }] }),
    equipmentItem({ slug: 'tower-shield', name: 'Башенный Щит', type_slug: 'secondary-weapon', char_trait: 'strength', range: 'melee', damage_ty: 'physical', die_num: 1, die_size: 6, bonus: 0, burden: 1, features: [{ id: 4, name: 'Барьер', main_body: '+2 к Показателю Брони; −1 к [Уклонению](/rule/evasion)' }] }),
    equipmentItem({ slug: 'round-shield', name: 'Круглый Щит', type_slug: 'secondary-weapon', char_trait: 'strength', range: 'melee', damage_ty: 'physical', die_num: 1, die_size: 4, bonus: 0, burden: 1, features: [{ id: 5, name: 'Защитное', main_body: '+1 к Показателю Брони' }] }),
    equipmentItem({ slug: 'minor-health-potion', name: 'Малое Зелье Лечения', type_slug: 'consumable', uses: 1, main_body: 'Излечите 1d4+1 Ран.' }),
    equipmentItem({ slug: 'minor-stamina-potion', name: 'Малое Зелье Выносливости', type_slug: 'consumable', uses: 1, main_body: 'Очистите 1d4+1 Стресса.' })
  ];
}

export function equipmentItem(input: Partial<RawEquipmentItem>): LibraryEquipmentItem {
  return mapRawEquipmentItem({
    id: input.id ?? input.slug ?? 'equipment',
    source_slugs: input.source_slugs ?? ['core', 'srd'],
    tier: input.type_slug === 'consumable' ? null : 1,
    type_name: input.type_name ?? '',
    language: 'ru',
    ...input
  });
}

export function classFixture(): LibraryClassItem[] {
  return [
    classItem({
      slug: 'warrior',
      name: 'Воин',
      source_slugs: ['core', 'srd'],
      domain_slugs: ['blade', 'bone'],
      evasion: 13,
      hp: 8,
      class_items: ['Рисунок из API', 'Монета из API'],
      features: [{ id: 9, name: 'Class Feature', main_body: 'Spend Hope to do a class thing.' }],
      background_questions: ['Кто обучил вас сражаться?', 'Какой долг вы несёте?', 'Что вы никогда не сделаете?'],
      connection_questions: ['Почему ты доверяешь мне?']
    })
  ];
}

export function classItem(input: Partial<RawClassItem>): LibraryClassItem {
  return mapRawClassItem({
    id: input.id ?? input.slug ?? 'class',
    language: 'ru',
    ...input
  });
}

export function genericItem(input: Partial<GenericLibraryItem>): GenericLibraryItem {
  return {
    id: input.id ?? 'item',
    sourceId: input.sourceId,
    slug: input.slug ?? input.id ?? 'item',
    name: input.name ?? 'Item',
    subtitle: input.subtitle ?? '',
    body: input.body ?? '',
    imageUrl: input.imageUrl ?? null,
    level: input.level,
    raw: input.raw ?? {}
  };
}
