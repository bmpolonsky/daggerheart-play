import { test } from 'vitest';
import assert from 'node:assert/strict';
import { FeedService } from '../../src/services/FeedService';
import { feedStore, resetAllStores } from '../../src/stores/gameStores';
import { teamworkParticipantRollTrait } from '../../src/domain/rules/teamwork';
import type { TeamworkRollResult } from '../../src/domain/rules/types';

const first = { actorId: 'one', actorName: 'Первый' };
const second = { actorId: 'two', actorName: 'Второй' };
const third = { actorId: 'three', actorName: 'Третий' };
const result: TeamworkRollResult = { rollId: 'reaction-one', rollType: 'reaction', trait: 'agility', total: 15, difficulty: 12, success: true, note: 'Первый: 15 успех' };

test('editing teamwork roster preserves retained results, pending requests and chosen leader', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestTeamworkRoll({ kind: 'groupAction', participants: [first, second] });
  service.updateTeamworkParticipantRole(entry.id, second.actorId, 'leader');
  service.recordTeamworkParticipantResult(entry.id, first.actorId, result);
  const requested = service.requestTeamworkParticipantRoll(entry.id, second.actorId, 'strength')!;
  const pending = requested.teamwork.participants[1].pendingRoll;
  const updated = service.updateTeamworkRollParticipants(entry.id, [third, first, second])!;
  assert.deepEqual(updated.teamwork.participants.map((participant) => [participant.actorId, participant.role]), [
    ['three', 'support'], ['one', 'support'], ['two', 'leader']
  ]);
  assert.deepEqual(updated.teamwork.participants.find((participant) => participant.actorId === first.actorId)?.result, result);
  assert.deepEqual(updated.teamwork.participants.find((participant) => participant.actorId === second.actorId)?.pendingRoll, pending);

  const leaderRemoved = service.updateTeamworkRollParticipants(entry.id, [third, first])!;
  assert.deepEqual(leaderRemoved.teamwork.participants.map((participant) => [participant.actorId, participant.role]), [['three', 'leader'], ['one', 'support']]);
  assert.deepEqual(leaderRemoved.teamwork.participants[1].result, result);
});

test('teamwork result and finish are idempotent and closed roster cannot reopen', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestTeamworkRoll({ kind: 'groupAction', participants: [first, second] });
  const actionResult = { ...result, rollType: 'action' as const };
  assert.ok(service.recordTeamworkParticipantResult(entry.id, first.actorId, actionResult));
  assert.equal(service.recordTeamworkParticipantResult(entry.id, first.actorId, { ...actionResult, rollId: 'duplicate', total: 1 }), null);
  const completed = service.completeTeamworkRoll(entry.id)!;
  assert.equal(service.completeTeamworkRoll(entry.id), null);
  assert.equal(service.updateTeamworkRollParticipants(entry.id, [third]), null);
  const stored = feedStore.get().find((item) => item.id === entry.id);
  assert.deepEqual(stored, completed);
  assert.deepEqual(completed.teamwork.participants[0].result, actionResult);
});

test('removing the leader clears only the promoted supporter reaction and keeps other support results', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestTeamworkRoll({ kind: 'groupAction', participants: [first, second, third] });
  const promotedReaction = { ...result, rollId: 'reaction-two', note: 'Второй: 15 успех' };
  const retainedReaction = { ...result, rollId: 'reaction-three', note: 'Третий: 15 успех' };
  service.recordTeamworkParticipantResult(entry.id, second.actorId, promotedReaction);
  service.recordTeamworkParticipantResult(entry.id, third.actorId, retainedReaction);
  const changed = service.updateTeamworkRollParticipants(entry.id, [second, third])!;
  assert.equal(changed.teamwork.participants[0].role, 'leader');
  assert.equal(changed.teamwork.participants[0].result, undefined);
  assert.equal(changed.teamwork.participants[0].pendingRoll, undefined);
  assert.equal(changed.teamwork.participants[1].role, 'support');
  assert.deepEqual(changed.teamwork.participants[1].result, retainedReaction);
  assert.equal(service.recordTeamworkParticipantResult(entry.id, second.actorId, promotedReaction), null);
  assert.ok(service.recordTeamworkParticipantResult(entry.id, second.actorId, { ...promotedReaction, rollType: 'action', rollId: 'new-leader-action' }));
});

test('explicit role changes invalidate obsolete results and pending rolls, but unchanged roles keep them', () => {
  resetAllStores();
  const service = new FeedService();
  const entry = service.requestTeamworkRoll({ kind: 'groupAction', participants: [first, second, third] });
  service.requestTeamworkParticipantRoll(entry.id, first.actorId, 'presence');
  service.recordTeamworkParticipantResult(entry.id, second.actorId, { ...result, rollId: 'reaction-two' });
  service.recordTeamworkParticipantResult(entry.id, third.actorId, { ...result, rollId: 'reaction-three' });
  const changed = service.updateTeamworkParticipantRole(entry.id, second.actorId, 'leader')!;
  assert.equal(changed.teamwork.participants[0].role, 'support');
  assert.equal(changed.teamwork.participants[0].pendingRoll, undefined);
  assert.equal(changed.teamwork.participants[1].role, 'leader');
  assert.equal(changed.teamwork.participants[1].result, undefined);
  assert.equal(changed.teamwork.participants[2].result?.rollId, 'reaction-three');
  service.requestTeamworkParticipantRoll(entry.id, second.actorId, 'strength');
  const unchanged = service.updateTeamworkParticipantRole(entry.id, second.actorId, 'leader')!;
  assert.equal(unchanged.teamwork.participants[1].pendingRoll?.trait, 'strength');
  assert.equal(unchanged.teamwork.participants[2].result?.rollId, 'reaction-three');
});

test('pending teamwork approval uses the remote requested trait over a stale GM selection', () => {
  const pending = { trait: 'strength' as const, status: 'pending' as const, requestedAt: '2026-10-25T12:00:00Z' };
  assert.equal(teamworkParticipantRollTrait({ pendingRoll: pending }, 'agility'), 'strength');
  assert.equal(teamworkParticipantRollTrait({ pendingRoll: { ...pending, trait: undefined } }, 'presence'), 'presence');
  assert.equal(teamworkParticipantRollTrait({}, 'presence'), 'presence');
  assert.equal(teamworkParticipantRollTrait({ pendingRoll: { ...pending, status: 'rejected' } }, 'agility'), 'agility');
});
