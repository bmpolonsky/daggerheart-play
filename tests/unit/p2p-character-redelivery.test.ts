import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Character, PersistedState } from '../../src/domain/rules/types';
import { createCharacter } from '../../src/domain/rules/factories';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import type { SyncEventContext, SyncTargetPeer } from '../../src/domain/tabletop/types';
import { CharacterService } from '../../src/services/CharacterService';
import { SceneTableService } from '../../src/services/SceneTableService';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { charactersStore, resetAllStores, sceneTableStore } from '../../src/stores/gameStores';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

class LossyDelivery extends SyncService {
  dropAck = false;
  dropSnapshot = false;
  failSnapshot = false;
  ackAttempts: Array<{ message: PlayerCharacterUpdateAckMessage; target: SyncTargetPeer }> = [];
  deliveredAcks: PlayerCharacterUpdateAckMessage[] = [];
  snapshotAttempts: Array<{ state: PersistedState; target: SyncTargetPeer }> = [];
  clientCharacter: Character | undefined;

  override async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage, target?: SyncTargetPeer): Promise<boolean> {
    this.ackAttempts.push({ message, target });
    if (!this.dropAck) this.deliveredAcks.push(message);
    return true;
  }
  override async publishSnapshot(state: PersistedState, target?: SyncTargetPeer): Promise<boolean> {
    this.snapshotAttempts.push({ state, target });
    if (this.failSnapshot) throw new Error('snapshot transport unavailable');
    if (!this.dropSnapshot) this.clientCharacter = structuredClone(state.characters.entities.hero);
    return true;
  }
}

type RedeliveryInternals = {
  receivePlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, context?: SyncEventContext): Promise<void>;
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
  snapshotTimer: number | undefined;
};

function setup() {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'hero', notes: 'Before' });
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const owner = createLocalParticipant({ id: 'owner', name: 'Owner', role: 'player', actorIds: [actor.id], peerId: 'owner-peer' });
  sceneTableStore.update((state) => ({ ...state, participants: { [owner.id]: owner } }));
  const sync = new LossyDelivery();
  const characters = new CharacterService();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    syncService: sync, characterService: characters, sceneTableService: new SceneTableService()
  });
  const internals = session as unknown as RedeliveryInternals;
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'gm', connected: true, roomId: 'RECOVER', peers: ['owner-peer', 'other-peer'] });
  const context: SyncEventContext = { sourcePeerId: 'owner-peer', verifiedSourcePeerId: 'verified-owner' };
  const update: PlayerCharacterUpdateMessage = {
    type: 'playerCharacterUpdate', actorId: actor.id, participantId: owner.id,
    revision: 1, updatedAt: '2026-10-25T00:00:00Z', patch: { set: { notes: 'Player edit' }, unset: [] }
  };
  return { actor, sync, characters, session, internals, context, update, restoreWindow };
}

for (const [dropAck, dropSnapshot] of [[true, false], [false, true], [true, true]] as const) {
  test(`duplicate recovers dropped ACK=${dropAck} snapshot=${dropSnapshot} without applying twice`, async () => {
    const { actor, sync, characters, session, internals, context, update, restoreWindow } = setup();
    try {
      sync.dropAck = dropAck;
      sync.dropSnapshot = dropSnapshot;
      await internals.receivePlayerCharacterUpdate(update, context);
      assert.equal(characters.getCharacter(actor.id)?.notes, 'Player edit');
      assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, 1);
      assert.equal(sync.deliveredAcks.length, dropAck ? 0 : 1);
      assert.equal(sync.clientCharacter?.notes, dropSnapshot ? undefined : 'Player edit');

      // Recovery must deliver current authority values, including later GM
      // corrections, rather than the contents of the repeated player message.
      characters.updateIdentity(actor.id, { notes: 'GM correction' });
      const historyBeforeRetry = characters.getCharacter(actor.id)?.changeHistory?.length;
      sync.dropAck = false;
      sync.dropSnapshot = false;
      const broadcast = window.setTimeout(() => undefined, 60_000);
      internals.snapshotTimer = broadcast;
      await internals.receivePlayerCharacterUpdate(update, context);
      assert.equal(sync.ackAttempts.at(-1)?.target, 'owner-peer');
      assert.equal(sync.deliveredAcks.at(-1)?.revision, 1);
      assert.equal(sync.snapshotAttempts.at(-1)?.target, 'owner-peer');
      assert.equal(sync.clientCharacter?.notes, 'GM correction');
      assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, historyBeforeRetry);
      assert.equal(internals.snapshotTimer, broadcast);
    } finally { await session.stop(); restoreWindow(); }
  });
}

test('unknown stale revision is explicitly unconfirmed and receives current state without replaying history', async () => {
  const { actor, sync, characters, session, internals, context, update, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate({ ...update, revision: 2 }, context);
    const history = characters.getCharacter(actor.id)?.changeHistory?.length;
    await internals.receivePlayerCharacterUpdate({ ...update, patch: { set: { notes: 'Stale' }, unset: [] } }, context);
    assert.deepEqual(sync.deliveredAcks.map(ack => ack.revision), [2, 1]);
    assert.equal(sync.deliveredAcks.at(-1)?.accepted, false);
    assert.equal(sync.clientCharacter?.notes, 'Player edit');
    assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
  } finally { await session.stop(); restoreWindow(); }
});

test('character update replay after GM service restart stays idempotent using persisted authority revision', async () => {
  const { actor, sync, characters, session, internals, context, update, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate(update, context);
    const history = characters.getCharacter(actor.id)?.changeHistory?.length;
    // A new service sees the persisted character revision; no in-memory seen-ID
    // cache from the previous service is required for duplicate suppression.
    const restarted = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
      syncService: sync, characterService: characters, sceneTableService: new SceneTableService()
    });
    try {
      const next = restarted as unknown as RedeliveryInternals;
      next.sessionStore.set({ ...next.sessionStore.get(), role: 'gm', connected: true, roomId: 'RECOVER', peers: ['owner-peer'] });
      await next.receivePlayerCharacterUpdate(update, context);
      assert.equal(sync.snapshotAttempts.at(-1)?.target, 'owner-peer');
      assert.equal(sync.clientCharacter?.notes, 'Player edit');
      assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
    } finally { await restarted.stop(); }
  } finally { await session.stop(); restoreWindow(); }
});

test('same-participant revision collision is explicitly rejected without applying another device payload', async () => {
  const { actor, sync, characters, session, internals, context, update, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate(update, context);
    const phoneUpdate: PlayerCharacterUpdateMessage = { ...update, patch: { set: { notes: 'Phone edit at the same revision' }, unset: [] } };
    // Distinct verified devices are currently rejected by ownership binding.
    await internals.receivePlayerCharacterUpdate(phoneUpdate, { sourcePeerId: 'phone-peer', verifiedSourcePeerId: 'verified-phone' });
    assert.equal(sync.deliveredAcks.at(-1)?.accepted, false);
    assert.equal(characters.getCharacter(actor.id)?.notes, 'Player edit');
    // A shared transport identity is not a writer lock: the operation receipt
    // distinguishes this different payload from an exact retry.
    await internals.receivePlayerCharacterUpdate(phoneUpdate, context);
    assert.equal(sync.deliveredAcks.at(-1)?.accepted, false);
    assert.match(sync.deliveredAcks.at(-1)?.reason ?? '', /Конфликт/);
    assert.equal(sync.clientCharacter?.notes, 'Player edit');
    assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});


test('duplicate snapshot transport failure does not undo acceptance or repeat the mutation', async () => {
  const { actor, sync, characters, session, internals, context, update, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate(update, context);
    const history = characters.getCharacter(actor.id)?.changeHistory?.length;
    sync.failSnapshot = true;
    await internals.receivePlayerCharacterUpdate(update, context);
    assert.equal(sync.deliveredAcks.at(-1)?.revision, 1);
    assert.notEqual(sync.deliveredAcks.at(-1)?.accepted, false);
    assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
    assert.equal(internals.sessionStore.get().status, 'degraded');
  } finally { await session.stop(); restoreWindow(); }
});
