import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { Character, PersistedState } from '../../src/domain/rules/types';
import { createCharacter } from '../../src/domain/rules/factories';
import type { SyncEventContext, SyncTargetPeer } from '../../src/domain/tabletop/types';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage, type SnapshotRequestMessage } from '../../src/services/SyncService';
import { charactersStore, resetAllStores } from '../../src/stores/gameStores';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

class CanonicalSync extends SyncService {
  requests: Array<{ at: number; reason: SnapshotRequestMessage['reason']; target: SyncTargetPeer }> = [];
  failRequests = false;
  requestPromise?: Promise<boolean>;
  override async publishSnapshotRequest(reason: SnapshotRequestMessage['reason'] = 'join', target?: SyncTargetPeer): Promise<boolean> {
    this.requests.push({ at: Date.now(), reason, target });
    if (this.failRequests) throw new Error('dropped request');
    return this.requestPromise ?? true;
  }
  override async publishSnapshot(_state?: PersistedState, _target?: SyncTargetPeer): Promise<boolean> { return true; }
}

type Expected = { actorId: string; participantId: string; revision: number; attempts: number };
type Internals = {
  pendingPlayerCharacterUpdates: Map<string, { message: PlayerCharacterUpdateMessage }>;
  receivePlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage, context?: SyncEventContext): void;
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  playerActorContext: { participantId: string; actorId: string; actorName: string };
  activeRoomConnection: { gmPeerId(): string };
  canonicalCharacterConfirmation: Expected | null;
  canonicalCharacterConfirmationTimer: number | undefined;
  startPlayerProductRecoveryPolling(): void;
  recoverCanonicalCharacterConfirmation(): void;
  snapshotTimer: number | undefined;
};

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'canonical-hero', notes: 'Optimistic' });
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const sync = new CanonicalSync();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), { syncService: sync });
  const internals = session as unknown as Internals;
  internals.playerActorContext = { participantId: 'owner', actorId: actor.id, actorName: 'Owner' };
  internals.activeRoomConnection = { gmPeerId: () => 'gm-peer' };
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'player', status: 'connected', connected: true,
    roomId: 'CANONICAL', peers: ['gm-peer'], lastSnapshotAt: '2026-10-25T11:59:00Z' });
  function acknowledge(revision = 1, accepted?: boolean) {
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: {
      type: 'playerCharacterUpdate', actorId: actor.id, participantId: 'owner', revision,
      updatedAt: 'now', patch: { set: { notes: `Optimistic ${revision}` }, unset: [] }
    } });
    internals.receivePlayerCharacterUpdateAck({ type: 'playerCharacterUpdateAck', actorId: actor.id,
      participantId: 'owner', revision, acknowledgedAt: 'now', accepted }, { sourcePeerId: 'gm-peer' });
  }
  function canonical(revision = 1, participantId = 'owner') {
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: {
      ...state.entities[actor.id], notes: 'Canonical', playerSyncRevision: { participantId, revision }
    } } }));
  }
  async function cleanup() {
    await session.stop();
    restoreWindow();
    vi.useRealTimers();
  }
  return { actor, sync, session, internals, acknowledge, canonical, cleanup };
}

test('matching accepted ACK with a lost canonical snapshot automatically requests it after grace', async () => {
  const { actor, sync, internals, acknowledge, cleanup } = setup();
  try {
    acknowledge();
    assert.equal(internals.pendingPlayerCharacterUpdates.size, 0);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'confirmed');
    vi.advanceTimersByTime(349);
    assert.equal(sync.requests.length, 0);
    vi.advanceTimersByTime(1);
    assert.equal(sync.requests.length, 1);
    assert.equal(sync.requests[0].reason, 'manual');
    assert.equal(sync.requests[0].target, 'gm-peer');
  } finally { await cleanup(); }
});

test('normal ACK followed by its canonical snapshot adds no recovery request', async () => {
  const { sync, internals, acknowledge, canonical, cleanup } = setup();
  try {
    acknowledge();
    canonical();
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 0);
    assert.equal(internals.canonicalCharacterConfirmation, null);
  } finally { await cleanup(); }
});

test('already observed same-participant canonical revision needs no recovery; other participant does', async () => {
  const { sync, internals, acknowledge, canonical, cleanup } = setup();
  try {
    canonical(3);
    acknowledge(2);
    assert.equal(internals.canonicalCharacterConfirmation, null);
    canonical(99, 'another-owner');
    acknowledge(4);
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 1);
  } finally { await cleanup(); }
});

test('rapid accepted toggles coalesce to the latest revision and wait for that revision', async () => {
  const { sync, internals, acknowledge, canonical, cleanup } = setup();
  try {
    acknowledge(1);
    vi.advanceTimersByTime(100);
    acknowledge(2);
    vi.advanceTimersByTime(100);
    acknowledge(3);
    canonical(2);
    vi.advanceTimersByTime(349);
    assert.equal(sync.requests.length, 0);
    assert.equal(internals.canonicalCharacterConfirmation?.revision, 3);
    vi.advanceTimersByTime(1);
    assert.equal(sync.requests.length, 1);
    canonical(3);
    internals.recoverCanonicalCharacterConfirmation();
    assert.equal(internals.canonicalCharacterConfirmation, null);
  } finally { await cleanup(); }
});

for (const failRequests of [false, true]) {
  test(`missing canonical response remains bounded even when request rejects=${failRequests}`, async () => {
    const { sync, internals, acknowledge, cleanup } = setup();
    try {
      sync.failRequests = failRequests;
      internals.startPlayerProductRecoveryPolling();
      acknowledge();
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      assert.equal(sync.requests.length, 3);
      assert.ok(sync.requests[1].at - sync.requests[0].at >= 5_000);
      assert.ok(sync.requests[2].at - sync.requests[1].at >= 5_000);
      assert.equal(internals.sessionStore.get().status, 'connected');
      vi.advanceTimersByTime(60_000);
      assert.equal(sync.requests.length, 3);
    } finally { await cleanup(); }
  });
}

test('seat change and stop invalidate the grace timer before it can issue a stale request', async () => {
  const { sync, session, internals, acknowledge, cleanup } = setup();
  try {
    acknowledge();
    session.setPlayerActorContext({ participantId: 'new-owner', actorId: 'new-hero', actorName: 'New' });
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 0);
    assert.equal(internals.canonicalCharacterConfirmation, null);
    internals.playerActorContext = { participantId: 'owner', actorId: 'canonical-hero', actorName: 'Owner' };
    acknowledge(2);
    const stopping = session.stop();
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 0);
    await stopping;
    assert.equal(internals.canonicalCharacterConfirmation, null);
  } finally { await cleanup(); }
});

test('stale ACK cannot schedule canonical recovery or clear the newer pending update', async () => {
  const { actor, sync, internals, cleanup } = setup();
  try {
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: {
      type: 'playerCharacterUpdate', actorId: actor.id, participantId: 'owner', revision: 2,
      updatedAt: 'now', patch: { set: { notes: 'Newer' }, unset: [] }
    } });
    internals.receivePlayerCharacterUpdateAck({ type: 'playerCharacterUpdateAck', actorId: actor.id,
      participantId: 'owner', revision: 1, acknowledgedAt: 'now' }, { sourcePeerId: 'gm-peer' });
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 0);
    assert.equal(internals.pendingPlayerCharacterUpdates.get(actor.id)?.message.revision, 2);
  } finally { await cleanup(); }
});

test('addressed snapshot response preserves a queued world broadcast', async () => {
  const { session, internals, cleanup } = setup();
  try {
    internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'gm' });
    const broadcast = window.setTimeout(() => undefined, 60_000);
    internals.snapshotTimer = broadcast;
    await session.publishSnapshot({ targetPeer: 'owner-peer', preserveScheduled: true });
    assert.equal(internals.snapshotTimer, broadcast);
  } finally { await cleanup(); }
});


test('in-flight recovery failure from an old generation cannot alter a stopped session', async () => {
  const { sync, session, internals, acknowledge, cleanup } = setup();
  try {
    let rejectRequest!: (error: Error) => void;
    sync.requestPromise = new Promise<boolean>((_resolve, reject) => { rejectRequest = reject; });
    acknowledge();
    vi.advanceTimersByTime(350);
    assert.equal(sync.requests.length, 1);
    await session.stop();
    const stoppedMessage = internals.sessionStore.get().message;
    rejectRequest(new Error('late transport failure'));
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(internals.sessionStore.get().message, stoppedMessage);
    assert.equal(internals.canonicalCharacterConfirmation, null);
  } finally { await cleanup(); }
});
