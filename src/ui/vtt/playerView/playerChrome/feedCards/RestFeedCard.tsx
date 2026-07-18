/** @jsxImportSource preact */
import { Bed, CheckSquare, Coffee, RotateCcw } from 'lucide-react';
import { canApplyRestChoice, canSelectRestChoices } from '../../../../../domain/rules/rest';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { feedService, p2pSessionService, tabletopService } from '../../../../../services/serviceRegistry';
import { Button } from '../../../../components/common/Button';
import { IconButton } from '../../../../components/common/IconButton';
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
  const isClosed = rest.status === 'resolved' || rest.status === 'cancelled';
  const canResolve = role === 'gm' && !isClosed;
  const applyRestChoice = (actorId: string, choiceId: string) => {
    tabletopService.resolveRestMove(item.id, actorId, choiceId);
  };
  const completeRest = () => {
    const plan = tabletopService.conductRest(rest.restType, { pcCount: rest.participants.length });
    feedService.completeRest(item.id, plan);
  };
  return (
    <>
      <FeedCardHeader item={item} label={REST_STATUS_LABELS[rest.status] ?? item.kicker} />
      <div className="feed-rest-card">
        <div className="feed-rest-card__title">
          <Icon size={17} />
          <div>
            <strong>{item.title}</strong>
            <span>{readyCount}/{rest.participants.length} готовы — до {rest.maxChoicesPerParticipant} выборов</span>
          </div>
        </div>
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
              const updateChoices = (choices: string[]) => {
                void p2pSessionService.updateRestParticipantChoices(item.id, participant.actorId, choices);
              };
              return (
                <div className={`feed-rest-participant ${canSelectChoices ? 'feed-rest-participant--interactive' : ''}`} key={participant.actorId}>
                  <div className="feed-rest-participant__header">
                    <CheckSquare size={13} />
                    <strong>{participant.actorName}</strong>
                    <span>{participant.ready ? 'готов' : `${selectedCount}/${rest.maxChoicesPerParticipant}`}</span>
                    {canSelectChoices && selectedCount > 0 && (
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
                  <RestMoveList
                    moves={rest.availableMoves}
                    choices={participant.choices}
                    selectedLabels={expandedChoices}
                    maxChoices={rest.maxChoicesPerParticipant}
                    canSelect={canSelectChoices}
                    showAvailable={showAvailableChoices}
                    canApply={canApplyChoice}
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
  onChange: (choices: string[]) => void;
  onApply: (choiceId: string) => void;
}) {
  const labels = showAvailable ? mergeRestMoveLabels(moves, choices) : selectedRestChoiceLabels(choices);
  if (labels.length === 0) {
    return <p className="feed-rest-card__empty">Ходы ещё не выбраны.</p>;
  }
  const selectedCount = selectedLabels.length;
  return (
    <div className="feed-rest-picker" aria-label="Ходы отдыха">
      <div className="feed-rest-moves">
        {labels.map((label) => {
          const count = selectedLabels.filter((choice) => choice === label).length;
          const selectedChoice = choices.find((choice) => choice.label === label);
          const pendingChoice = choices.find((choice) => choice.label === label && choice.status !== 'resolved');
          const canAdd = canSelect && selectedCount < maxChoices;
          return (
            <div className="feed-rest-move" key={label}>
              <Button
                className="feed-rest-move__select"
                variant={count > 0 ? 'primary' : 'ghost'}
                size="sm"
                disabled={!canAdd && count === 0}
                type="button"
                onClick={() => {
                  if (!canAdd) return;
                  onChange([...selectedLabels, label]);
                }}
              >
                <span>{label}</span>
                {count > 0 && <b>×{count}</b>}
              </Button>
              {canSelect && count > 0 && (
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
                  {pendingChoice.label.includes('1d4') ? 'Бросить' : 'Применить'}
                </Button>
              )}
              {selectedChoice?.result && <small>{selectedChoice.result.note}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mergeRestMoveLabels(moves: string[], choices: RestChoice[]): string[] {
  const labels = [...moves];
  choices.forEach((choice) => {
    if (!labels.includes(choice.label)) labels.push(choice.label);
  });
  return labels;
}

function selectedRestChoiceLabels(choices: RestChoice[]): string[] {
  const labels: string[] = [];
  choices.forEach((choice) => {
    if (!labels.includes(choice.label)) labels.push(choice.label);
  });
  return labels;
}

function removeOneRestChoice(choices: string[], label: string): string[] {
  const index = choices.lastIndexOf(label);
  if (index < 0) return choices;
  return choices.filter((_choice, choiceIndex) => choiceIndex !== index);
}

function expandRestChoices(choices: RestChoice[]): string[] {
  return choices.flatMap((choice) => Array.from({ length: Math.max(0, Math.trunc(choice.count)) }, () => choice.label));
}
