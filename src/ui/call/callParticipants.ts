import type { FeedEntry } from '../../domain/rules/types';
import type { TableParticipant } from '../../domain/tabletop/types';
import type { CallParticipant, MediaCallState } from '../../services/MediaCallService';

export function buildCallParticipants(input: {
  call: MediaCallState;
  connectedToRoom: boolean;
  feedEntries?: FeedEntry[];
  sessionPeerId: string | null;
  tableParticipants: Record<string, TableParticipant>;
}): CallParticipant[] {
  const tableParticipants = Object.values(input.tableParticipants)
    .filter((participant) => participant.role === 'gm' || participant.role === 'player')
    .filter((participant) => participant.connected || participant.id === input.call.localParticipantId || participant.peerId === input.sessionPeerId)
    .filter((participant) => !isUnresolvedDefaultGm(participant, input.call))
    .sort((first, second) => callParticipantSortRank(first) - callParticipantSortRank(second) || first.name.localeCompare(second.name, 'ru'));

  if (tableParticipants.length === 0) {
    return [
      localParticipantFromCall(input.call),
      ...Object.values(input.call.remoteParticipants).filter((participant) => participant.connected)
    ];
  }

  const usedRemoteIds = new Set<string>();
  const participants = tableParticipants.map((participant) => {
    const remote = input.call.remoteParticipants[participant.id]
      ?? Object.values(input.call.remoteParticipants).find((item) => item.peerId && item.peerId === participant.peerId);
    if (remote) usedRemoteIds.add(remote.participantId);
    const isLocal = participant.id === input.call.localParticipantId || Boolean(participant.peerId && participant.peerId === input.sessionPeerId);
    return isLocal
      ? localParticipantFromCall(input.call, participant, input.connectedToRoom)
      : callParticipantFromTableParticipant(participant, remote);
  });

  const hasLocalParticipant = participants.some((participant) =>
    participant.participantId === input.call.localParticipantId
    || Boolean(input.sessionPeerId && participant.peerId === input.sessionPeerId)
  );
  if (!hasLocalParticipant) {
    const localParticipant = localParticipantFromCall(input.call, undefined, input.connectedToRoom);
    if (input.call.role === 'gm') {
      participants.unshift(localParticipant);
    } else {
      participants.push(localParticipant);
    }
  }

  Object.values(input.call.remoteParticipants).forEach((participant) => {
    if (!participant.connected || usedRemoteIds.has(participant.participantId)) return;
    participants.push(participant);
  });

  addMessageParticipants(participants, input.feedEntries ?? []);
  return participants;
}

export function findLocalTableParticipant(participants: Record<string, TableParticipant>, localParticipantId: string, peerId: string | null): TableParticipant | undefined {
  return Object.values(participants).find((participant) => participant.id === localParticipantId)
    ?? Object.values(participants).find((participant) => peerId && participant.peerId === peerId);
}

function callParticipantFromTableParticipant(participant: TableParticipant, remote?: CallParticipant): CallParticipant {
  return {
    type: 'callPresence',
    participantId: remote?.participantId ?? participant.id,
    displayName: remote?.displayName || participant.name,
    role: remote?.role ?? (participant.role === 'gm' ? 'gm' : 'player'),
    connected: remote?.connected ?? participant.connected,
    micMuted: remote?.micMuted ?? true,
    cameraOff: remote?.cameraOff ?? true,
    handRaised: remote?.handRaised ?? false,
    updatedAt: remote?.updatedAt ?? participant.updatedAt,
    peerId: remote?.peerId ?? participant.peerId,
    stream: remote?.stream ?? null
  };
}

function localParticipantFromCall(call: MediaCallState, participant?: TableParticipant, connected = Boolean(call.roomId)): CallParticipant {
  return {
    type: 'callPresence',
    participantId: participant?.id ?? call.localParticipantId,
    displayName: call.displayName || participant?.name || 'Вы',
    role: call.role,
    connected,
    micMuted: call.micMuted,
    cameraOff: call.cameraOff,
    handRaised: call.handRaised,
    updatedAt: participant?.updatedAt ?? '',
    peerId: participant?.peerId,
    stream: call.localStream
  };
}

function callParticipantSortRank(participant: TableParticipant): number {
  return participant.role === 'gm' ? 0 : 1;
}

function isUnresolvedDefaultGm(participant: TableParticipant, call: MediaCallState): boolean {
  return call.role !== 'gm'
    && participant.id === 'local-gm'
    && participant.name === 'Мастер'
    && !participant.peerId
    && !call.remoteParticipants[participant.id];
}

function addMessageParticipants(participants: CallParticipant[], feedEntries: FeedEntry[]): void {
  feedEntries
    .filter((entry) => entry.type === 'message')
    .slice()
    .reverse()
    .forEach((entry) => {
      const authorName = entry.authorName.trim();
      if (!authorName) return;
      const participantId = entry.participantId?.trim();
      if (!participantId) return;
      const alreadyListed = participants.some((participant) => {
        if (participant.participantId === participantId) return true;
        return normalizeParticipantName(participant.displayName) === normalizeParticipantName(authorName);
      });
      if (alreadyListed) return;
      participants.push({
        type: 'callPresence',
        participantId,
        displayName: authorName,
        role: 'guest',
        connected: true,
        micMuted: true,
        cameraOff: true,
        handRaised: false,
        updatedAt: entry.createdAt,
        stream: null
      });
    });
}

function normalizeParticipantName(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU');
}
