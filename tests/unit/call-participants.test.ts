import { test } from "vitest";
import assert from "node:assert/strict";
import type { FeedEntry } from "../../src/domain/rules/types";
import type { TableParticipant } from "../../src/domain/tabletop/types";
import type { MediaCallState } from "../../src/services/MediaCallService";
import { buildCallParticipants } from "../../src/ui/call/callParticipants";

test('call roster includes message authors when call presence has not arrived yet', () => {
  const participants = buildCallParticipants({
    call: createCallState(),
    connectedToRoom: true,
    feedEntries: [
      createMessageEntry({ authorName: 'Элина', participantId: 'player-elina' })
    ],
    sessionPeerId: 'peer-gm',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Леся', peerId: 'peer-gm', role: 'gm' })
    }
  });

  assert.deepEqual(participants.map((participant) => [participant.participantId, participant.displayName]), [
    ['local-gm', 'Леся'],
    ['player-elina', 'Элина']
  ]);
  assert.equal(participants[1]?.micMuted, true);
  assert.equal(participants[1]?.cameraOff, true);
});

test('call roster does not duplicate message authors already present in table participants', () => {
  const participants = buildCallParticipants({
    call: createCallState(),
    connectedToRoom: true,
    feedEntries: [
      createMessageEntry({ authorName: 'Элина', participantId: 'player-elina' })
    ],
    sessionPeerId: 'peer-gm',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Леся', peerId: 'peer-gm', role: 'gm' }),
      'player-elina': createTableParticipant({ id: 'player-elina', name: 'Элина', peerId: 'peer-player', role: 'player' })
    }
  });

  assert.equal(participants.filter((participant) => participant.displayName === 'Элина').length, 1);
});

test('call roster ignores message authors without participant identity', () => {
  const participants = buildCallParticipants({
    call: createCallState(),
    connectedToRoom: true,
    feedEntries: [
      createMessageEntry({ authorName: 'Заброшенная роща' })
    ],
    sessionPeerId: 'peer-gm',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Леся', peerId: 'peer-gm', role: 'gm' })
    }
  });

  assert.deepEqual(participants.map((participant) => participant.displayName), ['Леся']);
});

test('local call participant reflects the latest camera stream and state', () => {
  const localStream = {
    id: 'local-camera-stream',
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [{ id: 'local-camera-track', enabled: true }]
  } as unknown as MediaStream;
  const call = {
    ...createCallState(),
    cameraOff: false,
    localStream
  };

  const participants = buildCallParticipants({
    call,
    connectedToRoom: true,
    sessionPeerId: 'peer-gm',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Леся', peerId: 'peer-gm', role: 'gm' })
    }
  });

  assert.equal(participants[0]?.cameraOff, false);
  assert.equal(participants[0]?.stream, localStream);
});

test('call roster keeps the local player while the table snapshot only contains the gm', () => {
  const call = {
    ...createCallState(),
    localParticipantId: 'local-player',
    displayName: 'kjk',
    role: 'player' as const
  };

  const participants = buildCallParticipants({
    call,
    connectedToRoom: true,
    sessionPeerId: 'peer-player',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Леся', peerId: 'peer-gm', role: 'gm' })
    }
  });

  assert.deepEqual(participants.map((participant) => [participant.participantId, participant.displayName]), [
    ['local-gm', 'Леся'],
    ['local-player', 'kjk']
  ]);
});

test('player call roster hides the unresolved default gm placeholder', () => {
  const call = {
    ...createCallState(),
    localParticipantId: 'local-player',
    displayName: 'kjk',
    role: 'player' as const
  };

  const participants = buildCallParticipants({
    call,
    connectedToRoom: true,
    sessionPeerId: 'peer-player',
    tableParticipants: {
      'local-gm': createTableParticipant({ id: 'local-gm', name: 'Мастер', role: 'gm', peerId: undefined })
    }
  });

  assert.deepEqual(participants.map((participant) => participant.displayName), ['kjk']);
});

function createCallState(): MediaCallState {
  return {
    roomId: '4XZCSU',
    localParticipantId: 'local-gm',
    displayName: 'Леся',
    role: 'gm',
    active: true,
    status: 'connected',
    message: '',
    micMuted: true,
    cameraOff: true,
    handRaised: false,
    audioPlaybackBlocked: false,
    audioPlaybackActive: false,
    localStream: null,
    remoteParticipants: {}
  };
}

function createTableParticipant(input: Partial<TableParticipant> & Pick<TableParticipant, 'id' | 'name' | 'role'>): TableParticipant {
  return {
    actorIds: [],
    connected: true,
    updatedAt: '2026-06-26T00:00:00.000Z',
    ...input
  };
}

function createMessageEntry(input: { authorName: string; participantId?: string }): FeedEntry {
  return {
    id: `feed-${input.authorName}`,
    type: 'message',
    createdAt: '2026-06-26T00:00:00.000Z',
    visibility: 'public',
    participantId: input.participantId,
    authorName: input.authorName,
    title: input.authorName,
    body: 'test'
  };
}
