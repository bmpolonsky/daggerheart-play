/** @jsxImportSource preact */
import { Flame, HeartPulse, Skull } from 'lucide-react';
import { riskItAllOutcome } from '../../../../../domain/rules/deathMoves';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { characterService, diceService, feedService, p2pSessionService } from '../../../../../services/serviceRegistry';
import { Button } from '../../../../components/common/Button';
import { renderRulesText } from '../../sheetText';
import type { TableViewRole } from '../../types';
import { FeedCardHeader } from './RollFeedCard';

const DEATH_MOVE_STATUS_LABELS: Record<string, string> = {
  pending: 'Выберите предсмертный ход',
  resolved: 'Предсмертный ход завершён',
  cancelled: 'Предсмертный ход отменён'
};

export function DeathMoveFeedCard({ actorId, item, role }: { actorId: string | null; item: TableFeedItem; role: TableViewRole }) {
  const deathMove = item.deathMove;
  if (!deathMove) {
    return (
      <>
        <FeedCardHeader item={item} label={item.kicker} />
        <strong>{item.title}</strong>
        <p>{renderRulesText(item.body)}</p>
      </>
    );
  }

  const isOwner = actorId === deathMove.actor.actorId;
  const connectedPlayer = role === 'player' && p2pSessionService.isConnectedPlayerSession();
  const canChoose = deathMove.status !== 'resolved' && deathMove.status !== 'cancelled' && !deathMove.choice && (
    role === 'gm' || (isOwner && !connectedPlayer)
  );
  const canRequestChoice = deathMove.status !== 'resolved' && deathMove.status !== 'cancelled' && !deathMove.choice && isOwner && connectedPlayer;
  const canApply = role === 'gm' && deathMove.choice && deathMove.status !== 'resolved' && deathMove.status !== 'cancelled';
  const roll = deathMove.roll;

  const resolveBlazeOfGlory = () => {
    if (!deathMove.actor.actorId) return;
    feedService.updateDeathMove(item.id, { status: 'resolved', choice: 'blazeOfGlory' });
  };

  const requestChoice = (choice: 'blazeOfGlory' | 'avoidDeath' | 'riskItAll') => {
    if (!deathMove.actor.actorId) return;
    void p2pSessionService.submitPlayerDecision({
      actorId: deathMove.actor.actorId,
      actorName: deathMove.actor.actorName,
      decision: {
        kind: 'deathMove',
        deathMoveEntryId: item.id,
        choice
      }
    });
  };

  const resolveAvoidDeath = () => {
    if (!deathMove.actor.actorId) return;
    const diceRoll = diceService.rollManualDice({
      actorId: deathMove.actor.actorId,
      actorName: deathMove.actor.actorName,
      formula: '1d12',
      label: 'Избежать смерти',
      diceTones: ['hope'],
      publication: item.publication,
      notes: 'Предсмертный ход'
    });
    const hopeDie = diceResultAt(diceRoll.terms, 0);
    if (!hopeDie) return;
    const result = characterService.chooseAvoidDeath(deathMove.actor.actorId, hopeDie);
    if (!result) return;
    feedService.updateDeathMove(item.id, {
      status: 'resolved',
      choice: 'avoidDeath',
      roll: result
    });
  };

  const startRiskItAll = () => {
    if (!deathMove.actor.actorId) return;
    const diceRoll = diceService.rollManualDice({
      actorId: deathMove.actor.actorId,
      actorName: deathMove.actor.actorName,
      formula: '2d12',
      label: 'Рискнуть всем',
      diceTones: ['hope', 'fear'],
      publication: item.publication,
      notes: 'Предсмертный ход'
    });
    const hopeDie = diceResultAt(diceRoll.terms, 0);
    const fearDie = diceResultAt(diceRoll.terms, 1);
    if (!hopeDie || !fearDie) return;
    const result = characterService.chooseRiskItAll(deathMove.actor.actorId, {
      kind: 'riskItAll',
      hopeDie,
      fearDie,
      outcome: riskItAllOutcome(hopeDie, fearDie)
    });
    if (!result) return;
    feedService.updateDeathMove(item.id, {
      status: 'resolved',
      choice: 'riskItAll',
      roll: result
    });
  };

  const applyPendingChoice = () => {
    if (!deathMove.choice) return;
    if (deathMove.choice === 'blazeOfGlory') {
      resolveBlazeOfGlory();
      return;
    }
    if (deathMove.choice === 'avoidDeath') {
      resolveAvoidDeath();
      return;
    }
    startRiskItAll();
  };

  const rejectPendingChoice = () => {
    feedService.updateDeathMove(item.id, {
      status: 'pending',
      choice: undefined
    });
  };

  return (
    <>
      <FeedCardHeader item={item} label={DEATH_MOVE_STATUS_LABELS[deathMove.status] ?? item.kicker} />
      <div className="feed-death-move-card">
        <div className="feed-rest-card__title">
          <Skull size={17} />
          <div>
            <strong>{deathMove.actor.actorName}</strong>
            <span>Предсмертный ход</span>
          </div>
        </div>
        <p className="feed-death-move-card__summary">{deathMoveSummary(deathMove)}</p>
        {(canChoose || canRequestChoice) && deathMove.status === 'pending' && (
          <div className="feed-death-move-card__actions">
            <Button size="sm" variant="ghost" iconBefore={<Flame size={14} aria-hidden="true" />} type="button" onClick={canRequestChoice ? () => requestChoice('blazeOfGlory') : resolveBlazeOfGlory}>
              Вспышка славы
            </Button>
            <Button size="sm" variant="ghost" iconBefore={<HeartPulse size={14} aria-hidden="true" />} type="button" onClick={canRequestChoice ? () => requestChoice('avoidDeath') : resolveAvoidDeath}>
              Избежать смерти
            </Button>
            <Button size="sm" variant="ghost" iconBefore={<Skull size={14} aria-hidden="true" />} type="button" onClick={canRequestChoice ? () => requestChoice('riskItAll') : startRiskItAll}>
              Рискнуть всем
            </Button>
          </div>
        )}
        {canApply && deathMove.choice && (
          <div className="feed-death-move-card__actions feed-death-move-card__actions--pending">
            <span>Игрок выбрал: {deathMoveChoiceLabel(deathMove.choice)}</span>
            <Button size="sm" variant="primary" type="button" onClick={applyPendingChoice}>Применить</Button>
            <Button size="sm" variant="danger" type="button" onClick={rejectPendingChoice}>Отклонить</Button>
          </div>
        )}
      </div>
    </>
  );
}

function deathMoveChoiceLabel(choice: NonNullable<NonNullable<TableFeedItem['deathMove']>['choice']>): string {
  if (choice === 'blazeOfGlory') return 'Вспышка славы';
  if (choice === 'avoidDeath') return 'Избежать смерти';
  return 'Рискнуть всем';
}

function deathMoveSummary(deathMove: NonNullable<TableFeedItem['deathMove']>): string {
  if (!deathMove.roll) return 'Выберите вспышку славы, попытку избежать смерти или рискнуть всем.';
  if (deathMove.roll.kind === 'avoidDeathHope') {
    return `Избежать смерти: кость Надежды ${deathMove.roll.hopeDie}${deathMove.roll.scarGained ? ', получен шрам.' : '.'}`;
  }
  if (deathMove.roll.outcome === 'critical') return 'Рискнуть всем: критическая Надежда.';
  if (deathMove.roll.outcome === 'fear') return `Рискнуть всем: Страх ${deathMove.roll.fearDie}, персонаж пересекает завесу смерти.`;
  return `Рискнуть всем: Надежда ${deathMove.roll.hopeDie}, Страх ${deathMove.roll.fearDie}.`;
}

function diceResultAt(terms: ReturnType<typeof diceService.rollManualDice>['terms'], index: number): number | null {
  const rolls = terms.flatMap((term) => ('rolls' in term ? term.rolls : []));
  return rolls[index] ?? null;
}
