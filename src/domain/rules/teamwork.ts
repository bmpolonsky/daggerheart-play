import type { TeamworkRollParticipant, TraitId } from './types';

/** An approval executes the player's submitted trait, not the GM's stale draft. */
export function teamworkParticipantRollTrait(participant: Pick<TeamworkRollParticipant, 'pendingRoll'>, localTrait?: TraitId): TraitId {
  if (participant.pendingRoll?.status === 'pending') return participant.pendingRoll.trait ?? localTrait ?? 'agility';
  return localTrait ?? participant.pendingRoll?.trait ?? 'agility';
}
