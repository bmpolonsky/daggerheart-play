import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import type { Character, PersistedState } from '../../src/domain/rules/types';
import type { SyncEventContext, SyncTargetPeer } from '../../src/domain/tabletop/types';
import { createLocalParticipant } from '../../src/domain/tabletop/factories';
import { CharacterService } from '../../src/services/CharacterService';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import { SceneTableService } from '../../src/services/SceneTableService';
import { SyncService, playerCharacterUpdateOperationHash, type PlayerCharacterUpdateMessage, type PlayerCharacterUpdateAckMessage } from '../../src/services/SyncService';
import { charactersStore, sceneTableStore, resetAllStores } from '../../src/stores/gameStores';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork } from './helpers';

class ReceiptSync extends SyncService {
  acks: PlayerCharacterUpdateAckMessage[] = [];
  snapshots: Array<{ state: PersistedState; target: SyncTargetPeer }> = [];
  override async publishPlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage): Promise<boolean> { this.acks.push(message); return true; }
  override async publishSnapshot(state: PersistedState, target?: SyncTargetPeer): Promise<boolean> { this.snapshots.push({ state, target }); return true; }
  override async publishSnapshotRequest(): Promise<boolean> { return true; }
}

type Internals = {
  receivePlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, context?: SyncEventContext): Promise<void>;
  receivePlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage, context?: SyncEventContext): void;
  pendingPlayerCharacterUpdates: Map<string, { message: PlayerCharacterUpdateMessage; rollback?: { set: Partial<Character>; unset: Array<keyof Character> } }>;
  playerActorContext: { participantId: string; actorId: string; actorName: string };
  sessionStore: { get(): P2PSessionState; set(value: P2PSessionState): void };
};

function operation(notes: string, revision = 1): Extract<PlayerCharacterUpdateMessage, { patch: unknown }> {
  return { type: 'playerCharacterUpdate', participantId: 'owner', actorId: 'receipt-hero', revision, updatedAt: 'now', patch: { set: { notes }, unset: [] } };
}
function setup() {
  const restoreWindow = installTimerWindow();
  resetAllStores();
  const actor = createCharacter({ id: 'receipt-hero', notes: 'Before' });
  charactersStore.update((state) => ({ ...state, entities: { [actor.id]: actor }, order: [actor.id] }));
  const owner = createLocalParticipant({ id: 'owner', name: 'Owner', role: 'player', actorIds: [actor.id], peerId: 'owner-peer' });
  sceneTableStore.update((state) => ({ ...state, participants: { [owner.id]: owner } }));
  const sync = new ReceiptSync();
  const characters = new CharacterService();
  const session = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
    syncService: sync, characterService: characters, sceneTableService: new SceneTableService()
  });
  const internals = session as unknown as Internals;
  internals.sessionStore.set({ ...internals.sessionStore.get(), role: 'gm', connected: true, roomId: 'RECEIPTS', peers: ['owner-peer'] });
  const context: SyncEventContext = { sourcePeerId: 'owner-peer', verifiedSourcePeerId: 'owner-verified' };
  return { actor, sync, characters, session, internals, context, restoreWindow };
}

for (const notes of ['', 'a', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'Кириллица 🎲'.repeat(100)]) {
  test(`operation SHA-256 matches standard implementation for ${notes.length} characters`, () => {
    const message = operation(notes);
    const canonical = JSON.stringify({ kind: 'patch', set: { notes }, unset: [] });
    assert.equal(playerCharacterUpdateOperationHash(message), createHash('sha256').update(canonical).digest('hex'));
  });
}

test('operation digest canonicalizes nested object insertion order and unset set order but ignores transport metadata', () => {
  const first: PlayerCharacterUpdateMessage = { ...operation('Edit'), patch: { set: { notes: 'Edit', hope: { value: 3, max: 6 } }, unset: ['classSlug', 'classSourceId', 'classSlug'] } };
  const reordered: PlayerCharacterUpdateMessage = { ...first, actorName: 'New display name', updatedAt: 'retry time', patch: { set: { hope: { max: 6, value: 3 }, notes: 'Edit' }, unset: ['classSourceId', 'classSlug'] } };
  assert.equal(playerCharacterUpdateOperationHash(first), playerCharacterUpdateOperationHash(reordered));
  assert.notEqual(playerCharacterUpdateOperationHash(first), playerCharacterUpdateOperationHash(operation('Other edit')));
  const actor = createCharacter({ id: 'receipt-hero' });
  const reversed = Object.fromEntries(Object.entries(actor).reverse()) as unknown as Character;
  assert.equal(playerCharacterUpdateOperationHash({ ...operation('unused'), patch: undefined, character: actor }),
    playerCharacterUpdateOperationHash({ ...operation('unused'), patch: undefined, character: reversed }));
});

test('exact accepted operation retry survives later GM edit, JSON normalization and service restart', async () => {
  const { actor, sync, characters, session, internals, context, restoreWindow } = setup();
  try {
    const sent = operation('Accepted');
    await internals.receivePlayerCharacterUpdate(sent, context);
    characters.updateIdentity(actor.id, { notes: 'Later GM edit' });
    const normalized = createCharacter(JSON.parse(JSON.stringify(characters.getCharacter(actor.id))));
    assert.equal(normalized.playerSyncRevision?.receipts?.length, 1);
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: normalized } }));
    const history = normalized.changeHistory?.length;
    const restarted = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }), {
      syncService: sync, characterService: characters, sceneTableService: new SceneTableService()
    });
    try {
      const next = restarted as unknown as Internals;
      next.sessionStore.set({ ...next.sessionStore.get(), role: 'gm', connected: true, roomId: 'RECEIPTS', peers: ['owner-peer'] });
      await next.receivePlayerCharacterUpdate({ ...sent, updatedAt: 'later retry' }, context);
      assert.notEqual(sync.acks.at(-1)?.accepted, false);
      assert.equal(sync.acks.at(-1)?.operationHash, playerCharacterUpdateOperationHash(sent));
      assert.equal(characters.getCharacter(actor.id)?.notes, 'Later GM edit');
      assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
      assert.equal(sync.snapshots.at(-1)?.target, 'owner-peer');
      assert.equal(sync.snapshots.at(-1)?.state.characters.entities[actor.id].notes, 'Later GM edit');
    } finally { await restarted.stop(); }
  } finally { await session.stop(); restoreWindow(); }
});

test('same revision different payload receives explicit conflict refusal and canonical state', async () => {
  const { actor, sync, characters, session, internals, context, restoreWindow } = setup();
  try {
    await internals.receivePlayerCharacterUpdate(operation('Desktop'), context);
    const history = characters.getCharacter(actor.id)?.changeHistory?.length;
    const phone = operation('Phone');
    await internals.receivePlayerCharacterUpdate(phone, context);
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.match(sync.acks.at(-1)?.reason ?? '', /Конфликт/);
    assert.equal(sync.acks.at(-1)?.operationHash, playerCharacterUpdateOperationHash(phone));
    assert.equal(sync.snapshots.at(-1)?.state.characters.entities[actor.id].notes, 'Desktop');
    assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
  } finally { await session.stop(); restoreWindow(); }
});

test('unknown legacy revision is never claimed accepted; an old client can still send its next update without wire receipt fields', async () => {
  const { actor, sync, characters, session, internals, context, restoreWindow } = setup();
  try {
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: {
      ...actor, notes: 'Legacy canonical', playerSyncRevision: { participantId: 'owner', revision: 4 }
    } } }));
    await internals.receivePlayerCharacterUpdate(operation('Unknown old retry', 4), context);
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.match(sync.acks.at(-1)?.reason ?? '', /нет сохранённого подтверждения/);
    assert.equal(sync.snapshots.at(-1)?.state.characters.entities[actor.id].notes, 'Legacy canonical');
    await internals.receivePlayerCharacterUpdate(operation('Old client new edit', 5), context);
    assert.notEqual(sync.acks.at(-1)?.accepted, false);
    assert.equal(characters.getCharacter(actor.id)?.notes, 'Old client new edit');
    assert.equal(characters.getCharacter(actor.id)?.playerSyncRevision?.receipts?.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});

test('bounded receipts keep recent exact retries and explicitly refuse evicted unknown old operations', async () => {
  const { actor, sync, characters, session, internals, context, restoreWindow } = setup();
  try {
    for (let revision = 1; revision <= 20; revision++) await internals.receivePlayerCharacterUpdate(operation(`Edit ${revision}`, revision), context);
    const current = characters.getCharacter(actor.id)!;
    assert.equal(current.playerSyncRevision?.receipts?.length, 16);
    assert.equal(current.playerSyncRevision?.receipts?.[0].revision, 5);
    const serialized = JSON.stringify(current.playerSyncRevision);
    assert.equal(serialized.includes('Edit 20'), false);
    assert.equal(serialized.includes('notes'), false);
    await internals.receivePlayerCharacterUpdate(operation('Edit 5', 5), context);
    assert.notEqual(sync.acks.at(-1)?.accepted, false);
    await internals.receivePlayerCharacterUpdate(operation('Edit 1', 1), context);
    assert.equal(sync.acks.at(-1)?.accepted, false);
    assert.equal(characters.getCharacter(actor.id)?.notes, 'Edit 20');
  } finally { await session.stop(); restoreWindow(); }
});

test('receipt normalizer preserves old saves and rejects malformed or oversized receipt metadata', () => {
  assert.deepEqual(createCharacter({ playerSyncRevision: { participantId: 'owner', revision: 4 } }).playerSyncRevision, { participantId: 'owner', revision: 4 });
  const receipts = Array.from({ length: 40 }, (_, index) => ({ participantId: 'owner', revision: index + 1, operationHash: 'a'.repeat(64) }));
  const input = { participantId: 'owner', revision: 40, receipts: [...receipts, { participantId: 'owner', revision: 41, operationHash: 'raw secret' }] };
  const normalized = createCharacter({ playerSyncRevision: input }).playerSyncRevision!;
  assert.equal(normalized.receipts?.length, 16);
  assert.equal(normalized.receipts?.at(-1)?.revision, 40);
  assert.equal(JSON.stringify(normalized).includes('raw secret'), false);
});

test('duplicate ACK for another payload cannot clear or roll back the current same-revision operation', async () => {
  const { actor, session, internals, restoreWindow } = setup();
  try {
    const pending = operation('Phone');
    internals.playerActorContext = { participantId: 'owner', actorId: actor.id, actorName: 'Owner' };
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: pending, rollback: { set: { notes: 'Before' }, unset: [] } });
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...actor, notes: 'Phone' } } }));
    const otherAck: PlayerCharacterUpdateAckMessage = { type: 'playerCharacterUpdateAck', participantId: 'owner', actorId: actor.id,
      revision: 1, acknowledgedAt: 'now', operationHash: playerCharacterUpdateOperationHash(operation('Desktop')) };
    internals.receivePlayerCharacterUpdateAck(otherAck);
    internals.receivePlayerCharacterUpdateAck({ ...otherAck, accepted: false });
    assert.equal(internals.pendingPlayerCharacterUpdates.get(actor.id)?.message, pending);
    assert.equal(charactersStore.get().entities[actor.id].notes, 'Phone');
    // A newer local field is protected even from the matching conflict NACK.
    charactersStore.update((state) => ({ ...state, entities: { ...state.entities, [actor.id]: { ...actor, notes: 'Newer local edit' } } }));
    const ownRefusal = { ...otherAck, accepted: false, operationHash: playerCharacterUpdateOperationHash(pending) };
    internals.receivePlayerCharacterUpdateAck(ownRefusal);
    assert.equal(internals.pendingPlayerCharacterUpdates.size, 0);
    assert.equal(charactersStore.get().entities[actor.id].notes, 'Newer local edit');
    internals.receivePlayerCharacterUpdateAck(ownRefusal);
    assert.equal(charactersStore.get().entities[actor.id].notes, 'Newer local edit');
  } finally { await session.stop(); restoreWindow(); }
});


test('legacy full-character messages require no receipt fields and exact retries preserve later GM edits', async () => {
  const { actor, sync, characters, session, internals, context, restoreWindow } = setup();
  try {
    const sent: PlayerCharacterUpdateMessage = { type: 'playerCharacterUpdate', participantId: 'owner', actorId: actor.id,
      revision: 1, updatedAt: 'legacy-client', character: { ...actor, notes: 'Legacy full edit' } };
    await internals.receivePlayerCharacterUpdate(sent, context);
    assert.notEqual(sync.acks.at(-1)?.accepted, false);
    characters.updateIdentity(actor.id, { notes: 'GM after legacy full edit' });
    const history = characters.getCharacter(actor.id)?.changeHistory?.length;
    await internals.receivePlayerCharacterUpdate(sent, context);
    assert.notEqual(sync.acks.at(-1)?.accepted, false);
    assert.equal(characters.getCharacter(actor.id)?.notes, 'GM after legacy full edit');
    assert.equal(characters.getCharacter(actor.id)?.changeHistory?.length, history);
  } finally { await session.stop(); restoreWindow(); }
});

test('matching receipt ACK is idempotent when delivered twice to the player', async () => {
  const { actor, session, internals, restoreWindow } = setup();
  try {
    const pending = operation('Accepted');
    internals.playerActorContext = { participantId: 'owner', actorId: actor.id, actorName: 'Owner' };
    internals.pendingPlayerCharacterUpdates.set(actor.id, { message: pending });
    const ack: PlayerCharacterUpdateAckMessage = { type: 'playerCharacterUpdateAck', participantId: 'owner', actorId: actor.id,
      revision: 1, acknowledgedAt: 'now', operationHash: playerCharacterUpdateOperationHash(pending) };
    internals.receivePlayerCharacterUpdateAck(ack);
    internals.receivePlayerCharacterUpdateAck(ack);
    assert.equal(internals.pendingPlayerCharacterUpdates.size, 0);
    assert.equal(internals.sessionStore.get().characterSync?.[actor.id].state, 'confirmed');
    assert.equal(internals.sessionStore.get().characterSyncEvents?.length, 1);
  } finally { await session.stop(); restoreWindow(); }
});
