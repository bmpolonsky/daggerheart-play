/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Eye, EyeOff, Minus, Plus, SendHorizontal, X } from 'lucide-react';
import { useStream } from '../../../../core/hooks/useStream';
import type { Countdown } from '../../../../domain/rules/types';
import type { PlayerViewCharacterSummary, PlayerViewModel } from '../../../../domain/tabletop/playerView';
import type { TableFeedItem } from '../../../../domain/tabletop/feed';
import { encounterService, feedService, gameService, persistenceService, p2pSessionService } from '../../../../services/serviceRegistry';
import { EmptyState } from '../../../components/common/EmptyState';
import { IconButton } from '../../../components/common/IconButton';
import { TextControl } from '../../../components/common/Field';
import { Button } from '../../../components/common/Button';
import { PLAYER_ROLL_FEED_REVEAL_DELAY_MS } from '../constants';
import { runDomainCardMacroAction } from '../domainCards/domainCardMacroActions';
import type { PlayerViewDomainCard, PlayerViewDomainCardMacro } from '../domainCards/types';
import { feedRollRevealId, revealedRollIdsFromActivity } from '../helpers';
import { playerViewUi$, playerViewUiActions } from '../playerViewUiState';
import { CharacterRollDialog, PreparedDiceRollDialog } from '../CharacterRollDialog';
import type { PreparedDiceRoll } from '../../../../services/CharacterRollService';
import type { PlayerRollDraft, SharedToolsTab, TableViewRole } from '../types';
import { PlayerRailTabs } from '../PlayerRailTabs';
import { PlayerRailHeaderActions } from '../PlayerRailHeaderActions';
import { delaysRollResult, unrevealedRollIdsFromHistoricalActivity } from './activityReveal';
import { FeedCard } from './feedCards/FeedCard';
import { activityScopeKey, countNewActivityIds, isActivityNearBottom } from './activityScroll';

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
  const [diceDraftState, setDiceDraftState] = useState<{ draft: PreparedDiceRoll; character: PlayerViewCharacterSummary } | null>(null);
  const encounter = useStream(encounterService.encounter$);
  const game = useStream(gameService.game$);
  const session = useStream(p2pSessionService.session$);
  const worlds = useStream(persistenceService.storedWorlds$);
  const activeWorld = worlds.find((world) => world.active);
  const activeStoredGame = activeWorld?.games.find((storedGame) => storedGame.active);
  const scopeKey = activityScopeKey({ gameId: game.id, worldId: activeWorld?.id, storedGameId: activeStoredGame?.id,
    role, roomId: session.roomId, actorId: role === 'player' ? model.character?.id : undefined });
  const { ephemeralFeedItem } = useStream(playerViewUi$);
  const [revealedRollIds, setRevealedRollIds] = useState<Set<string>>(() => revealedRollIdsFromActivity(model.activity));
  const mountedAtRef = useRef(Date.now());
  const activityRef = useRef<HTMLDivElement>(null);
  const followingActivityRef = useRef(true);
  const activityPositionInitializedRef = useRef(false);
  const previousActivityIdsRef = useRef(model.activity.map((event) => event.id));
  const [unreadActivityCount, setUnreadActivityCount] = useState(0);
  const activity = useMemo(() => {
    if (!ephemeralFeedItem || !canViewEphemeralFeedItem(ephemeralFeedItem, role, model.character?.id ?? null)) return model.activity;
    return [
      ephemeralFeedItem,
      ...model.activity.filter((event) => event.id !== 'feed-empty')
    ];
  }, [ephemeralFeedItem, model.activity, model.character?.id, role]);
  const visibleActivity = useMemo(() => activity.slice().reverse(), [activity]);
  const activityIds = visibleActivity.map((event) => event.id);
  const activityIdsKey = JSON.stringify(activityIds);
  const pendingRollRevealIds = useMemo(() => visibleActivity
    .filter((event) => delaysRollResult(event) && !revealedRollIds.has(feedRollRevealId(event)))
    .map(feedRollRevealId), [revealedRollIds, visibleActivity]);
  const pendingRollRevealKey = pendingRollRevealIds.join('|');
  const visibleCountdowns = useMemo(() => encounter.countdowns.filter((countdown) => role === 'gm' || countdown.visibility === 'public'), [encounter.countdowns, role]);

  // Reading an older event is local to this game/room, never a preference
  // inherited by a different world's feed (even an imported copy with the same IDs).
  useLayoutEffect(() => {
    followingActivityRef.current = true;
    activityPositionInitializedRef.current = false;
    previousActivityIdsRef.current = activityIds;
    mountedAtRef.current = Date.now();
    setUnreadActivityCount(0);
    setRevealedRollIds(revealedRollIdsFromActivity(model.activity));
  }, [scopeKey]);

  useEffect(() => {
    const addedCount = countNewActivityIds(previousActivityIdsRef.current, activityIds);
    previousActivityIdsRef.current = activityIds;
    if (activityPositionInitializedRef.current && !followingActivityRef.current && addedCount > 0) {
      setUnreadActivityCount((count) => count + addedCount);
    }
  }, [scopeKey, activityIdsKey]);

  useEffect(() => {
    if (!accessible) return;
    let frame = 0;
    const followActivity = () => {
      const activityElement = activityRef.current;
      if (!activityElement || activityElement.clientHeight === 0) return;
      if (activityPositionInitializedRef.current && !followingActivityRef.current) return;
      activityElement.scrollTo({
        top: activityElement.scrollHeight,
        behavior: 'auto'
      });
      activityPositionInitializedRef.current = true;
      followingActivityRef.current = true;
      setUnreadActivityCount(0);
    };
    const scheduleFollow = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(followActivity);
    };
    scheduleFollow();
    // The mobile rail starts display:none. Initialize only once it has real
    // dimensions, and keep following while images/results change row heights.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFollow);
    const element = activityRef.current;
    if (element) {
      observer?.observe(element);
      Array.from(element.children).forEach((child) => observer?.observe(child));
    }
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [accessible, scopeKey, activityIdsKey]);

  useEffect(() => {
    setRevealedRollIds((current) => unrevealedRollIdsFromHistoricalActivity(current, activity, mountedAtRef.current) ?? current);
  }, [activity]);

  useEffect(() => {
    const timeoutIds = pendingRollRevealIds
      .map((rollId) => window.setTimeout(() => revealRoll(rollId), PLAYER_ROLL_FEED_REVEAL_DELAY_MS));
    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [pendingRollRevealKey]);

  const revealRoll = (rollId: string) => {
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
      openRollDraft: (draft) => setRollDraftState({ draft, character }),
      openDiceDraft: (draft) => setDiceDraftState({ draft, character })
    });
  };
  return (
    <aside className="player-left-rail" aria-label="Чат игры" aria-hidden={!accessible} inert={!accessible}>
      {rollDraftState && (
        <CharacterRollDialog
          character={rollDraftState.character}
          draft={rollDraftState.draft}
          role={role}
          onTraitChange={(trait) => setRollDraftState((current) => current ? { ...current, draft: { ...current.draft, trait } } : current)}
          onClose={() => setRollDraftState(null)}
        />
      )}
      {diceDraftState && <PreparedDiceRollDialog
        actor={diceDraftState.character}
        draft={diceDraftState.draft}
        role={role}
        onClose={() => setDiceDraftState(null)}
      />}

      <header className="player-chronicle-header">
        <PlayerRailTabs active="chronicle" role={role} onSelect={(tab) => {
          if (tab === 'library') onOpenTool('library');
          if (tab === 'npc') onOpenTool('npc');
          if (tab === 'names') onOpenTool('names');
        }} />
        <PlayerRailHeaderActions role={role} onOpenTool={onOpenTool} />
      </header>
      <section className={`player-activity-card ${role === 'gm' ? 'player-activity-card--gm' : ''}`}>
        {visibleCountdowns.length > 0 && (
          <div className="player-countdown-strip" aria-label="Отсчеты">
            {visibleCountdowns.map((countdown) => (
              <CountdownCard countdown={countdown} key={countdown.id} role={role} />
            ))}
          </div>
        )}
        <div className={`player-activity-list ${visibleActivity.length === 0 ? 'player-activity-list--empty' : ''}`} ref={activityRef} onScroll={() => {
          const element = activityRef.current;
          if (!accessible || !element || element.clientHeight === 0) return;
          followingActivityRef.current = isActivityNearBottom(element);
          if (followingActivityRef.current) setUnreadActivityCount(0);
        }}>
          {visibleActivity.length === 0 && (
            <EmptyState
              tone="transparent"
              size="sm"
              title="Чат пока пуст"
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
        {unreadActivityCount > 0 && (
          <Button size="xs" variant="ghost" onClick={() => {
            followingActivityRef.current = true;
            activityRef.current?.scrollTo({ top: activityRef.current.scrollHeight, behavior: 'auto' });
            setUnreadActivityCount(0);
          }}>
            Новые события: {unreadActivityCount}
          </Button>
        )}
        <form className="player-chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <TextControl tone="plain" aria-label="Сообщение в чат" value={message} onInput={(event) => setMessage(event.currentTarget.value)} placeholder={`Сообщение от ${model.character?.name ?? (role === 'gm' ? 'Мастера' : 'игрока')}`} />
          <IconButton variant="primary" size="md" type="submit" disabled={!message.trim()} aria-label="Отправить сообщение" title="Отправить сообщение">
            <SendHorizontal size={15} aria-hidden="true" />
          </IconButton>
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
