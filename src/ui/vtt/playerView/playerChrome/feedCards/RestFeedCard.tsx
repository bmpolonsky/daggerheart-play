/** @jsxImportSource preact */
import { unifiedRollDraftService } from '../../../../../services/UnifiedRollDraftService';
import { toastService } from '../../../../../services/ToastService';
import { Bed, CheckSquare, Coffee, RotateCcw } from 'lucide-react';
import { canApplyRestChoice, canSelectRestChoices, restMoveLabels, restMoveRequiresRoll, restProgress, restRemainingSummary } from '../../../../../domain/rules/rest';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { eventRollService, p2pSessionService, tabletopService } from '../../../../../services/serviceRegistry';
import { Button } from '../../../../components/common/Button';
import { IconButton } from '../../../../components/common/IconButton';
import { Notice } from '../../../../components/common';
import { renderRulesText } from '../../sheetText';
import type { TableViewRole } from '../../types';
import { FeedCardHeader } from './RollFeedCard';

type RestRequest = NonNullable<TableFeedItem['rest']>;
type RestParticipant = RestRequest['participants'][number];
type RestChoice = RestParticipant['choices'][number];

const REST_STATUS_LABELS: Record<string, string> = {
  requested: 'Активен',
  collecting: 'Активен',
  resolved: 'Завершён',
  cancelled: 'Отменён'
};

export function RestFeedCard({ actorId, item, role }: { actorId: string | null; item: TableFeedItem; role: TableViewRole }) {
  const rest = item.rest;
  if (!rest) {
    return (
      <>
        <FeedCardHeader item={item} label={item.kicker} />
        <strong>{item.title}</strong>
        <p>{renderRulesText(item.body)}</p>
      </>
    );
  }
  const Icon = rest.restType === 'short' ? Coffee : Bed;
  const readyCount = rest.participants.filter((participant) => participant.ready).length;
  const choiceLimits = Array.from(new Set(rest.participants.map((participant) => participant.maxChoices ?? rest.maxChoicesPerParticipant)));
  const choiceLimitLabel = choiceLimits.length === 1 ? `выборов: ${choiceLimits[0]}` : 'лимит указан у каждого';
  const isClosed = rest.status === 'resolved' || rest.status === 'cancelled';
  const canResolve = role === 'gm' && !isClosed;
  const progress = restProgress(rest);
  const connectedPlayerSession = p2pSessionService.isConnectedPlayerSession();
  const applyRestChoice = (actorId: string, choiceId: string) => {
    const choice = rest.participants.find((participant) => participant.actorId === actorId)?.choices.find((choice) => choice.id === choiceId);
    if (choice && restMoveRequiresRoll(choice.label)) {
      const prepared = eventRollService.prepare({ kind: 'rest', entryId: item.id, actorId, choiceId }, role);
      if (prepared.ok) unifiedRollDraftService.request(prepared.input);
      else toastService.show(prepared.error, 'error');
      return;
    }
    tabletopService.resolveRestMove(item.id, actorId, choiceId);
  };
  const completeRest = () => {
    tabletopService.completeRest(item.id);
  };
  return (
    <>
      <FeedCardHeader item={item} label={REST_STATUS_LABELS[rest.status] ?? item.kicker} />
      <div className="feed-rest-card">
        <div className="feed-rest-card__title">
          <Icon size={17} />
          <div>
            <strong>{item.title}</strong>
            <span>{readyCount}/{rest.participants.length} выбрали ходы — {choiceLimitLabel}</span>
          </div>
        </div>
        {!isClosed && <p className="feed-rest-card__rule-note">{role === 'gm'
          ? 'Игроки выбирают ходы; мастер может выбрать за них. Мастер бросает, применяет результаты и завершает отдых.'
          : connectedPlayerSession
            ? 'Вы выбираете ходы своего персонажа. Мастер бросает, применяет результаты и завершает отдых.'
            : 'Вы выбираете и применяете ходы своего персонажа. Завершает отдых мастер.'}</p>}
        <Notice tone={progress.remainingCount > 0 ? 'warning' : 'success'}>
          {`${restRemainingSummary(rest)}${canResolve && progress.remainingCount > 0 ? ' Можно завершить отдых сейчас; оставшиеся ходы не будут применены автоматически.' : ''}`}
        </Notice>
        {rest.participants.length > 0 ? (
          <div className="feed-rest-card__participants">
            {rest.participants.map((participant) => {
              const isOwner = role === 'player' && actorId === participant.actorId;
              const canSelectChoices = canSelectRestChoices({ role, isOwner, isClosed });
              const showAvailableChoices = !participant.ready && canSelectChoices;
              const canApplyChoice = canApplyRestChoice({
                role,
                isOwner,
                isClosed,
                connectedPlayerSession: p2pSessionService.isConnectedPlayerSession()
              });
              const expandedChoices = expandRestChoices(participant.choices);
              const selectedCount = expandedChoices.length;
              const maxChoices = participant.maxChoices ?? rest.maxChoicesPerParticipant;
              const updateChoices = (choices: string[]) => {
                void p2pSessionService.updateRestParticipantChoices(item.id, participant.actorId, choices);
              };
              return (
                <div className={`feed-rest-participant ${canSelectChoices ? 'feed-rest-participant--interactive' : ''}`} key={participant.actorId}>
                  <div className="feed-rest-participant__header">
                    <CheckSquare size={13} />
                    <strong>{participant.actorName}</strong>
                    <span>{participant.ready ? 'выбор завершён' : `${selectedCount}/${maxChoices}`}</span>
                    {canSelectChoices && participant.choices.some((choice) => choice.status !== 'resolved') && (
                      <IconButton
                        className="feed-rest-participant__reset"
                        variant="ghost"
                        size="xs"
                        type="button"
                        aria-label={`Сбросить выбор отдыха: ${participant.actorName}`}
                        onClick={() => updateChoices([])}
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                      </IconButton>
                    )}
                  </div>
                  <p className="feed-rest-card__rule-note">
                    Выбрано: {selectedCount}/{maxChoices}. С результатом: {progress.participants.find((item) => item.actorId === participant.actorId)?.appliedCount ?? 0}.
                    {isClosed && selectedCount < maxChoices && ` Не выбрано: ${maxChoices - selectedCount}.`}
                  </p>
                  {participant.ruleNotes && participant.ruleNotes.length > 0 && (
                    <p className="feed-rest-card__rule-note" title={participant.ruleNotes.join('\n')}>
                      {participant.ruleNotes.join(' — ')}
                    </p>
                  )}
                  <RestMoveList
                    moves={participant.availableMoves ?? rest.availableMoves}
                    choices={participant.choices}
                    selectedLabels={expandedChoices}
                    maxChoices={maxChoices}
                    canSelect={canSelectChoices}
                    showAvailable={showAvailableChoices}
                    canApply={canApplyChoice}
                    isClosed={isClosed}
                    onChange={updateChoices}
                    onApply={(choiceId) => applyRestChoice(participant.actorId, choiceId)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="feed-rest-card__empty">{renderRulesText(item.body)}</p>
        )}
        {rest.fearPlan && (
          <p className="feed-rest-card__result">
            Страх: {rest.fearPlan.formula} = {rest.fearPlan.total}
          </p>
        )}
        {canResolve && (
          <Button fullWidth size="lg" variant="primary" type="button" onClick={completeRest}>
            Получить страх и завершить
          </Button>
        )}
      </div>
    </>
  );
}

function RestMoveList({
  moves,
  choices,
  selectedLabels,
  maxChoices,
  canSelect,
  showAvailable,
  canApply,
  isClosed,
  onChange,
  onApply
}: {
  moves: string[];
  choices: RestChoice[];
  selectedLabels: string[];
  maxChoices: number;
  canSelect: boolean;
  showAvailable: boolean;
  canApply: boolean;
  isClosed: boolean;
  onChange: (choices: string[]) => void;
  onApply: (choiceId: string) => void;
}) {
  const labels = restMoveLabels(moves, choices, showAvailable);
  if (labels.length === 0) {
    return <p className="feed-rest-card__empty">{isClosed ? 'Ходы не были выбраны.' : 'Ходы ещё не выбраны.'}</p>;
  }
  const selectedCount = selectedLabels.length;
  return (
    <div className="feed-rest-picker" aria-label="Ходы отдыха">
      <div className="feed-rest-moves">
        {labels.map((label) => {
          const count = selectedLabels.filter((choice) => choice === label).length;
          const pendingChoice = choices.find((choice) => choice.label === label && choice.status !== 'resolved');
          const canAdd = canSelect && selectedCount < maxChoices;
          return (
            <div className="feed-rest-move" key={label}>
              <Button
                className="feed-rest-move__select"
                variant={count > 0 ? 'primary' : 'ghost'}
                size="sm"
                disabled={!canAdd}
                type="button"
                onClick={() => {
                  if (!canAdd) return;
                  onChange([...selectedLabels, label]);
                }}
              >
                <span>{label}</span>
                {count > 0 && <b>×{count}</b>}
              </Button>
              {canSelect && pendingChoice && count > 0 && (
                <IconButton
                  className="feed-rest-move__remove"
                  variant="ghost"
                  size="xs"
                  type="button"
                  aria-label={`Убрать ${label}`}
                  onClick={() => onChange(removeOneRestChoice(selectedLabels, label))}
                >
                  ×
                </IconButton>
              )}
              {canApply && pendingChoice && (
                <Button className="feed-rest-move__apply" variant="primary" size="sm" type="button" onClick={() => onApply(pendingChoice.id)}>
                  {restMoveRequiresRoll(pendingChoice.label) ? 'Бросить' : 'Применить'}
                </Button>
              )}
              {choices.filter((choice) => choice.label === label).map((choice) => (
                <small key={choice.id}>{choice.result && choice.status === 'resolved'
                  ? `Подтверждено ×${choice.count}: ${choice.result.note}`
                  : choice.status === 'resolved'
                    ? `Нет записанного результата ×${choice.count}.`
                    : isClosed
                      ? `Не применено при завершении ×${choice.count}.`
                      : restMoveRequiresRoll(choice.label)
                        ? `Ожидает броска ×${choice.count}.`
                        : `Ожидает применения ×${choice.count}.`}</small>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function removeOneRestChoice(choices: string[], label: string): string[] {
  const index = choices.lastIndexOf(label);
  if (index < 0) return choices;
  return choices.filter((_choice, choiceIndex) => choiceIndex !== index);
}

function expandRestChoices(choices: RestChoice[]): string[] {
  return choices.flatMap((choice) => Array.from({ length: Math.max(0, Math.trunc(choice.count)) }, () => choice.label));
}
