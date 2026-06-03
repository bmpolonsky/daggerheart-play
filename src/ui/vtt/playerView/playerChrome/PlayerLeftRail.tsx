/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Eye, EyeOff, MessageCircle, Minus, Plus, SendHorizontal, X } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import type { Countdown } from '../../../../domain/rules/types';
import type { PlayerViewCharacterSummary, PlayerViewModel } from '../../../../domain/tabletop/playerView';
import type { TableFeedItem } from '../../../../domain/tabletop/feed';
import { gameService, diceService, encounterService, feedService, p2pSessionService } from '../../../../services/serviceRegistry';
import { PLAYER_DICE_ROLL_ANIMATION_TIMEOUT_MS } from '../constants';
import { runDomainCardMacroAction } from '../domainCards/domainCardMacroActions';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../domainCards/types';
import { currentSettingsInviteContext, feedRollRevealId, revealedRollIdsFromActivity } from '../helpers';
import { playerViewUi$, playerViewUiActions } from '../playerViewUiState';
import { PlayerRollConfirm } from '../PlayerRollConfirm';
import type { PlayerRollDraft, TableViewRole } from '../types';
import {
  unrevealedRollIdsFromCompleted,
  unrevealedRollIdsFromHistoricalActivity,
  waitsForDiceReveal
} from './activityReveal';
import { FeedCard } from './feedCards/FeedCard';
import { gmPlayerSessionText } from './sessionText';

type FeedCardRollDraftState = {
  draft: PlayerRollDraft;
  character: PlayerViewCharacterSummary;
};

export function PlayerLeftRail({
  macroCharacter,
  macroCharacters,
  model,
  role
}: {
  macroCharacter?: PlayerViewCharacterSummary | null;
  macroCharacters?: Record<string, PlayerViewCharacterSummary>;
  model: PlayerViewModel;
  role: TableViewRole;
}) {
  const [message, setMessage] = useState('');
  const [rollDraftState, setRollDraftState] = useState<FeedCardRollDraftState | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const p2pSession = useStream(p2pSessionService.session$);
  const encounter = useStream(encounterService.encounter$);
  const { completedDiceRollIds, ephemeralFeedItem } = useStream(playerViewUi$);
  const [revealedRollIds, setRevealedRollIds] = useState<Set<string>>(() => revealedRollIdsFromActivity(model.activity));
  const mountedAtRef = useRef(Date.now());
  const activityRef = useRef<HTMLDivElement>(null);
  const activity = useMemo(() => {
    if (!ephemeralFeedItem || !canViewEphemeralFeedItem(ephemeralFeedItem, role, model.character?.id ?? null)) return model.activity;
    return [
      ephemeralFeedItem,
      ...model.activity.filter((event) => event.id !== 'feed-empty')
    ];
  }, [ephemeralFeedItem, model.activity, model.character?.id, role]);
  const visibleActivity = useMemo(() => activity.slice().reverse(), [activity]);
  const visibleCountdowns = useMemo(() => encounter.countdowns.filter((countdown) => role === 'gm' || countdown.visibility === 'public'), [encounter.countdowns, role]);
  const hasClearableActivity = activity.some((event) => event.id !== 'feed-empty');

  useEffect(() => {
    activityRef.current?.scrollTo({ top: activityRef.current.scrollHeight });
  }, [visibleActivity.length]);

  useEffect(() => {
    setRevealedRollIds((current) => unrevealedRollIdsFromCompleted(current, completedDiceRollIds) ?? current);
  }, [completedDiceRollIds]);

  useEffect(() => {
    setRevealedRollIds((current) => unrevealedRollIdsFromHistoricalActivity(current, activity, mountedAtRef.current) ?? current);
  }, [activity]);

  useEffect(() => {
    const timeoutIds = visibleActivity
      .filter((event) => waitsForDiceReveal(event) && !revealedRollIds.has(feedRollRevealId(event)))
      .map((event) => window.setTimeout(() => revealRoll(event), PLAYER_DICE_ROLL_ANIMATION_TIMEOUT_MS));
    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [revealedRollIds, visibleActivity]);

  const revealRoll = (event: PlayerViewModel['activity'][number]) => {
    const rollId = feedRollRevealId(event);
    setRevealedRollIds((current) => {
      if (current.has(rollId)) return current;
      const next = new Set(current);
      next.add(rollId);
      return next;
    });
  };

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;
    void p2pSessionService.sendChatMessage(model.character?.name ?? (role === 'gm' ? 'Мастер' : 'Игрок'), text);
    setMessage('');
  };
  const runFeedCardMacro = (card: PlayerViewDomainCard, macro: PlayerViewDomainCardMacro, item: PlayerViewModel['activity'][number]) => {
    const character = role === 'gm' && item.actor?.actorType === 'character' && item.actor.actorId
      ? macroCharacters?.[item.actor.actorId] ?? null
      : macroCharacter ?? null;
    if (!character) return;
    if (role !== 'gm' && item.actor?.actorId && item.actor.actorId !== character.id) return;
    runDomainCardMacroAction(card, macro, {
      character,
      role,
      publication: item.publication,
      sourceLabel: item.feature?.sourceLabel ?? (item.kind === 'feature' ? 'Особенность' : 'Карта'),
      openRollDraft: (draft) => setRollDraftState({ draft, character })
    });
  };
  const copyInvite = async () => {
    const inviteUrl = p2pSessionService.previewInviteUrl(currentSettingsInviteContext());
    if (!inviteUrl) return;
    await navigator.clipboard?.writeText(inviteUrl);
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1600);
  };
  const gmSessionText = gmPlayerSessionText(p2pSession);

  return (
    <aside className="player-left-rail" aria-label="Чат игры">
      {rollDraftState && (
        <PlayerRollConfirm
          character={rollDraftState.character}
          draft={rollDraftState.draft}
          onTraitChange={(trait) => setRollDraftState((current) => current ? { ...current, draft: { ...current.draft, trait } } : current)}
          onClose={() => setRollDraftState(null)}
          onRoll={(rollOptions, rollType, publication) => {
            const rollDraft = rollDraftState.draft;
            const actorId = rollDraftState.character.id;
            const actorName = rollDraftState.character.name;
            if (role === 'player' && p2pSessionService.isConnectedPlayerSession() && actorId) {
              void p2pSessionService.submitPlayerRollIntent({
                actorId,
                actorName,
                publication,
                intent: {
                  type: 'duality',
                  rollType,
                  trait: rollDraft.trait,
                  difficulty: 'difficulty' in rollDraft ? rollDraft.difficulty ?? 0 : 0,
                  ...rollOptions,
                  notes: 'notes' in rollDraft ? rollDraft.notes : undefined
                }
              });
              setRollDraftState(null);
              return;
            }
            const rollRequest = {
              actorId,
              actorName,
              trait: rollDraft.trait,
              difficulty: 'difficulty' in rollDraft ? rollDraft.difficulty ?? 0 : 0,
              ...rollOptions,
              publication,
              notes: 'notes' in rollDraft ? rollDraft.notes : undefined
            };
            if (rollType === 'reaction') {
              diceService.rollReaction(rollRequest);
            } else {
              diceService.rollAction({
                ...rollRequest,
                applyConsequences: gameService.game$.get().autoApplyRollConsequences
              });
            }
            setRollDraftState(null);
          }}
        />
      )}
      <section className={`player-activity-card player-activity-card--airy ${role === 'gm' ? 'player-activity-card--gm' : ''}`}>
        <header className="player-activity-header">
          <MessageCircle size={16} />
          <span>Игра</span>
          {role === 'gm' && hasClearableActivity ? (
            <button className="player-activity-clear" type="button" onClick={() => { feedService.clear(); playerViewUiActions.setEphemeralFeedItem(null); }}>Очистить</button>
          ) : (
            <span className="player-activity-clear player-activity-clear--placeholder" aria-hidden="true">Очистить</span>
          )}
        </header>
        {role === 'gm' && (
          <div className="player-activity-session">
            <span>{gmSessionText}</span>
            <button type="button" disabled={!p2pSession.roomId} onClick={() => void copyInvite()}>
              {inviteCopied ? 'Скопировано' : 'Ссылка'}
            </button>
          </div>
        )}
        {visibleCountdowns.length > 0 && (
          <div className="player-countdown-stack" aria-label="Отсчеты">
            {visibleCountdowns.map((countdown) => (
              <CountdownCard countdown={countdown} key={countdown.id} role={role} />
            ))}
          </div>
        )}
        <div className={`player-activity-list ${visibleActivity.length === 0 ? 'player-activity-list--empty' : ''}`} ref={activityRef}>
          {visibleActivity.map((event) => {
            const waitingForDice = waitsForDiceReveal(event) && !revealedRollIds.has(feedRollRevealId(event));
            const canRemoveEvent = (role === 'gm' || event.ephemeral) && event.id !== 'feed-empty';
            const eventClassName = [
              'player-activity-event',
              `player-activity-event--${event.kind}`,
              `player-activity-event--${event.tone}`,
              event.id === 'feed-empty' ? 'player-activity-event--empty' : '',
              event.ephemeral ? 'player-activity-event--ephemeral' : '',
              canRemoveEvent ? 'player-activity-event--removable' : '',
              waitingForDice ? 'dh-is-rolling' : ''
              ].filter(Boolean).join(' ');
            return (
              <article className={eventClassName} key={event.id}>
                {canRemoveEvent && (
                  <button
                    className="player-activity-event__delete"
                    type="button"
                    aria-label={event.ephemeral ? `Закрыть ${event.title}` : `Удалить событие ${event.title}`}
                    title={event.ephemeral ? 'Закрыть' : 'Удалить'}
                    onClick={() => event.ephemeral ? playerViewUiActions.setEphemeralFeedItem(null) : feedService.remove(event.id)}
                  >
                    ×
                  </button>
                )}
                <FeedCard
                  item={event}
                  waitingForDice={waitingForDice}
                  role={role}
                  actorId={model.character?.id ?? null}
                  onRevealToPublic={(item) => feedService.revealToPublic(item.id)}
                  onDomainCardMacro={runFeedCardMacro}
                />
              </article>
            );
          })}
        </div>
        <form className="player-chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <input aria-label="Сообщение игрока" value={message} onInput={(event) => setMessage(event.currentTarget.value)} placeholder={`Сообщение от ${model.character?.name ?? (role === 'gm' ? 'Мастера' : 'игрока')}`} />
          <button type="submit" disabled={!message.trim()} aria-label="Отправить сообщение" title="Отправить сообщение">
            <SendHorizontal size={15} />
          </button>
        </form>
      </section>
    </aside>
  );
}

function canViewEphemeralFeedItem(item: TableFeedItem, role: TableViewRole, actorId: string | null): boolean {
  if (role === 'gm' || item.publication === 'public') return true;
  if (item.publication === 'gm') return false;
  return Boolean(actorId && item.actor?.actorId === actorId);
}

function CountdownCard({ countdown, role }: { countdown: Countdown; role: TableViewRole }) {
  const filled = Math.max(0, Math.min(countdown.max, countdown.current));
  return (
    <article className={`player-countdown-card ${countdown.visibility === 'gm' ? 'dh-is-private' : ''}`}>
      <header>
        {role === 'gm' ? (
          <input
            aria-label="Название отсчета"
            value={countdown.name}
            onInput={(event) => encounterService.updateCountdown(countdown.id, { name: event.currentTarget.value })}
          />
        ) : (
          <strong>{countdown.name}</strong>
        )}
        {role === 'gm' && (
          <button type="button" title="Удалить отсчет" aria-label={`Удалить отсчет ${countdown.name}`} onClick={() => encounterService.removeCountdown(countdown.id)}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="player-countdown-card__pips" aria-label={`${filled} из ${countdown.max}`}>
        {Array.from({ length: countdown.max }, (_, index) => (
          <i className={index < filled ? 'dh-is-filled' : ''} key={index} />
        ))}
      </div>
      <footer>
        <span>{countdown.current}/{countdown.max}</span>
        {role === 'gm' && (
          <div className="player-countdown-card__controls">
            <button type="button" title="Назад" onClick={() => encounterService.tickCountdown(countdown.id, -1)}>
              <Minus size={13} aria-hidden="true" />
            </button>
            <button type="button" title="Вперед" onClick={() => encounterService.tickCountdown(countdown.id, 1)}>
              <Plus size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              title={countdown.visibility === 'public' ? 'Скрыть от игроков' : 'Показать игрокам'}
              onClick={() => encounterService.updateCountdown(countdown.id, { visibility: countdown.visibility === 'public' ? 'gm' : 'public' })}
            >
              {countdown.visibility === 'public' ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
