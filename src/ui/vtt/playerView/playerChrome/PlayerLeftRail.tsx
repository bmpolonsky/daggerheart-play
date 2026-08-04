/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, Copy, Eye, EyeOff, LibraryBig, Minus, Plus, SendHorizontal, Trash2, X } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import type { Countdown } from '../../../../domain/rules/types';
import type { PlayerViewCharacterSummary, PlayerViewModel } from '../../../../domain/tabletop/playerView';
import type { TableFeedItem } from '../../../../domain/tabletop/feed';
import { gameService, diceService, encounterService, feedService, p2pSessionService } from '../../../../services/serviceRegistry';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { EmptyState } from '../../../components/common/EmptyState';
import { IconButton } from '../../../components/common/IconButton';
import { TextControl } from '../../../components/common/Field';
import { PLAYER_ROLL_FEED_REVEAL_DELAY_MS } from '../constants';
import { P2PHealthIndicator } from '../../../p2p/P2PHealthIndicator';
import { runDomainCardMacroAction } from '../domainCards/domainCardMacroActions';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../domainCards/types';
import { currentSettingsInviteContext, feedRollRevealId, revealedRollIdsFromActivity } from '../helpers';
import { playerViewUi$, playerViewUiActions } from '../playerViewUiState';
import { PlayerRollConfirm } from '../PlayerRollConfirm';
import type { PlayerRollDraft, SharedToolsTab, TableViewRole } from '../types';
import { PlayerRailTabs } from '../PlayerRailTabs';
import { delaysRollResult, unrevealedRollIdsFromHistoricalActivity } from './activityReveal';
import { FeedCard } from './feedCards/FeedCard';

type FeedCardRollDraftState = {
  draft: PlayerRollDraft;
  character: PlayerViewCharacterSummary;
};

export function PlayerLeftRail({
  accessible,
  macroCharacter,
  macroCharacters,
  model,
  role,
  onOpenTool
}: {
  accessible: boolean;
  macroCharacter?: PlayerViewCharacterSummary | null;
  macroCharacters?: Record<string, PlayerViewCharacterSummary>;
  model: PlayerViewModel;
  role: TableViewRole;
  onOpenTool: (tab: SharedToolsTab) => void;
}) {
  const [message, setMessage] = useState('');
  const [rollDraftState, setRollDraftState] = useState<FeedCardRollDraftState | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [clearChronicleOpen, setClearChronicleOpen] = useState(false);
  const p2pSession = useStream(p2pSessionService.session$);
  const encounter = useStream(encounterService.encounter$);
  const { ephemeralFeedItem } = useStream(playerViewUi$);
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
    const frame = window.requestAnimationFrame(() => {
      const activityElement = activityRef.current;
      if (!activityElement) return;
      activityElement.scrollTo({
        top: activityElement.scrollHeight,
        behavior: ephemeralFeedItem ? 'smooth' : 'auto'
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ephemeralFeedItem?.id, visibleActivity.length]);

  useEffect(() => {
    setRevealedRollIds((current) => unrevealedRollIdsFromHistoricalActivity(current, activity, mountedAtRef.current) ?? current);
  }, [activity]);

  useEffect(() => {
    const timeoutIds = visibleActivity
      .filter((event) => delaysRollResult(event) && !revealedRollIds.has(feedRollRevealId(event)))
      .map((event) => window.setTimeout(() => revealRoll(event), PLAYER_ROLL_FEED_REVEAL_DELAY_MS));
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
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1600);
    try {
      await navigator.clipboard?.writeText(inviteUrl);
    } catch {
      // The visible confirmation still acknowledges the click when Clipboard API
      // access is unavailable (for example, in an insecure browser context).
    }
  };
  return (
    <aside className="player-left-rail" aria-label="Хроника игры" aria-hidden={!accessible} inert={!accessible}>
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
      <section className={`player-activity-card ${role === 'gm' ? 'player-activity-card--gm' : ''}`}>
        <header className="player-chronicle-header">
          <PlayerRailTabs active="chronicle" role={role} onSelect={(tab) => {
            if (tab === 'npc') onOpenTool('generators');
          }} />
          <div className="player-chronicle-header__actions">
            <IconButton variant="ghost" size="sm" type="button" title="Библиотека игры" aria-label="Библиотека игры" onClick={() => onOpenTool('library')}>
              <LibraryBig size={16} aria-hidden="true" />
            </IconButton>
            <P2PHealthIndicator placement="chronicle" role={role} />
            {role === 'gm' && (
              <IconButton className={inviteCopied ? 'dh-is-copied' : ''} variant="ghost" size="sm" type="button" disabled={!p2pSession.roomId} title={inviteCopied ? 'Ссылка скопирована' : 'Копировать приглашение'} aria-label={inviteCopied ? 'Ссылка скопирована' : 'Копировать приглашение'} onClick={() => void copyInvite()}>
                {inviteCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              </IconButton>
            )}
            {role === 'gm' && hasClearableActivity && (
              <IconButton variant="ghost" tone="danger" size="sm" type="button" title="Очистить хронику" aria-label="Очистить хронику" onClick={() => setClearChronicleOpen(true)}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        </header>
        {visibleCountdowns.length > 0 && (
          <div className="player-countdown-strip" aria-label="Отсчеты">
            {visibleCountdowns.map((countdown) => (
              <CountdownCard countdown={countdown} key={countdown.id} role={role} />
            ))}
          </div>
        )}
        <div className={`player-activity-list ${visibleActivity.length === 0 ? 'player-activity-list--empty' : ''}`} ref={activityRef}>
          {visibleActivity.length === 0 && (
            <EmptyState
              tone="transparent"
              size="sm"
              title="Хроника пока пуста"
            />
          )}
          {visibleActivity.map((event) => {
            const waitingForResult = delaysRollResult(event) && !revealedRollIds.has(feedRollRevealId(event));
            const canRemoveEvent = (role === 'gm' || event.ephemeral) && event.id !== 'feed-empty';
            const eventClassName = [
              'player-activity-event',
              `player-activity-event--${event.kind}`,
              `player-activity-event--${event.tone}`,
              event.id === 'feed-empty' ? 'player-activity-event--empty' : '',
              event.ephemeral ? 'player-activity-event--ephemeral' : '',
              canRemoveEvent ? 'player-activity-event--removable' : '',
              waitingForResult ? 'dh-is-rolling' : ''
              ].filter(Boolean).join(' ');
            return (
              <article className={eventClassName} key={event.id}>
                {canRemoveEvent && (
                  <IconButton
                    className="player-activity-event__delete"
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label={event.ephemeral ? `Закрыть ${event.title}` : `Удалить событие ${event.title}`}
                    title={event.ephemeral ? 'Закрыть' : 'Удалить'}
                    onClick={() => event.ephemeral ? playerViewUiActions.setEphemeralFeedItem(null) : feedService.remove(event.id)}
                  >
                    <X size={12} aria-hidden="true" />
                  </IconButton>
                )}
                <FeedCard
                  item={event}
                  waitingForResult={waitingForResult}
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
          <TextControl tone="plain" aria-label="Сообщение игрока" value={message} onInput={(event) => setMessage(event.currentTarget.value)} placeholder={`Сообщение от ${model.character?.name ?? (role === 'gm' ? 'Мастера' : 'игрока')}`} />
          <IconButton variant="primary" size="sm" type="submit" disabled={!message.trim()} aria-label="Отправить сообщение" title="Отправить сообщение">
            <SendHorizontal size={15} aria-hidden="true" />
          </IconButton>
        </form>
      </section>
      {clearChronicleOpen && (
        <ConfirmDialog
          title="Очистить хронику?"
          body="Все сообщения, опубликованные броски и карточки хроники будут удалены. Это действие нельзя отменить."
          confirmLabel="Очистить"
          onCancel={() => setClearChronicleOpen(false)}
          onConfirm={() => {
            setClearChronicleOpen(false);
            feedService.clear();
            playerViewUiActions.setEphemeralFeedItem(null);
          }}
        />
      )}
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
          <TextControl
            className="player-countdown-card__name"
            tone="plain"
            aria-label="Название отсчета"
            value={countdown.name}
            onInput={(event) => encounterService.updateCountdown(countdown.id, { name: event.currentTarget.value })}
          />
        ) : (
          <strong>{countdown.name}</strong>
        )}
        {role === 'gm' && (
          <IconButton variant="ghost" size="xs" type="button" title="Удалить отсчет" aria-label={`Удалить отсчет ${countdown.name}`} onClick={() => encounterService.removeCountdown(countdown.id)}>
            <X size={14} aria-hidden="true" />
          </IconButton>
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
            <IconButton variant="ghost" size="xs" type="button" title="Назад" aria-label="Назад" onClick={() => encounterService.tickCountdown(countdown.id, -1)}>
              <Minus size={13} aria-hidden="true" />
            </IconButton>
            <IconButton variant="ghost" size="xs" type="button" title="Вперед" aria-label="Вперед" onClick={() => encounterService.tickCountdown(countdown.id, 1)}>
              <Plus size={13} aria-hidden="true" />
            </IconButton>
            <IconButton
              variant="ghost"
              size="xs"
              type="button"
              title={countdown.visibility === 'public' ? 'Скрыть от игроков' : 'Показать игрокам'}
              aria-label={countdown.visibility === 'public' ? 'Скрыть от игроков' : 'Показать игрокам'}
              onClick={() => encounterService.updateCountdown(countdown.id, { visibility: countdown.visibility === 'public' ? 'gm' : 'public' })}
            >
              {countdown.visibility === 'public' ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            </IconButton>
          </div>
        )}
      </footer>
    </article>
  );
}
