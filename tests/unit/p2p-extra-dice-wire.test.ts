import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import type { PersistedState } from '../../src/domain/rules/types';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import type { SyncEvent, SyncEventContext, SyncTargetPeer } from '../../src/domain/tabletop/types';
import { charactersStore, sceneTableStore, resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import { CharacterService } from '../../src/services/CharacterService';
import { SceneTableService } from '../../src/services/SceneTableService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { LocalSyncTransport, SyncService, playerRollIntentOperationHash, type PlayerRollIntentMessage, type PlayerRollAckMessage, type SessionCapabilitiesMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

class ExtraSync extends SyncService {
  capabilities: Array<{ message: SessionCapabilitiesMessage; target: SyncTargetPeer }> = [];
  intents: PlayerRollIntentMessage[] = [];
  failCapabilities = false;
  override async publishSessionCapabilities(message: SessionCapabilitiesMessage, target?: SyncTargetPeer): Promise<boolean> {
    this.capabilities.push({ message, target });
    if (this.failCapabilities) throw new Error('capability transport unavailable');
    return true;
  }
  override async publishPlayerRollIntent(message: PlayerRollIntentMessage): Promise<boolean> { this.intents.push(message); return true; }
  override async publishSnapshotRequest(): Promise<boolean> { return true; }
}
interface Result { accepted: boolean; operationHash?: string; reason?: string }
interface Internals {
  diceService: { rollAction(request: any): any; rollReaction(request: any): any };
  playerActorContext: { participantId: string; actorId: string; actorName: string };
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  actorOwnerVerifiedPeers: Map<string, string>;
  activeRoomConnection: any;
  capabilitiesRequest: { requestId: string; attempts: number; answered: boolean } | null;
  playerRollReceipts: Map<string, { operationHash: string; accepted?: boolean }>;
  observeGmSnapshotAuthority(context?: SyncEventContext): void;
  receiveSessionCapabilities(message: SessionCapabilitiesMessage, context?: SyncEventContext): void;
  requestSessionCapabilities(): void;
  handleRoomConnectionEvent(event: any): void;
  processPlayerRollIntent(message: PlayerRollIntentMessage, context?: { logicalPeerId?: string; verifiedPeerId?: string }): Result;
  receivePlayerRollAck(message: PlayerRollAckMessage, context?: SyncEventContext): void;
}
function intent(id = 'extra-intent'): PlayerRollIntentMessage {
  return { type: 'playerRollIntent', intentId: id, participantId: 'owner', actorId: 'extra-hero', actorName: 'Hero', createdAt: 'now',
    publication: 'public', intent: { type: 'duality', rollType: 'action', trait: 'agility', difficulty: 12,
      extraDice: [{ count: 1, sides: 6 }], experienceIds: [], spendHopeForExperiences: false },
    resourcePatch: { hope: { value: 1 } } };
}
function setup(role: 'gm' | 'player' = 'player') {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'extra-hero', hope: { value: 2, max: 6 } });
  charactersStore.update(state => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const owner = createLocalParticipant({ id: 'owner', name: 'Owner', role: 'player', actorIds: [actor.id], peerId: 'player-peer' });
  sceneTableStore.update(state => ({ ...state, participants: { [owner.id]: owner } }));
  const sync = new ExtraSync();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    syncService: sync, characterService: new CharacterService(), sceneTableService: new SceneTableService()
  });
  const internals = session as unknown as Internals;
  const requests: any[] = [];
  internals.diceService = {
    rollAction: request => { requests.push(request); return { id: 'roll', type: 'action', actorName: 'Hero', total: 10, difficulty: 12, success: false, outcome: 'failure', trait: 'agility' }; },
    rollReaction: request => { requests.push(request); return { id: 'roll', type: 'reaction', actorName: 'Hero', total: 10, difficulty: 12, success: false, outcome: 'failure', trait: 'agility' }; }
  };
  internals.playerActorContext = { participantId: 'owner', actorId: actor.id, actorName: 'Owner' };
  internals.activeRoomConnection = { gmPeerId: () => 'gm-peer', peers: () => ['gm-peer', 'player-peer'],
    routeDiagnostics: () => [], peerDiagnostics: () => [], sessionMode: () => 'p2p', directPeerIds: () => ['gm-peer', 'player-peer'] };
  internals.sessionStore.set({ ...internals.sessionStore.get(), role, connected: true, status: 'connected', roomId: 'EXTRAS', peers: ['gm-peer', 'player-peer'], lastSnapshotAt: 'now' });
  const gmContext = { sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'verified-gm' };
  const playerContext = { logicalPeerId: 'player-peer', verifiedPeerId: 'verified-player' };
  internals.actorOwnerVerifiedPeers.set(actor.id, 'verified-player');
  function advertise() {
    internals.observeGmSnapshotAuthority(gmContext);
    internals.receiveSessionCapabilities({ type: 'response', requestId: internals.capabilitiesRequest!.requestId, extraActionDiceV1: true }, gmContext);
  }
  return { actor, sync, session, internals, requests, gmContext, playerContext, advertise, restoreWindow };
}

test('old GM without a positive advertisement cannot receive an extra-dice intent or trigger payment/RNG', async () => {
  const { actor, sync, session, internals, requests, gmContext, restoreWindow } = setup();
  try {
    internals.observeGmSnapshotAuthority(gmContext);
    assert.equal(session.supportsExtraActionDice(), false);
    assert.equal(await session.submitPlayerRollIntent(intent()), false);
    assert.equal(sync.intents.length, 0);
    assert.equal(requests.length, 0);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 2);
    assert.match(session.session$.get().message, /не подтвердил поддержку/);
    const ordinary = intent();
    if (ordinary.intent.type === 'duality') ordinary.intent.extraDice = [];
    assert.equal(await session.submitPlayerRollIntent(ordinary), true);
    assert.equal(sync.intents.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});

test('capability requires a current nonce and the verified current GM snapshot authority, not claimed payload role', async () => {
  const { session, internals, gmContext, restoreWindow } = setup();
  try {
    const unsolicited = { type: 'response', requestId: 'unsolicited', extraActionDiceV1: true, role: 'gm' } as SessionCapabilitiesMessage;
    internals.receiveSessionCapabilities(unsolicited, gmContext);
    assert.equal(session.supportsExtraActionDice(), false);
    internals.observeGmSnapshotAuthority({ sourcePeerId: 'stranger', verifiedSourcePeerId: 'stranger' });
    assert.equal(internals.capabilitiesRequest, null);
    internals.observeGmSnapshotAuthority(gmContext);
    const response: SessionCapabilitiesMessage = { type: 'response', requestId: internals.capabilitiesRequest!.requestId, extraActionDiceV1: true };
    internals.receiveSessionCapabilities(response, { sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'forged-physical-source' });
    assert.equal(session.supportsExtraActionDice(), false);
    internals.receiveSessionCapabilities({ ...response, requestId: 'old-request' }, gmContext);
    assert.equal(session.supportsExtraActionDice(), false);
    let notifications = 0;
    const unsubscribe = session.session$.subscribe(() => { notifications++; });
    internals.receiveSessionCapabilities(response, gmContext);
    unsubscribe();
    assert.equal(session.supportsExtraActionDice(), true);
    assert.equal(session.session$.get().extraActionDiceSupported, true);
    assert.ok(notifications > 0);
  } finally { await session.stop(); restoreWindow(); }
});

test('capability requests are bounded and invalidated after GM loss, rejoin and stop', async () => {
  const { session, sync, internals, gmContext, restoreWindow } = setup();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000);
  try {
    sync.failCapabilities = true;
    internals.observeGmSnapshotAuthority(gmContext);
    const oldRequest = internals.capabilitiesRequest!.requestId;
    for (let index = 0; index < 4; index++) internals.requestSessionCapabilities();
    assert.equal(sync.capabilities.length, 1);
    for (const now of [15_000, 20_000, 25_000, 50_000]) { clock.mockReturnValue(now); internals.requestSessionCapabilities(); }
    assert.equal(sync.capabilities.length, 3);
    await Promise.resolve();
    assert.equal(session.session$.get().status, 'connected');
    internals.handleRoomConnectionEvent({ type: 'gm-lost', peers: ['player-peer'] });
    assert.equal(internals.capabilitiesRequest, null);
    assert.equal(session.supportsExtraActionDice(), false);
    internals.observeGmSnapshotAuthority(gmContext);
    assert.notEqual(internals.capabilitiesRequest!.requestId, oldRequest);
    internals.receiveSessionCapabilities({ type: 'response', requestId: oldRequest, extraActionDiceV1: true }, gmContext);
    assert.equal(session.supportsExtraActionDice(), false);
    await session.stop();
    assert.equal(session.session$.get().extraActionDiceSupported, false);
    assert.equal(internals.capabilitiesRequest, null);
  } finally { clock.mockRestore(); await session.stop(); restoreWindow(); }
});

test('GM only answers bounded capability requests from an observed verified peer', async () => {
  const { sync, session, internals, restoreWindow } = setup('gm');
  try {
    internals.receiveSessionCapabilities({ type: 'request', requestId: 'x'.repeat(129) }, { sourcePeerId: 'player-peer', verifiedSourcePeerId: 'verified-player' });
    internals.receiveSessionCapabilities({ type: 'request', requestId: 'no-source' });
    internals.receiveSessionCapabilities({ type: 'request', requestId: 'unknown' }, { sourcePeerId: 'stranger', verifiedSourcePeerId: 'stranger' });
    assert.equal(sync.capabilities.length, 0);
    internals.receiveSessionCapabilities({ type: 'request', requestId: 'valid-request' }, { sourcePeerId: 'player-peer', verifiedSourcePeerId: 'verified-player' });
    assert.equal(sync.capabilities.length, 1);
    assert.equal(sync.capabilities[0].target, 'player-peer');
    assert.deepEqual(sync.capabilities[0].message, { type: 'response', requestId: 'valid-request', extraActionDiceV1: true });
    for (let index = 0; index < 4; index++) internals.receiveSessionCapabilities({ type: 'request', requestId: `burst-${index}` }, { sourcePeerId: 'player-peer', verifiedSourcePeerId: 'verified-player' });
    assert.equal(sync.capabilities.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});

test('extra dice reach the typed engine while an exact full-semantic retry never repeats resource changes or RNG', async () => {
  const { actor, session, internals, requests, playerContext, restoreWindow } = setup('gm');
  try {
    const message = intent();
    if (message.intent.type === 'duality') message.intent.extraDice = [{ count: 1, sides: 6 }, { count: 2, sides: 4 }];
    const first = internals.processPlayerRollIntent(message, playerContext);
    assert.equal(first.accepted, true);
    assert.deepEqual(requests[0].extraDice, [{ count: 2, sides: 4 }, { count: 1, sides: 6 }]);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 1);
    charactersStore.update(state => ({ ...state, entities: { ...state.entities, [actor.id]: { ...state.entities[actor.id], hope: { value: 4, max: 6 } } } }));
    assert.equal(internals.processPlayerRollIntent({ ...message, createdAt: 'retry-time' }, playerContext).accepted, true);
    assert.equal(requests.length, 1);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 4);
    const conflict = { ...message, publication: 'private' as const };
    assert.equal(internals.processPlayerRollIntent(conflict, playerContext).accepted, false);
    assert.match(internals.processPlayerRollIntent(conflict, playerContext).reason ?? '', /Конфликт/);
    assert.equal(requests.length, 1);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 4);
  } finally { await session.stop(); restoreWindow(); }
});

test('roll fingerprint covers actor, participant, complete intent, visibility, resource patch and teamwork semantics', () => {
  const original = intent();
  const hash = playerRollIntentOperationHash(original);
  const variants = [
    { ...original, actorId: 'different-actor' }, { ...original, participantId: 'different-participant' },
    { ...original, publication: 'private' as const }, { ...original, resourcePatch: { hope: { value: 0 } } },
    { ...original, teamworkEntryId: 'different-teamwork' },
    { ...original, intent: { ...original.intent, extraDice: [{ count: 2, sides: 6 }] } } as PlayerRollIntentMessage
  ];
  for (const variant of variants) assert.notEqual(playerRollIntentOperationHash(variant), hash);
  assert.equal(playerRollIntentOperationHash({ ...original, createdAt: 'another-time', intentId: 'another-routing-id' }), hash);
});

for (const extraDice of [[{ count: 0, sides: 6 }], [{ count: -1, sides: 6 }], [{ count: 1, sides: 7 }], [{ count: 101, sides: 6 }], [{ count: 1, sides: 6, sign: -1 }], [{ count: 60, sides: 6 }, { count: 60, sides: 8 }]]) {
  test(`malformed or oversized extra dice are refused before resourcePatch/RNG: ${JSON.stringify(extraDice)}`, async () => {
    const { actor, session, internals, requests, playerContext, restoreWindow } = setup('gm');
    try {
      const message = intent();
      (message.intent as any).extraDice = extraDice;
      assert.equal(internals.processPlayerRollIntent(message, playerContext).accepted, false);
      assert.equal(charactersStore.get().entities[actor.id].hope.value, 2);
      assert.equal(requests.length, 0);
    } finally { await session.stop(); restoreWindow(); }
  });
}

test('receipt reservation prevents reentrant execution and is bounded to the current session', async () => {
  const { session, internals, playerContext, restoreWindow } = setup('gm');
  try {
    const message = intent();
    let calls = 0;
    internals.diceService.rollAction = () => {
      calls++;
      assert.equal(internals.processPlayerRollIntent(message, playerContext).accepted, false);
      return {};
    };
    assert.equal(internals.processPlayerRollIntent(message, playerContext).accepted, true);
    assert.equal(calls, 1);
    internals.diceService.rollAction = () => ({});
    for (let index = 0; index < 260; index++) internals.processPlayerRollIntent(intent(`bounded-${index}`), playerContext);
    assert.equal(internals.playerRollReceipts.size, 256);
    await session.stop();
    assert.equal(internals.playerRollReceipts.size, 0);
  } finally { await session.stop(); restoreWindow(); }
});

test('optional ACK fingerprint and known GM source prevent clearing the wrong pending roll', async () => {
  const { session, sync, internals, gmContext, advertise, restoreWindow } = setup();
  try {
    advertise();
    assert.equal(await session.submitPlayerRollIntent(intent()), true);
    const sent = sync.intents[0];
    const ack: PlayerRollAckMessage = { type: 'playerRollAck', intentId: sent.intentId, accepted: true, operationHash: playerRollIntentOperationHash(sent) };
    internals.receivePlayerRollAck({ ...ack, operationHash: '0'.repeat(64) }, gmContext);
    assert.equal(session.session$.get().rollPending, true);
    internals.receivePlayerRollAck(ack, { sourcePeerId: 'stranger', verifiedSourcePeerId: 'stranger' });
    assert.equal(session.session$.get().rollPending, true);
    internals.receivePlayerRollAck(ack, { sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'forged-physical-gm' });
    assert.equal(session.session$.get().rollPending, true);
    internals.receivePlayerRollAck(ack, gmContext);
    assert.equal(session.session$.get().rollPending, false);
    internals.receivePlayerRollAck(ack, gmContext);
    assert.equal(session.session$.get().rollPending, false);
  } finally { await session.stop(); restoreWindow(); }
});

test('SyncService drops malformed extra fields through the transport guard rather than silently omitting them', async () => {
  const sync = new SyncService();
  let received = 0;
  const unsubscribe = sync.subscribePlayerRollIntents(() => received++);
  try {
    const invalid = intent();
    (invalid.intent as any).extraDice = [{ count: 1, sides: 7 }];
    await sync.publishPlayerRollIntent(invalid);
    assert.equal(received, 0);
    await sync.publishPlayerRollIntent(intent());
    assert.equal(received, 1);
  } finally { unsubscribe(); await sync.disconnect(); }
});


test('verified snapshot context reaches the optional third callback argument without changing legacy snapshot contents', async () => {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  class ContextTransport extends LocalSyncTransport {
    listener?: (event: SyncEvent, context?: SyncEventContext) => void;
    override subscribe(listener: (event: SyncEvent, context?: SyncEventContext) => void): () => void {
      this.listener = listener;
      return () => { this.listener = undefined; };
    }
  }
  const transport = new ContextTransport();
  const sync = new SyncService();
  sync.setTransport(transport);
  try {
    let observed: SyncEventContext | undefined;
    await sync.connectReadOnly('CAP-CONTEXT', createLocalParticipant({ role: 'player' }), (_state, _event, context) => { observed = context; });
    const context = { sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'verified-gm' };
    transport.listener!({ id: 'canonical-cap-context', authorId: 'gm-peer', createdAt: 'now', kind: 'snapshot', value: snapshotPersistedState() }, context);
    assert.deepEqual(observed, context);
  } finally { await sync.disconnect(); restoreWindow(); }
});


test('ambiguous Hybrid never sends a new capability request or silently converts extra dice into another roll', async () => {
  const { actor, session, sync, internals, requests, restoreWindow } = setup();
  try {
    internals.sessionStore.set({ ...internals.sessionStore.get(), transportMode: 'hybrid' });
    internals.observeGmSnapshotAuthority({ sourcePeerId: 'gm-peer', verifiedSourcePeerId: 'hybrid:gm-peer' });
    const message = intent();
    assert.equal(session.supportsExtraActionDice(), false);
    assert.match(session.extraActionDiceSupportError() ?? '', /гибридной/);
    assert.equal(await session.submitPlayerRollIntent(message), false);
    assert.equal(sync.capabilities.length, 0);
    assert.equal(sync.intents.length, 0);
    assert.equal(requests.length, 0);
    assert.equal(charactersStore.get().entities[actor.id].hope.value, 2);
    assert.equal(message.intent.type, 'duality');
    if (message.intent.type === 'duality') assert.deepEqual(message.intent.extraDice, [{ count: 1, sides: 6 }]);
    // Manual conversion requires a separate explicit intent supplied by caller.
    assert.equal(await session.submitPlayerRollIntent({ actorId: actor.id, intent: { type: 'manualDice', formula: '2d12+1d6' } }), true);
    assert.equal(sync.intents[0].intent.type, 'manualDice');
  } finally { await session.stop(); restoreWindow(); }
});
