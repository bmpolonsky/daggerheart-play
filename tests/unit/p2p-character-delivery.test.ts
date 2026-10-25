import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import { createCharacterPatch, createCharacterRollbackPatch, rollbackRejectedCharacterPatch, type CharacterPatch } from '../../src/domain/p2p/characterPatch';
import type { SyncEventContext } from '../../src/domain/tabletop/types';
import type { Character, PersistedState } from '../../src/domain/rules/types';
import { charactersStore, resetAllStores } from '../../src/stores/gameStores';
import { snapshotPersistedState } from '../../src/stores/persistedState';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

class DeliverySync extends SyncService {
  acks: PlayerCharacterUpdateAckMessage[] = [];
  updates: PlayerCharacterUpdateMessage[] = [];
  snapshots = 0;
  override async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage) { this.acks.push(message); return true; }
  override async publishPlayerCharacterUpdate(message: PlayerCharacterUpdateMessage) { this.updates.push(message); return true; }
  override async publishSnapshotRequest() { this.snapshots++; return true; }
}

type Internals = {
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  playerActorContext: { participantId: string; actorId: string; actorName: string };
  playerCharacterRevisions: Map<string, number>;
  playerCharacterFullSignatures: Map<string, string>;
  pendingPlayerCharacterUpdates: Map<string, { message: PlayerCharacterUpdateMessage; rollback?: CharacterPatch; lastAttemptAt?: number }>;
  receivePlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage, context?: SyncEventContext): void;
  activeRoomConnection: { gmPeerId(): string | undefined };
  receivePlayerCharacterUpdate(message: PlayerCharacterUpdateMessage): Promise<void>;
  preserveUnacknowledgedPlayerCharacter(state: PersistedState): PersistedState;
  handlePlayerResume(): void;
  forwardPlayerCharacterUpdate(): Promise<void>;
  republishPendingPlayerCharacterUpdates(onlyStale?: boolean): Promise<void>;
  recordCharacterDelivery(message: PlayerCharacterUpdateMessage, state: 'pending' | 'confirmed' | 'failed', detail: string): void;
};

function setup() {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const sync = new DeliverySync();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), { syncService: sync });
  const internals = session as unknown as Internals;
  const actor = createCharacter({ id: 'hero-delivery', notes: 'before' });
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  internals.playerActorContext = { participantId: 'player-delivery', actorId: actor.id, actorName: 'Player' };
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'player', connected: true, roomId: 'DELIVERY' });
  return { actor, sync, session, internals, restoreWindow };
}

function message(actor: Character, revision = 1): PlayerCharacterUpdateMessage {
  return { type: 'playerCharacterUpdate', participantId: 'player-delivery', actorId: actor.id, revision, updatedAt: 'now', patch: { set: { notes: 'sent' }, unset: [] } };
}
function refusal(actor: Character, revision = 1): PlayerCharacterUpdateAckMessage {
  return { type: 'playerCharacterUpdateAck', participantId: 'player-delivery', actorId: actor.id, revision, acknowledgedAt: 'now', accepted: false, reason: 'Rejected' };
}

test('rollback preserves a newer local field and restores only unchanged rejected fields', () => {
  const before = createCharacter({ notes: 'before', classSlug: 'bard' });
  const sent = { ...before, notes: 'sent', classSlug: undefined };
  const patch = createCharacterPatch(before, sent);
  const rollback = createCharacterRollbackPatch(before, patch);
  const restored = rollbackRejectedCharacterPatch({ ...sent, notes: 'newer' }, patch, rollback);
  assert.equal(restored.notes, 'newer');
  assert.equal(restored.classSlug, 'bard');
});

test('cumulative retries keep the earliest rollback baseline for each field', () => {
  const before = createCharacter({ notes: 'before' });
  const sent = { ...before, notes: 'sent' };
  const first = createCharacterPatch(before, sent);
  const firstRollback = createCharacterRollbackPatch(before, first);
  const latest = { ...sent, notes: 'newer', hope: { ...sent.hope, value: 5 } };
  const cumulative = createCharacterPatch(sent, latest, first);
  const rollback = createCharacterRollbackPatch(sent, cumulative, firstRollback);
  const restored = rollbackRejectedCharacterPatch(latest, cumulative, rollback);
  assert.equal(restored.notes, 'before');
  assert.equal(restored.hope.value, before.hope.value);
});

test('explicit matching refusal clears pending, rolls back its field and requests authority snapshot', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup();
  try {
    const sent = message(actor);
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: sent, rollback: { set: { notes: 'before' }, unset: [] } });
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...actor, notes: 'sent' } } }));
    internals.receivePlayerCharacterUpdateAck(refusal(actor));
    assert.equal(charactersStore.get().entities[actor.id].notes, 'before');
    assert.equal(internals.pendingPlayerCharacterUpdates.size, 0);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'failed');
    assert.equal(sync.snapshots, 1);
  } finally { await session.stop(); restoreWindow(); }
});

test('old refusal cannot erase newer pending edits; legacy accepted ACK still confirms', async () => {
  const { actor, session, internals, restoreWindow } = setup();
  try {
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: message(actor, 2) });
    internals.receivePlayerCharacterUpdateAck(refusal(actor, 1));
    assert.equal(internals.pendingPlayerCharacterUpdates.get(actor.id)?.message.revision, 2);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id], undefined);
    const { accepted: _accepted, reason: _reason, ...ack } = refusal(actor, 2);
    internals.receivePlayerCharacterUpdateAck(ack);
    assert.equal(internals.pendingPlayerCharacterUpdates.size, 0);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'confirmed');
  } finally { await session.stop(); restoreWindow(); }
});

test('GM sends explicit refusal without returning character content', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate(message(actor));
    assert.equal(sync.acks.length, 1);
    assert.equal(sync.acks[0].accepted, false);
    assert.equal('character' in sync.acks[0], false);
    assert.equal('patch' in sync.acks[0], false);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'failed');
  } finally { await session.stop(); restoreWindow(); }
});

test('confirmed or refused outbox does not preserve stale local fields over a later authoritative snapshot', async () => {
  const { actor, session, internals, restoreWindow } = setup();
  try {
    internals.playerCharacterRevisions.set(actor.id, 4);
    const snapshot = snapshotPersistedState();
    snapshot.characters.entities[actor.id] = { ...actor, notes: 'GM newer' };
    assert.equal(internals.preserveUnacknowledgedPlayerCharacter(snapshot).characters.entities[actor.id].notes, 'GM newer');
  } finally { await session.stop(); restoreWindow(); }
});

test('resume asks for current state; delivery journal is bounded and contains no sheet payload', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup();
  try {
    internals.handlePlayerResume();
    assert.equal(sync.snapshots, 1);
    for (let revision = 1; revision <= 60; revision++) internals.recordCharacterDelivery(message(actor, revision), 'pending', 'Waiting');
    const events = internals.sessionStore.get().characterSyncEvents!;
    assert.equal(events.length, 50);
    assert.equal(events[0].revision, 60);
    assert.equal(JSON.stringify(events).includes('patch'), false);
    assert.equal(JSON.stringify(events).includes('notes'), false);
  } finally { await session.stop(); restoreWindow(); }
});


test('remote refusal from another peer or before GM discovery cannot roll back a player edit', async () => {
  const { actor, session, internals, restoreWindow } = setup();
  try {
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: message(actor) });
    internals.receivePlayerCharacterUpdateAck(refusal(actor), { sourcePeerId: 'stranger' });
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), true);
    internals.activeRoomConnection = { gmPeerId: () => 'known-gm' };
    internals.receivePlayerCharacterUpdateAck(refusal(actor), { sourcePeerId: 'stranger', verifiedSourcePeerId: 'stranger' });
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), true);
    internals.receivePlayerCharacterUpdateAck(refusal(actor), { sourcePeerId: 'known-gm', verifiedSourcePeerId: 'known-gm' });
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), false);
  } finally { await session.stop(); restoreWindow(); }
});

test('transport failure keeps optimistic edits pending and resume retries their exact revision', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup();
  try {
    internals.playerCharacterFullSignatures.set(actor.id, JSON.stringify(actor));
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...actor, notes: 'sent' } } }));
    await internals.forwardPlayerCharacterUpdate();
    const pending = internals.pendingPlayerCharacterUpdates.get(actor.id)!;
    assert.equal(pending.message.revision, 1);
    assert.equal(charactersStore.get().entities[actor.id].notes, 'sent');
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'pending');
    internals.activeRoomConnection = { gmPeerId: () => 'known-gm' };
    internals.handlePlayerResume();
    assert.equal(sync.updates[0].revision, 1);
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), true);
    assert.equal(sync.snapshots, 1);
  } finally { await session.stop(); restoreWindow(); }
});


test('periodic pending retries are bounded independently of room heartbeat frequency', async () => {
  const { actor, sync, session, internals, restoreWindow } = setup();
  try {
    internals.activeRoomConnection = { gmPeerId: () => 'known-gm' };
    const pending = { message: message(actor), lastAttemptAt: Date.now() };
    internals.pendingPlayerCharacterUpdates.set(actor.id, pending);
    await internals.republishPendingPlayerCharacterUpdates(true);
    assert.equal(sync.updates.length, 0);
    pending.lastAttemptAt = Date.now() - 5_001;
    await internals.republishPendingPlayerCharacterUpdates(true);
    assert.equal(sync.updates.length, 1);
    await internals.republishPendingPlayerCharacterUpdates(true);
    assert.equal(sync.updates.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});
