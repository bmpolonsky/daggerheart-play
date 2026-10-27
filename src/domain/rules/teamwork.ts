import type { TeamworkRollParticipant, TraitId } from './types';

export function teamworkParticipantRoleRevision(participant: Pick<TeamworkRollParticipant, 'roleRevision'>): number {
  const value = participant.roleRevision;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** An approval executes the player's submitted trait, not the GM's stale draft. */
export function teamworkParticipantRollTrait(participant: Pick<TeamworkRollParticipant, 'pendingRoll'>, localTrait?: TraitId): TraitId {
  if (participant.pendingRoll?.status === 'pending') return participant.pendingRoll.trait ?? localTrait ?? 'agility';
  return localTrait ?? participant.pendingRoll?.trait ?? 'agility';
}
