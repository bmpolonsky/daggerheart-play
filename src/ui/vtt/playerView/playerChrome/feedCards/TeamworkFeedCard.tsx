/** @jsxImportSource preact */
import { Swords, Users } from 'lucide-react';
import { useState } from 'preact/hooks';
import { TRAIT_LABELS, TRAITS } from '../../../../../domain/rules/constants';
import type { TeamworkRollActorOption, TeamworkRollParticipant, TraitId } from '../../../../../domain/rules/types';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { gameService, diceService, feedService, p2pSessionService } from '../../../../../services/serviceRegistry';
import { renderRulesText } from '../../sheetText';
import type { TableViewRole } from '../../types';
import { FeedCardHeader } from './RollFeedCard';

const TEAMWORK_STATUS_LABELS: Record<string, string> = {
  draft: 'Действие',
  collecting: 'Активен',
  resolved: 'Завершён',
  cancelled: 'Отменён'
};

export function TeamworkFeedCard({ actorId, item, role }: { actorId: string | null; item: TableFeedItem; role: TableViewRole }) {
  const teamwork = item.teamwork;
  const [traitsByActor, setTraitsByActor] = useState<Record<string, TraitId>>({});
  if (!teamwork) {
    return (
      <>
        <FeedCardHeader item={item} label={item.kicker} />
        <strong>{item.title}</strong>
        <p>{renderRulesText(item.body)}</p>
      </>
    );
  }
  const isClosed = teamwork.status === 'resolved' || teamwork.status === 'cancelled';
  const selectedIds = new Set(teamwork.participants.map((participant) => participant.actorId));
  const Icon = teamwork.kind === 'groupAction' ? Users : Swords;
  const supportModifier = teamwork.kind === 'groupAction' ? groupActionSupportModifier(teamwork.participants) : 0;

  const toggleParticipant = (actor: TeamworkRollActorOption) => {
    const next = selectedIds.has(actor.actorId)
      ? teamwork.participants.filter((participant) => participant.actorId !== actor.actorId)
      : [...teamwork.participants, actor];
    feedService.updateTeamworkRollParticipants(item.id, next);
  };

  const executeParticipantRoll = (participant: TeamworkRollParticipant, trait: TraitId) => {
    const rollType = participant.role === 'support' ? 'reaction' : 'action';
    const manualModifier = participant.role === 'leader' ? supportModifier : 0;
    const notes = teamwork.kind === 'groupAction'
      ? `${item.title}: ${participant.role === 'leader' ? 'лидер' : 'участник'}`
      : `${item.title}: участник командного броска`;

    const request = {
      actorId: participant.actorId,
      actorName: participant.actorName,
      trait,
      difficulty: teamwork.difficulty,
      manualModifier,
      publication: 'public' as const,
      notes
    };
    const roll = rollType === 'reaction'
      ? diceService.rollReaction(request)
      : diceService.rollAction({
        ...request,
        applyConsequences: gameService.gameStore.getSnapshot().autoApplyRollConsequences
      });
    feedService.recordTeamworkParticipantResult(item.id, participant.actorId, {
      rollId: roll.id,
      rollType: roll.type,
      trait: roll.trait,
      total: roll.total,
      difficulty: roll.difficulty,
      success: roll.success,
      outcome: roll.outcome,
      note: `${roll.actorName}: ${roll.total} ${roll.success ? 'успех' : 'провал'}`
    });
  };

  const rollParticipant = (participant: TeamworkRollParticipant) => {
    const trait = traitsByActor[participant.actorId] ?? participant.pendingRoll?.trait ?? 'agility';
    if (role === 'player' && p2pSessionService.isConnectedPlayerSession()) {
      void p2pSessionService.submitPlayerDecision({
        actorId: participant.actorId,
        actorName: participant.actorName,
        decision: {
          kind: 'teamworkRoll',
          teamworkEntryId: item.id,
          trait
        }
      });
      return;
    }
    executeParticipantRoll(participant, trait);
  };

  return (
    <>
      <FeedCardHeader item={item} label={TEAMWORK_STATUS_LABELS[teamwork.status] ?? item.kicker} />
      <div className="feed-teamwork-card">
        <div className="feed-rest-card__title">
          <Icon size={17} />
          <div>
            <strong>{item.title}</strong>
            <span>Сложность {teamwork.difficulty} · {teamwork.participants.length} участник(а)</span>
          </div>
        </div>
        {teamwork.prompt && <p className="feed-teamwork-card__prompt">{teamwork.prompt}</p>}
        {role === 'gm' && !isClosed && teamwork.availableActors.length > 0 && (
          <div className="feed-teamwork-card__picker" aria-label="Выбор участников">
            {teamwork.availableActors.map((actor) => (
              <button
                className={selectedIds.has(actor.actorId) ? 'dh-is-selected' : ''}
                key={actor.actorId}
                type="button"
                onClick={() => toggleParticipant(actor)}
              >
                {actor.actorName}
              </button>
            ))}
          </div>
        )}
        {teamwork.kind === 'groupAction' && teamwork.participants.length > 1 && (
          <p className="feed-teamwork-card__summary">
            Модификатор лидера от реакций: {supportModifier >= 0 ? '+' : ''}{supportModifier}
          </p>
        )}
        <div className="feed-rest-card__participants">
          {teamwork.participants.length > 0 ? teamwork.participants.map((participant) => {
            const isOwner = role === 'player' && actorId === participant.actorId;
            const hasPendingRoll = participant.pendingRoll?.status === 'pending';
            const canRoll = !isClosed && !participant.result && !hasPendingRoll && (role === 'gm' || isOwner);
            const selectedTrait = traitsByActor[participant.actorId] ?? participant.pendingRoll?.trait ?? 'agility';
            return (
              <div className={`feed-rest-participant ${canRoll ? 'feed-rest-participant--interactive' : ''}`} key={participant.actorId}>
                <div>
                  <Users size={13} />
                  <strong>{participant.actorName}</strong>
                  <span>{participantRoleLabel(participant.role)}</span>
                </div>
                {role === 'gm' && teamwork.kind === 'groupAction' && !isClosed && (
                  <button type="button" onClick={() => feedService.updateTeamworkParticipantRole(item.id, participant.actorId, 'leader')}>
                    Сделать лидером
                  </button>
                )}
                {participant.result ? (
                  <p className="feed-teamwork-card__result">{participant.result.note}</p>
                ) : role === 'gm' && !isClosed && hasPendingRoll ? (
                  <div className="feed-teamwork-card__roll feed-teamwork-card__roll--pending">
                    <span>Игрок просит бросок: {TRAIT_LABELS[selectedTrait]}</span>
                    <button type="button" onClick={() => executeParticipantRoll(participant, selectedTrait)}>
                      Apply
                    </button>
                    <button type="button" onClick={() => feedService.rejectTeamworkParticipantRoll(item.id, participant.actorId)}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="feed-teamwork-card__roll">
                    {canRoll && (
                      <>
                        <select
                          value={selectedTrait}
                          onChange={(event) => setTraitsByActor((current) => ({
                            ...current,
                            [participant.actorId]: (event.currentTarget as HTMLSelectElement).value as TraitId
                          }))}
                        >
                          {TRAITS.map((trait) => <option key={trait.id} value={trait.id}>{trait.label}</option>)}
                        </select>
                        <button type="button" onClick={() => rollParticipant(participant)}>
                          {participant.role === 'support' ? 'Бросок реакции' : 'Бросок действия'}
                        </button>
                      </>
                    )}
                    {!canRoll && <span>{TRAIT_LABELS[selectedTrait]}</span>}
                  </div>
                )}
              </div>
            );
          }) : (
            <p className="feed-rest-card__empty">Мастер выбирает участников на карточке.</p>
          )}
        </div>
        {role === 'gm' && !isClosed && teamwork.participants.some((participant) => participant.result) && (
          <button className="feed-rest-card__resolve" type="button" onClick={() => feedService.completeTeamworkRoll(item.id)}>
            Завершить карточку
          </button>
        )}
      </div>
    </>
  );
}

function participantRoleLabel(role: TeamworkRollParticipant['role']): string {
  if (role === 'leader') return 'лидер';
  if (role === 'support') return 'реакция';
  return 'участник';
}

function groupActionSupportModifier(participants: TeamworkRollParticipant[]): number {
  return participants
    .filter((participant) => participant.role === 'support' && participant.result)
    .reduce((total, participant) => total + (participant.result?.success ? 1 : -1), 0);
}
