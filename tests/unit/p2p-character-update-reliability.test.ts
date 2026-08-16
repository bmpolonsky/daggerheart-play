import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCharacter } from '../../src/domain/rules/factories';
import type { Character } from '../../src/domain/rules/types';
import type { SyncTargetPeer } from '../../src/domain/tabletop/types';
import type { P2PSessionState } from '../../src/services/P2PSessionService';
import type { P2PRoomConnection } from '../../src/services/p2p/P2PRoomConnection';
import { SyncService, type PlayerCharacterUpdateAckMessage, type PlayerCharacterUpdateMessage } from '../../src/services/SyncService';
import { createTestP2PSession, installTimerWindow, ScriptedP2PNetwork, waitFor } from './helpers';

class RecordingSyncService extends SyncService {
  readonly characterUpdates: PlayerCharacterUpdateMessage[] = [];
  readonly characterUpdateTargets: SyncTargetPeer[] = [];
  snapshotRequests = 0;

  override async publishPlayerCharacterUpdate(message: PlayerCharacterUpdateMessage, targetPeer?: SyncTargetPeer): Promise<boolean> {
    this.characterUpdates.push(message);
    this.characterUpdateTargets.push(targetPeer);
    return true;
  }

  override async publishSnapshotRequest(): Promise<boolean> {
    this.snapshotRequests += 1;
    return true;
  }
}

interface CharacterUpdateReliabilityInternals {
  sessionStore: {
    get(): P2PSessionState;
    set(value: P2PSessionState): void;
  };
  playerActorContext: { participantId: string; actorId: string; actorName: string };
  activeRoomConnection: P2PRoomConnection;
  pendingPlayerCharacterUpdates: Map<string, { message: PlayerCharacterUpdateMessage }>;
  playerCharacterRevisions: Map<string, number>;
  persistPendingPlayerCharacterUpdate(roomId: string, message: PlayerCharacterUpdateMessage): Promise<void>;
  restorePendingPlayerCharacterUpdates(roomId: string, participantId: string, actorIds?: string[]): Promise<void>;
  receivePlayerCharacterUpdateAck(message: PlayerCharacterUpdateAckMessage): void;
  handleRoomConnectionEvent(event: unknown): void;
}

test('pending character update remains until matching ACK and is retried after GM restoration and route switch', async () => {
  const restoreWindow = installTimerWindow();
  const sync = new RecordingSyncService();
  const session = createTestP2PSession(
    new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }),
    { syncService: sync }
  );
  const actor = createCharacter({ id: 'hero-reliable', name: 'Ари' });
  const message = characterUpdate(actor, 7);
  const internals = session as unknown as CharacterUpdateReliabilityInternals;
  internals.playerActorContext = { participantId: 'player-1', actorId: actor.id, actorName: 'Игрок' };
  internals.activeRoomConnection = {
    gmPeerId: () => 'gm-peer',
    routeDiagnostics: () => [],
    peerDiagnostics: () => []
  } as unknown as P2PRoomConnection;
  internals.pendingPlayerCharacterUpdates.set(actor.id, { message });
  internals.sessionStore.set({
    ...internals.sessionStore.get(),
    connected: true,
    status: 'degraded',
    role: 'player',
    roomId: 'ACK-ROOM',
    peerId: 'player-peer'
  });

  try {
    internals.handleRoomConnectionEvent({ type: 'gm-restored', peerId: 'gm-peer', peers: ['gm-peer'] });
    await waitFor(() => assert.equal(sync.characterUpdates.length, 1));
    assert.equal(sync.characterUpdates[0], message);
    assert.equal(sync.characterUpdateTargets[0], 'gm-peer');

    internals.receivePlayerCharacterUpdateAck({
      type: 'playerCharacterUpdateAck',
      participantId: 'player-1',
      actorId: actor.id,
      revision: 6,
      acknowledgedAt: '2026-07-16T00:00:00.000Z'
    });
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), true);

    internals.handleRoomConnectionEvent({
      type: 'route-switched',
      peers: ['gm-peer'],
      switch: { peerId: 'gm-peer', from: 'nostr', to: 'torrent', reason: 'ack-timeout', envelopeId: 'envelope-1' }
    });
    await waitFor(() => assert.equal(sync.characterUpdates.length, 2));
    assert.equal(sync.characterUpdates[1], message);
    assert.equal(sync.characterUpdateTargets[1], 'gm-peer');

    internals.receivePlayerCharacterUpdateAck({
      type: 'playerCharacterUpdateAck',
      participantId: 'player-1',
      actorId: actor.id,
      revision: 7,
      acknowledgedAt: '2026-07-16T00:00:01.000Z'
    });
    assert.equal(internals.pendingPlayerCharacterUpdates.has(actor.id), false);
  } finally {
    await session.stop().catch(() => undefined);
    restoreWindow();
  }
});

test('pending character update survives a service restart and is rebound only to the same actor seat', async () => {
  const restoreWindow = installTimerWindow();
  const storage = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    configurable: true
  });
  const actor = createCharacter({ id: 'hero-durable', name: 'Ари' });
  const first = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }));
  const second = createTestP2PSession(new ScriptedP2PNetwork({ dropSnapshots: 0, dropSnapshotRequests: 0 }));
  try {
    const firstInternals = first as unknown as CharacterUpdateReliabilityInternals;
    await firstInternals.persistPendingPlayerCharacterUpdate('DURABLE-ROOM', characterUpdate(actor, 4));

    const secondInternals = second as unknown as CharacterUpdateReliabilityInternals;
    await secondInternals.restorePendingPlayerCharacterUpdates('DURABLE-ROOM', 'another-seat');
    assert.equal(secondInternals.pendingPlayerCharacterUpdates.size, 0);

    await secondInternals.restorePendingPlayerCharacterUpdates('DURABLE-ROOM', 'player-after-reload', ['another-hero']);
    assert.equal(secondInternals.pendingPlayerCharacterUpdates.size, 0);

    secondInternals.sessionStore.set({
      ...secondInternals.sessionStore.get(),
      role: 'player',
      roomId: 'DURABLE-ROOM'
    });
    second.setPlayerActorContext({ participantId: 'player-after-reload', actorId: actor.id, actorName: 'Игрок' });
    await waitFor(() => assert.equal(secondInternals.pendingPlayerCharacterUpdates.has(actor.id), true));
    const restored = secondInternals.pendingPlayerCharacterUpdates.get(actor.id)?.message;
    assert.equal(restored?.revision, 4);
    assert.equal(restored?.participantId, 'player-after-reload');
    assert.equal(secondInternals.playerCharacterRevisions.get(actor.id), 4);

    const otherActor = createCharacter({ id: 'hero-other-seat', name: 'Брин' });
    await secondInternals.persistPendingPlayerCharacterUpdate('DURABLE-ROOM', characterUpdate(otherActor, 2));
    second.setPlayerActorContext({ participantId: 'other-seat', actorId: otherActor.id, actorName: 'Другой игрок' });
    await waitFor(() => assert.deepEqual([...secondInternals.pendingPlayerCharacterUpdates.keys()], [otherActor.id]));

    second.setPlayerActorContext({ participantId: 'player-after-reload', actorId: actor.id, actorName: 'Игрок' });
    await waitFor(() => assert.deepEqual([...secondInternals.pendingPlayerCharacterUpdates.keys()], [actor.id]));
  } finally {
    await first.stop({ forgetSession: false }).catch(() => undefined);
    await second.stop({ forgetSession: false }).catch(() => undefined);
    restoreWindow();
  }
});

function characterUpdate(character: Character, revision: number): PlayerCharacterUpdateMessage {
  return {
    type: 'playerCharacterUpdate',
    participantId: 'player-1',
    actorId: character.id,
    actorName: 'Игрок',
    character,
    revision,
    updatedAt: '2026-07-16T00:00:00.000Z'
  };
}
