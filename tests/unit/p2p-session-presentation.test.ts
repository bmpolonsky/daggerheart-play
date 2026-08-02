import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  resolveTableSessionContext,
  tableConnectionPresentation,
  type LiveSessionSummary,
  type SessionIdentity
} from '../../src/domain/p2p/sessionPresentation';

const storedPlayer: SessionIdentity = {
  role: 'player',
  roomId: 'ROOM-1',
  participantId: 'seat-1'
};

const disconnectedSession: LiveSessionSummary = {
  connected: false,
  status: 'disconnected',
  role: null,
  roomId: '',
  lastSnapshotAt: null,
  message: ''
};

test('active GM entry wins over a stale stored player session', () => {
  const context = resolveTableSessionContext({
    liveSession: {
      role: 'gm',
      roomId: 'GM-ROOM'
    },
    storedSession: storedPlayer
  });

  assert.deepEqual(context, {
    role: 'gm',
    playerRoomId: ''
  });
  assert.equal(tableConnectionPresentation({
    context,
    liveSession: {
      ...disconnectedSession,
      connected: true,
      status: 'connected',
      role: 'gm',
      roomId: 'GM-ROOM'
    },
    storedSession: storedPlayer,
    selectedParticipantId: 'seat-1',
    hasCharacter: true,
    initialWaitDelayed: false
  }).phase, 'hidden');
});

test('explicit GM route wins over stored player identity before a live session exists', () => {
  assert.deepEqual(resolveTableSessionContext({
    explicitRole: 'gm',
    liveSession: disconnectedSession,
    storedSession: storedPlayer
  }), {
    role: 'gm',
    playerRoomId: ''
  });
});

test('saved player reload is covered before transport or GM peer appears', () => {
  const context = resolveTableSessionContext({
    liveSession: disconnectedSession,
    storedSession: storedPlayer
  });
  const presentation = tableConnectionPresentation({
    context,
    liveSession: disconnectedSession,
    storedSession: storedPlayer,
    selectedParticipantId: 'seat-1',
    hasCharacter: false,
    initialWaitDelayed: false
  });

  assert.equal(presentation.phase, 'restoring');
  assert.equal(presentation.title, 'Восстанавливаем подключение');
});

test('snapshot only completes restore when it belongs to the current player room', () => {
  const context = resolveTableSessionContext({
    liveSession: disconnectedSession,
    storedSession: storedPlayer
  });
  const wrongRoom = tableConnectionPresentation({
    context,
    liveSession: {
      ...disconnectedSession,
      connected: true,
      status: 'connected',
      role: 'player',
      roomId: 'OTHER-ROOM',
      lastSnapshotAt: '2026-07-30T12:00:00.000Z'
    },
    storedSession: storedPlayer,
    selectedParticipantId: 'seat-1',
    hasCharacter: true,
    initialWaitDelayed: false
  });
  const currentRoom = tableConnectionPresentation({
    context,
    liveSession: {
      ...disconnectedSession,
      connected: true,
      status: 'connected',
      role: 'player',
      roomId: 'ROOM-1',
      lastSnapshotAt: '2026-07-30T12:00:00.000Z'
    },
    storedSession: storedPlayer,
    selectedParticipantId: 'seat-1',
    hasCharacter: true,
    initialWaitDelayed: false
  });

  assert.equal(wrongRoom.phase, 'restoring');
  assert.equal(currentRoom.phase, 'hidden');
});

test('player without a saved identity is not mistaken for a restore attempt', () => {
  const context = {
    role: 'player' as const,
    playerRoomId: 'ROOM-1'
  };

  assert.equal(tableConnectionPresentation({
    context,
    liveSession: disconnectedSession,
    storedSession: null,
    selectedParticipantId: null,
    hasCharacter: false,
    initialWaitDelayed: false
  }).phase, 'hidden');
});

test('a room draft without a saved participant is not promoted into a restore attempt', () => {
  const storedDraft: SessionIdentity = {
    role: 'player',
    roomId: 'ROOM-1'
  };
  const context = resolveTableSessionContext({
    liveSession: disconnectedSession,
    storedSession: storedDraft
  });

  assert.equal(tableConnectionPresentation({
    context,
    liveSession: {
      ...disconnectedSession,
      status: 'connecting',
      role: 'player',
      roomId: 'ROOM-1'
    },
    storedSession: storedDraft,
    selectedParticipantId: null,
    hasCharacter: false,
    initialWaitDelayed: false
  }).phase, 'hidden');
});

test('delayed restore remains covered instead of revealing local stores', () => {
  const context = resolveTableSessionContext({
    liveSession: disconnectedSession,
    storedSession: storedPlayer
  });
  const presentation = tableConnectionPresentation({
    context,
    liveSession: disconnectedSession,
    storedSession: storedPlayer,
    selectedParticipantId: 'seat-1',
    hasCharacter: false,
    initialWaitDelayed: true
  });

  assert.equal(presentation.phase, 'restoring');
  assert.equal(presentation.title, 'Восстанавливаем соединение');
});
