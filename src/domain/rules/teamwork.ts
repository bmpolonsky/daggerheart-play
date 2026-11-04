import type { TeamworkRollParticipant, TeamworkRollRequest, TeamworkRollResult, TraitId } from './types';
import { actionOutcomeLabel } from './rollPresentation';

export function isSharedTagTeam(teamwork: TeamworkRollRequest): boolean {
  return teamwork.kind === 'tagTeam' && teamwork.tagTeamMode === 'shared';
}

/** A repeated feed delivery cannot erase an accepted candidate or final choice. */
export function retainAcceptedTagTeam(previous: TeamworkRollRequest, incoming: TeamworkRollRequest): TeamworkRollRequest {
  if (!isSharedTagTeam(previous)) return incoming;
  if (!isSharedTagTeam(incoming) || previous.status === 'resolved' || previous.status === 'cancelled') return previous;
  const fingerprint = (result: TeamworkRollResult | undefined) => result ? JSON.stringify([
    result.rollId, result.rollType, result.total, result.difficulty, result.success, result.outcome, result.trait, result.consequencesApplied ?? false
  ]) : '';
  if (previous.participants.some(actor => actor.result && fingerprint(actor.result) !== fingerprint(incoming.participants.find(next => next.actorId === actor.actorId)?.result))) return previous;
  return incoming;
}

export function tagTeamReadyForSelection(teamwork: TeamworkRollRequest): boolean {
  return isSharedTagTeam(teamwork) && !teamwork.sharedResult && teamwork.status !== 'resolved' && teamwork.status !== 'cancelled'
    && teamwork.participants.length === 2 && teamwork.participants.every(participant => Boolean(participant.result));
}

export function tagTeamResultSummary(teamwork: TeamworkRollRequest): string {
  const selected = teamwork.sharedResult;
  if (!selected) return '';
  const result = selected.result;
  const outcome = result.outcome ? actionOutcomeLabel(result.outcome) : result.success ? 'Успех, ручной итог' : 'Провал, ручной итог';
  const consequence = selected.consequences === 'manual' ? 'Последствия — вручную.'
    : result.outcome === 'criticalSuccess' ? '+1 Надежды и −1 Стресс каждому.'
    : result.outcome?.endsWith('Hope') ? '+1 Надежды каждому.' : '+2 Страха мастеру.';
  return `Для команды: ${selected.actorName}, ${result.total} — ${outcome}. ${consequence}`;
}

export function teamworkParticipantRoleRevision(participant: Pick<TeamworkRollParticipant, 'roleRevision'>): number {
  const value = participant.roleRevision;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** An approval executes the player's submitted trait, not the GM's stale draft. */
export function teamworkParticipantRollTrait(participant: Pick<TeamworkRollParticipant, 'pendingRoll'>, localTrait?: TraitId): TraitId {
  if (participant.pendingRoll?.status === 'pending') return participant.pendingRoll.trait ?? localTrait ?? 'agility';
  return localTrait ?? participant.pendingRoll?.trait ?? 'agility';
}
