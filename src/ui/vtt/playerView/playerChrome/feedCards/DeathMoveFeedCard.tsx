/** @jsxImportSource preact */
import { Flame, HeartPulse, Skull } from 'lucide-react';
import { useState } from 'preact/hooks';
import { rollHopeDie, rollRiskItAll } from '../../../../../domain/rules/deathMoves';
import type { TableFeedItem } from '../../../../../domain/tabletop/feed';
import { characterService, feedService, p2pSessionService } from '../../../../../services/serviceRegistry';
import type { TableViewRole } from '../../types';
import { FeedCardHeader } from './RollFeedCard';

const DEATH_MOVE_STATUS_LABELS: Record<string, string> = {
  pending: 'Выберите предсмертный ход',
  allocating: 'Распределите восстановление',
  resolved: 'Предсмертный ход завершён',
  cancelled: 'Предсмертный ход отменён'
};

export function DeathMoveFeedCard({ actorId, item, role }: { actorId: string | null; item: TableFeedItem; role: TableViewRole }) {
  const deathMove = item.deathMove;
  const [allocation, setAllocation] = useState({ hpCleared: 0, stressCleared: 0 });
  if (!deathMove) {
    return (
      <>
        <FeedCardHeader item={item} label={item.kicker} />
        <strong>{item.title}</strong>
        <p>{item.body}</p>
      </>
    );
  }

  const isOwner = actorId === deathMove.actor.actorId;
  const connectedPlayer = role === 'player' && p2pSessionService.isConnectedPlayerSession();
  const canChoose = deathMove.status !== 'resolved' && deathMove.status !== 'cancelled' && !deathMove.choice && (
    role === 'gm' || (isOwner && !connectedPlayer)
  );
  const canRequestChoice = deathMove.status !== 'resolved' && deathMove.status !== 'cancelled' && !deathMove.choice && isOwner && connectedPlayer;
  const canApply = role === 'gm' && deathMove.choice && deathMove.status !== 'resolved' && deathMove.status !== 'cancelled' && (
    deathMove.status !== 'allocating' || Boolean(deathMove.allocation)
  );
  const character = deathMove.actor.actorId ? characterService.getCharacter(deathMove.actor.actorId) : null;
  const roll = deathMove.roll;
  const allocationBudget = roll?.kind === 'riskItAll' && roll.outcome === 'hope' ? roll.hopeDie : 0;
  const availableToClear = Math.min(allocationBudget, (character?.hp.marked ?? 0) + (character?.stress.marked ?? 0));
  const hpCleared = Math.max(0, Math.min(allocation.hpCleared, allocationBudget));
  const stressCleared = Math.max(0, Math.min(allocation.stressCleared, allocationBudget - hpCleared));
  const remainingAllocation = Math.max(0, availableToClear - hpCleared - stressCleared);

  const resolveBlazeOfGlory = () => {
    if (!deathMove.actor.actorId) return;
    characterService.chooseBlazeOfGlory(deathMove.actor.actorId, 'Выбрана вспышка славы.');
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
    const result = characterService.chooseAvoidDeath(deathMove.actor.actorId, rollHopeDie(), 'Выбрано избежать смерти.');
    const updated = characterService.getCharacter(deathMove.actor.actorId);
    if (!result) return;
    feedService.updateDeathMove(item.id, {
      status: 'resolved',
      choice: 'avoidDeath',
      roll: result,
      retirement: updated?.retirement ?? null
    });
  };

  const startRiskItAll = () => {
    if (!deathMove.actor.actorId) return;
    const result = characterService.chooseRiskItAll(deathMove.actor.actorId, rollRiskItAll(), 'Выбрано рискнуть всем.');
    const updated = characterService.getCharacter(deathMove.actor.actorId);
    if (!result) return;
    feedService.updateDeathMove(item.id, {
      status: result.outcome === 'hope' ? 'allocating' : 'resolved',
      choice: 'riskItAll',
      roll: result,
      retirement: updated?.retirement ?? null
    });
  };

  const applyAllocation = () => {
    if (!deathMove.actor.actorId || allocationBudget <= 0 || remainingAllocation > 0) return;
    const applied = characterService.resolveRiskItAllAllocation(deathMove.actor.actorId, hpCleared, stressCleared);
    if (!applied) return;
    feedService.updateDeathMove(item.id, {
      status: 'resolved',
      choice: 'riskItAll',
      roll: { ...roll!, hpCleared, stressCleared },
      allocation: { hpCleared, stressCleared }
    });
  };

  const requestAllocation = () => {
    if (!deathMove.actor.actorId || remainingAllocation > 0 || deathMove.choice !== 'riskItAll') return;
    void p2pSessionService.submitPlayerDecision({
      actorId: deathMove.actor.actorId,
      actorName: deathMove.actor.actorName,
      decision: {
        kind: 'deathMove',
        deathMoveEntryId: item.id,
        choice: 'riskItAll',
        allocation: { hpCleared, stressCleared }
      }
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
    if (deathMove.status === 'allocating' && deathMove.allocation) {
      const applied = characterService.resolveRiskItAllAllocation(deathMove.actor.actorId ?? '', deathMove.allocation.hpCleared, deathMove.allocation.stressCleared);
      if (applied) {
        feedService.updateDeathMove(item.id, {
          status: 'resolved',
          choice: 'riskItAll',
          roll: roll ? { ...roll, ...deathMove.allocation } : roll,
          allocation: deathMove.allocation
        });
      }
      return;
    }
    startRiskItAll();
  };

  const rejectPendingChoice = () => {
    feedService.updateDeathMove(item.id, {
      status: deathMove.status === 'allocating' ? 'allocating' : 'pending',
      choice: deathMove.status === 'allocating' ? 'riskItAll' : undefined,
      allocation: undefined
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
            <button type="button" onClick={canRequestChoice ? () => requestChoice('blazeOfGlory') : resolveBlazeOfGlory}>
              <Flame size={14} /> Вспышка славы
            </button>
            <button type="button" onClick={canRequestChoice ? () => requestChoice('avoidDeath') : resolveAvoidDeath}>
              <HeartPulse size={14} /> Избежать смерти
            </button>
            <button type="button" onClick={canRequestChoice ? () => requestChoice('riskItAll') : startRiskItAll}>
              <Skull size={14} /> Рискнуть всем
            </button>
          </div>
        )}
        {canApply && deathMove.choice && (
          <div className="feed-death-move-card__actions feed-death-move-card__actions--pending">
            <span>Игрок выбрал: {deathMoveChoiceLabel(deathMove.choice)}</span>
            <button type="button" onClick={applyPendingChoice}>Применить</button>
            <button type="button" onClick={rejectPendingChoice}>Отклонить</button>
          </div>
        )}
        {deathMove.status === 'allocating' && roll?.kind === 'riskItAll' && roll.outcome === 'hope' && (
          <div className="feed-death-move-card__allocation">
            <p>Кость Надежды: {roll.hopeDie}. Осталось распределить: {remainingAllocation}.</p>
            <label>
              Раны
              <input
                min={0}
                max={Math.min(allocationBudget, character?.hp.marked ?? allocationBudget)}
                type="number"
                value={hpCleared}
                onInput={(event) => setAllocation((current) => ({
                  ...current,
                  hpCleared: Number((event.currentTarget as HTMLInputElement).value)
                }))}
              />
            </label>
            <label>
              Стресс
              <input
                min={0}
                max={Math.min(allocationBudget - hpCleared, character?.stress.marked ?? allocationBudget)}
                type="number"
                value={stressCleared}
                onInput={(event) => setAllocation((current) => ({
                  ...current,
                  stressCleared: Number((event.currentTarget as HTMLInputElement).value)
                }))}
              />
            </label>
            {role === 'gm' && !deathMove.allocation && (
              <button type="button" disabled={remainingAllocation > 0} onClick={applyAllocation}>
                Применить
              </button>
            )}
            {isOwner && connectedPlayer && !deathMove.allocation && (
              <button type="button" disabled={remainingAllocation > 0} onClick={requestAllocation}>
                Отправить мастеру
              </button>
            )}
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
  if (deathMove.roll.outcome === 'critical') return 'Рискнуть всем: критическая Надежда, очищены раны и стресс.';
  if (deathMove.roll.outcome === 'fear') return `Рискнуть всем: Страх ${deathMove.roll.fearDie}, персонаж пересекает завесу смерти.`;
  return `Рискнуть всем: Надежда ${deathMove.roll.hopeDie}, Страх ${deathMove.roll.fearDie}.`;
}
