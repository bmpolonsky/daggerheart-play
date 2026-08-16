/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, Copy, Ellipsis, Hand, LoaderCircle, Mic, MicOff, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PhoneOff, Send, Trash2, UserRound, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { buildCallInviteUrl, parseCallSessionLocation, readStoredCallName, writeStoredCallName } from '../../domain/p2p/sessionLinks';
import { currentRoutePathname } from '../../app/routing';
import { defaultSceneImageUrl } from '../../domain/tabletop/defaultArt';
import { buildTableFeedFromEntries } from '../../domain/tabletop/feed';
import type { TableParticipant } from '../../domain/tabletop/types';
import { feedService, mediaCallService, p2pSessionService, playerActivationQueueService, sceneTableService } from '../../services/serviceRegistry';
import { toastService } from '../../services/ToastService';
import type { CallParticipant } from '../../services/MediaCallService';
import { buildP2PHealthSummary, P2PHealthIndicator } from '../p2p/P2PHealthIndicator';
import { cssImageUrl } from '../vtt/playerView/helpers';
import { ActionMenu, Avatar, Badge, Button, ChoiceCard, ConfirmDialog, EmptyState, Field, IconButton, ListItem, SectionHeader, Surface, TextControl, Toolbar } from '../components/common';
import { MediaStreamVideo } from './MediaStreamVideo';
import { buildCallParticipants, findLocalTableParticipant } from './callParticipants';
import { FeedCard } from '../vtt/playerView/playerChrome/feedCards/FeedCard';
import type { TableViewRole } from '../vtt/playerView/types';
import '../vtt/playerView/player-chrome.css';
import './call-room.css';

interface CallRoomAppProps {
  basePath: string;
}

type CallLayoutMode = 'focus' | 'grid';

export function CallRoomApp({ basePath }: CallRoomAppProps) {
  const sessionParams = typeof window === 'undefined'
    ? null
    : parseCallSessionLocation(window.location.pathname, basePath, window.location.hash);
  const session = useStream(p2pSessionService.session$);
  const invite = useStream(p2pSessionService.invite$);
  const call = useStream(mediaCallService.call$);
  const feed = useStream(feedService.feed$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const activationQueue = useStream(playerActivationQueueService.queue$);
  const bareCallsPath = typeof window !== 'undefined' && isBareCallsPath(currentRoutePathname());
  const roomId = resolveCallRoomId({
    bareCallsPath,
    inviteRoomId: invite.roomId,
    sessionRoomId: session.roomId,
    sessionParamsRoomId: sessionParams?.roomId ?? ''
  });
  const [nameDraft, setNameDraft] = useState(() => roomId ? readStoredCallName(roomId) : '');
  const [chatDraft, setChatDraft] = useState('');
  const [leftOpen, setLeftOpen] = useState(defaultCallLeftOpen);
  const [rightOpen, setRightOpen] = useState(defaultCallRightOpen);
  const [layoutMode, setLayoutMode] = useState<CallLayoutMode>(defaultCallLayoutMode);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [clearChronicleOpen, setClearChronicleOpen] = useState(false);
  const [leftCall, setLeftCall] = useState(false);
  const autoJoinKey = useRef<string | null>(null);
  const chronicleRef = useRef<HTMLDivElement>(null);
  const storedSession = useMemo(
    () => roomId ? p2pSessionService.storedSessionForRoom(roomId, session.role ?? undefined) : null,
    [roomId, session.role]
  );
  const healthRole = session.role ?? storedSession?.role ?? 'player';
  const p2pHealth = useMemo(() => buildP2PHealthSummary(session), [session]);
  const role: TableViewRole = healthRole === 'gm' ? 'gm' : 'player';
  const connectedToRoom = session.connected && session.roomId === roomId;
  const connectingToRoom = session.status === 'connecting' && session.roomId === roomId;
  const callDirectPeers = session.directPeers;
  const liveScene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const sceneBackgroundUrl = liveScene?.backgroundUrl || (liveScene?.backgroundAssetId ? '' : liveScene ? defaultSceneImageUrl(liveScene) : '');
  const sceneBackgroundImage = sceneBackgroundUrl
    ? `url("${cssImageUrl(sceneBackgroundUrl)}")`
    : 'none';
  const playerSeats = useMemo(() => Object.values(sceneTable.participants).filter((participant) => participant.role === 'player'), [sceneTable.participants]);
  const localTableParticipant = findLocalTableParticipant(sceneTable.participants, call.localParticipantId, session.peerId);
  const chronicleActorId = role === 'player' ? localTableParticipant?.actorIds[0] ?? null : null;
  const chronicle = useMemo(() => buildTableFeedFromEntries({
    feed,
    role,
    actorId: chronicleActorId
  }).slice().reverse(), [chronicleActorId, feed, role]);
  const participantsList = buildCallParticipants({
    call,
    connectedToRoom,
    feedEntries: feed,
    sessionPeerId: session.peerId,
    tableParticipants: sceneTable.participants
  });
  const focusedParticipant = layoutMode === 'focus'
    ? pickFocusedParticipant(participantsList, focusedParticipantId, call.localParticipantId)
    : null;
  const thumbnailParticipants = focusedParticipant
    ? participantsList.filter((participant) => participant.participantId !== focusedParticipant.participantId)
    : [];
  const raisedIds = useMemo(() => new Set(activationQueue.flatMap((request) => [request.requesterId, request.actorId, request.requesterName ?? '', request.actorName])), [activationQueue]);

  useEffect(() => {
    if (!roomId || typeof window === 'undefined' || !isBareCallsPath(currentRoutePathname())) return;
    window.history.replaceState({}, '', buildCallInviteUrl({
      origin: window.location.origin,
      basePath,
      roomId
    }));
  }, [basePath, roomId]);

  useEffect(() => {
    if (!roomId) return;
    const storedName = readStoredCallName(roomId);
    if (storedName && !nameDraft) {
      setNameDraft(storedName);
    }
  }, [nameDraft, roomId]);

  useEffect(() => {
    if (!roomId || connectedToRoom || connectingToRoom) return;
    const storedName = readStoredCallName(roomId);
    if (!storedName) return;
    const key = `${roomId}:${storedName}`;
    if (autoJoinKey.current === key) return;
    autoJoinKey.current = key;
    void joinCall(storedName).catch(() => {
      autoJoinKey.current = null;
    });
  }, [connectedToRoom, connectingToRoom, roomId]);

  useEffect(() => {
    if (!roomId || !connectedToRoom || call.roomId !== roomId || call.active || leftCall) return;
    const displayName = call.displayName.trim() || localTableParticipant?.name || storedSession?.participantName || (session.role === 'gm' ? 'Мастер' : 'Игрок');
    mediaCallService.setRoom({
      roomId,
      participantId: localTableParticipant?.id,
      displayName,
      role: session.role === 'gm' ? 'gm' : 'player',
      active: true
    });
    p2pSessionService.renameLocalParticipant(displayName);
  }, [call.active, call.displayName, call.roomId, connectedToRoom, leftCall, localTableParticipant?.id, localTableParticipant?.name, roomId, session.role, storedSession?.participantName]);

  useEffect(() => {
    if (!focusedParticipantId) return;
    if (participantsList.some((participant) => participant.participantId === focusedParticipantId)) return;
    setFocusedParticipantId(null);
  }, [focusedParticipantId, participantsList]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const element = chronicleRef.current;
      element?.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chronicle.length, leftOpen]);

  const joinCall = async (displayName = nameDraft, selectedSeat?: TableParticipant): Promise<void> => {
    const name = displayName.trim();
    if (!roomId || !name) {
      toastService.show('Введите имя для звонка.', 'warning');
      return;
    }
    writeStoredCallName(roomId, name);
    mediaCallService.setDisplayName(name);
    const participantId = selectedSeat?.id ?? storedSession?.participantId;
    const actorIds = selectedSeat?.actorIds ?? storedSession?.actorIds;
    if (connectedToRoom) {
      mediaCallService.setRoom({
        roomId,
        participantId,
        displayName: name,
        role: session.role === 'gm' ? 'gm' : 'player',
        active: true
      });
      p2pSessionService.renameLocalParticipant(name);
      return;
    }
    const role = selectedSeat ? 'player' : storedSession?.role ?? 'player';
    if (role === 'gm') {
      await p2pSessionService.startGmRoom({
        roomId,
        participantName: name,
        participantId,
        actorIds
      });
    } else {
      await p2pSessionService.startPlayerRoom({
        roomId,
        participantName: name,
        participantId,
        actorIds
      });
    }
    mediaCallService.setRoom({ roomId, participantId, displayName: name, role, active: true });
    p2pSessionService.renameLocalParticipant(name);
  };

  const selectSeatName = (seat: TableParticipant) => {
    setNameDraft(seat.name);
    void joinCall(seat.name, seat);
  };

  const sendChat = () => {
    const body = chatDraft.trim();
    const authorName = call.displayName.trim() || nameDraft.trim() || 'Гость';
    if (!body) return;
    setChatDraft('');
    void p2pSessionService.sendChatMessage(authorName, body);
  };

  const copyCallInvite = async () => {
    const inviteUrl = buildCallInviteUrl({
      origin: window.location.origin,
      basePath,
      roomId
    });
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1600);
      toastService.show('Ссылка на созвон скопирована.', 'success');
    } catch {
      toastService.show('Скопируйте ссылку из адресной строки.', 'warning');
    }
  };

  const leaveCall = async () => {
    setLeftCall(true);
    await mediaCallService.leaveCall();
    window.dispatchEvent(new CustomEvent('daggerheart-play:navigate-route', { detail: { route: 'game' } }));
  };

  if (!roomId) {
    return (
      <section className="call-room call-room--empty">
        <EmptyState tone="panel" title="Комната звонка не найдена" />
      </section>
    );
  }

  return (
    <main className={`call-room ${leftOpen ? 'dh-left-open' : ''} ${rightOpen ? 'dh-right-open' : ''}`.trim()}>
      <div className="call-room__scene-image" aria-hidden="true" style={{ backgroundImage: sceneBackgroundImage }} />
      <div className="call-room__backdrop" aria-hidden="true" />

      {leftOpen && (
        <Surface as="aside" className="call-room__rail call-room__rail--left" tone="solid" padding="sm" aria-label="Чат игры">
          <SectionHeader
            title="Чат"
            actions={(
              <div className="player-chronicle-header__actions">
                <P2PHealthIndicator placement="chronicle" role={healthRole} />
                {role === 'gm' && (
                  <ActionMenu
                    ariaLabel="Другие действия чата"
                    items={[{
                      id: 'clear-chronicle',
                      label: 'Очистить чат',
                      icon: <Trash2 size={15} />,
                      disabled: chronicle.length === 0,
                      onSelect: () => setClearChronicleOpen(true)
                    }]}
                    renderTrigger={(props) => (
                      <IconButton {...props} variant="ghost" size="sm" title="Ещё" aria-label="Другие действия чата">
                        <Ellipsis size={15} aria-hidden="true" />
                      </IconButton>
                    )}
                  />
                )}
              </div>
            )}
          />
          <div className={`call-room__chronicle player-activity-list ${chronicle.length === 0 ? 'player-activity-list--empty' : ''}`} ref={chronicleRef}>
            {chronicle.length === 0 && <EmptyState tone="transparent" size="sm" title="Чат пока пуст" />}
            {chronicle.map((event) => (
              <article className={`player-activity-event player-activity-event--${event.kind} player-activity-event--${event.tone}`} key={event.id}>
                <FeedCard
                  actorId={chronicleActorId}
                  item={event}
                  waitingForResult={false}
                  role={role}
                  onRevealToPublic={(item) => feedService.revealToPublic(item.id)}
                />
              </article>
            ))}
          </div>
          <form className="player-chat-composer" onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}>
            <TextControl tone="plain" aria-label="Сообщение в чат" value={chatDraft} onInput={(event) => setChatDraft(event.currentTarget.value)} placeholder="Сообщение" />
            <IconButton variant="primary" size="sm" type="submit" disabled={!chatDraft.trim()} title="Отправить" aria-label="Отправить сообщение">
              <Send size={16} aria-hidden="true" />
            </IconButton>
          </form>
        </Surface>
      )}

      <section className="call-room__stage" aria-label="Видео звонок">
        <header className="call-room__topbar">
          <div className="call-room__room-title">
            <h1>Комната {roomId}</h1>
            <IconButton
              className={inviteCopied ? 'dh-is-copied' : ''}
              variant="ghost"
              size="xs"
              type="button"
              title={inviteCopied ? 'Ссылка скопирована' : 'Копировать ссылку на созвон'}
              aria-label={inviteCopied ? 'Ссылка скопирована' : 'Копировать ссылку на созвон'}
              onClick={() => void copyCallInvite()}
            >
              {inviteCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            </IconButton>
          </div>
        </header>

        {!connectedToRoom && !connectingToRoom && (
          <Surface className="call-room__join" aria-label="Вход в звонок">
            <SectionHeader
              title="Представьтесь"
              actions={<UserRound size={20} aria-hidden="true" />}
            />
            <Field label="Имя">
              <TextControl value={nameDraft} onInput={(event) => setNameDraft(event.currentTarget.value)} placeholder="Как вас показать в звонке" />
            </Field>
            {playerSeats.length > 0 && (
              <div className="call-room__seat-picks">
                {playerSeats.map((seat) => (
                  <ChoiceCard key={seat.id} onClick={() => selectSeatName(seat)}>
                    <strong>{seat.name}</strong>
                  </ChoiceCard>
                ))}
              </div>
            )}
            <Button variant="primary" type="button" disabled={!nameDraft.trim()} onClick={() => void joinCall()}>
              Войти в звонок
            </Button>
          </Surface>
        )}

        {layoutMode === 'focus' && focusedParticipant ? (
          <div className="call-room__focus-layout">
            <CallVideoTile
              focused
              local={focusedParticipant.participantId === call.localParticipantId}
              connecting={isParticipantConnecting(focusedParticipant.participantId, call.localParticipantId, callDirectPeers)}
              participant={focusedParticipant}
              handRaised={gameHandRaised(focusedParticipant, raisedIds)}
              onSelect={() => setLayoutMode('grid')}
            />
            {thumbnailParticipants.length > 0 && (
              <div className="call-room__filmstrip" aria-label="Миниатюры участников">
                {thumbnailParticipants.map((participant) => (
                  <CallVideoTile
                    key={participant.participantId}
                    local={participant.participantId === call.localParticipantId}
                    connecting={isParticipantConnecting(participant.participantId, call.localParticipantId, callDirectPeers)}
                    participant={participant}
                    handRaised={gameHandRaised(participant, raisedIds)}
                    onSelect={() => {
                      setFocusedParticipantId(participant.participantId);
                      setLayoutMode('focus');
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={`call-room__grid call-room__grid--${Math.min(6, Math.max(1, participantsList.length))}`}>
            {participantsList.map((participant) => (
              <CallVideoTile
                key={participant.participantId}
                focused={participant.participantId === focusedParticipant?.participantId}
                local={participant.participantId === call.localParticipantId}
                connecting={isParticipantConnecting(participant.participantId, call.localParticipantId, callDirectPeers)}
                participant={participant}
                handRaised={gameHandRaised(participant, raisedIds)}
                onSelect={() => {
                  setFocusedParticipantId(participant.participantId);
                  setLayoutMode('focus');
                }}
              />
            ))}
          </div>
        )}

        <Toolbar className="call-room__controls" aria-label="Управление звонком">
          <Button minWidth="sm" size="sm" iconBefore={call.incomingAudioMuted || call.audioPlaybackBlocked ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />} variant={call.incomingAudioMuted || call.audioPlaybackBlocked ? 'primary' : 'secondary'} onClick={() => void mediaCallService.toggleIncomingAudio()}>
            {call.incomingAudioMuted || call.audioPlaybackBlocked ? 'Включить звук' : 'Входящий звук'}
          </Button>
          <Button
            minWidth="sm"
            size="sm"
            type="button"
            iconBefore={call.micMuted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
            title={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            aria-label={call.micMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            variant={call.micMuted ? 'secondary' : 'primary'}
            onClick={() => void mediaCallService.toggleMicrophone()}
          >
            {call.micMuted ? 'Микрофон' : 'В эфире'}
          </Button>
          <Button
            minWidth="sm"
            size="sm"
            type="button"
            iconBefore={call.cameraOff ? <VideoOff size={15} aria-hidden="true" /> : <Video size={15} aria-hidden="true" />}
            title={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'}
            aria-label={call.cameraOff ? 'Включить камеру' : 'Выключить камеру'}
            variant={call.cameraOff ? 'secondary' : 'primary'}
            onClick={() => void mediaCallService.toggleCamera()}
          >
            Камера
          </Button>
          <Button minWidth="sm" size="sm" iconBefore={<PhoneOff size={15} aria-hidden="true" />} variant="danger" onClick={() => void leaveCall()}>Выйти</Button>
        </Toolbar>
      </section>

      {rightOpen && (
        <Surface as="aside" className="call-room__rail call-room__rail--right" tone="solid" padding="sm" aria-label="Участники звонка">
          <SectionHeader
            title="Участники"
            actions={<Badge tone="gold">{participantsList.length}</Badge>}
          />
          <div className="call-room__participant-list">
            {participantsList.map((participant) => (
              <ListItem
                key={participant.participantId}
                title={participant.displayName || 'Гость'}
                subtitle={participant.participantId === call.localParticipantId ? 'Вы' : participant.role === 'gm' ? 'Ведущий' : 'Игрок'}
                density="compact"
                tone={layoutMode === 'focus' && participant.participantId === focusedParticipant?.participantId ? 'featured' : 'default'}
                leftAccessory={<Avatar fallback={initials(participant.displayName)} size="sm" />}
                onClick={() => {
                  setFocusedParticipantId(participant.participantId);
                  setLayoutMode('focus');
                }}
                rightAccessory={
                  <Toolbar className="call-room__participant-status">
                    {isParticipantConnecting(participant.participantId, call.localParticipantId, callDirectPeers) && <LoaderCircle className="call-room__connecting" size={15} aria-label="Подключается" />}
                    {gameHandRaised(participant, raisedIds) && <Hand size={15} aria-label="Игровая рука поднята" />}
                    {participant.micMuted ? <MicOff size={15} aria-label="Микрофон выключен" /> : <Mic size={15} aria-label="Микрофон включен" />}
                    {participant.cameraOff ? <VideoOff size={15} aria-label="Камера выключена" /> : <Video size={15} aria-label="Камера включена" />}
                  </Toolbar>
                }
              />
            ))}
          </div>
        </Surface>
      )}

      <div className="call-room__panel-toggles" aria-label="Боковые панели созвона">
        <IconButton
          className={`call-room__panel-toggle call-room__panel-toggle--left ${leftOpen ? 'dh-is-open' : ''}`}
          variant="secondary"
          tone={leftOpen ? 'gold' : 'neutral'}
          size="sm"
          type="button"
          title={leftOpen ? 'Скрыть чат' : `Открыть чат — ${p2pHealth.label}`}
          aria-label={leftOpen ? 'Скрыть чат' : `Открыть чат. Соединение: ${p2pHealth.label}`}
          aria-pressed={leftOpen}
          onClick={() => setLeftOpen((current) => !current)}
        >
          {leftOpen ? <PanelLeftClose size={17} aria-hidden="true" /> : <PanelLeftOpen size={17} aria-hidden="true" />}
          {!leftOpen && <span className={`player-connection-status-dot is-${p2pHealth.tone}`} aria-hidden="true" />}
        </IconButton>
        <IconButton
          className={`call-room__panel-toggle call-room__panel-toggle--right ${rightOpen ? 'dh-is-open' : ''}`}
          variant="secondary"
          tone={rightOpen ? 'gold' : 'neutral'}
          size="sm"
          type="button"
          title={rightOpen ? 'Скрыть участников' : 'Открыть участников'}
          aria-label={rightOpen ? 'Скрыть участников' : 'Открыть участников'}
          aria-pressed={rightOpen}
          onClick={() => setRightOpen((current) => !current)}
        >
          {rightOpen ? <PanelRightClose size={17} aria-hidden="true" /> : <PanelRightOpen size={17} aria-hidden="true" />}
        </IconButton>
      </div>
      {clearChronicleOpen && (
        <ConfirmDialog
          title="Очистить чат?"
          body="Все сообщения, опубликованные броски и события будут удалены. Это действие нельзя отменить."
          confirmLabel="Очистить"
          onCancel={() => setClearChronicleOpen(false)}
          onConfirm={() => {
            setClearChronicleOpen(false);
            feedService.clear();
          }}
        />
      )}
    </main>
  );
}

function CallVideoTile({ connecting = false, focused = false, handRaised = false, local = false, onSelect, participant }: { connecting?: boolean; focused?: boolean; handRaised?: boolean; local?: boolean; participant: CallParticipant; onSelect: () => void }) {
  const className = [
    'call-video-tile',
    participant.cameraOff || !participant.stream ? 'dh-camera-off' : '',
    local ? 'dh-is-local' : '',
    focused ? 'dh-is-focused' : ''
  ].filter(Boolean).join(' ');
  return (
    <article
      className={className}
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      aria-label={`Показать крупно: ${participant.displayName || 'Гость'}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
    >
      {participant.stream && !participant.cameraOff ? (
        <MediaStreamVideo key={mediaStreamRenderKey(participant.stream)} muted stream={participant.stream} />
      ) : (
        <div className="call-video-tile__avatar" aria-hidden="true">{initials(participant.displayName)}</div>
      )}
      <footer>
        <span>{participant.displayName || 'Гость'}{local ? ' — вы' : ''}</span>
        {connecting && <LoaderCircle className="call-room__connecting" size={14} aria-label="Подключается" />}
        {handRaised && <Hand size={14} aria-label="Игровая рука поднята" />}
        {participant.micMuted ? <MicOff size={14} aria-label="Микрофон выключен" /> : <Mic size={14} aria-label="Микрофон включен" />}
      </footer>
    </article>
  );
}

function gameHandRaised(participant: CallParticipant, raisedIds: ReadonlySet<string>): boolean {
  return raisedIds.has(participant.participantId) || raisedIds.has(participant.displayName);
}

function isParticipantConnecting(participantId: string, localParticipantId: string, directPeers: string[] = []): boolean {
  return participantId !== localParticipantId && !directPeers.includes(participantId);
}

function pickFocusedParticipant(participants: CallParticipant[], focusedParticipantId: string | null, localParticipantId: string): CallParticipant | null {
  return participants.find((participant) => participant.participantId === focusedParticipantId)
    ?? participants.find((participant) => participant.participantId !== localParticipantId && participant.stream && !participant.cameraOff)
    ?? participants.find((participant) => participant.participantId !== localParticipantId)
    ?? participants[0]
    ?? null;
}

function defaultCallLayoutMode(): CallLayoutMode {
  return 'grid';
}

function defaultCallLeftOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 1181px)').matches;
}

function defaultCallRightOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 901px)').matches;
}

function resolveCallRoomId(input: { bareCallsPath: boolean; inviteRoomId: string; sessionParamsRoomId: string; sessionRoomId: string }): string {
  if (!input.bareCallsPath) return input.sessionParamsRoomId;
  return input.sessionRoomId || input.sessionParamsRoomId || input.inviteRoomId;
}

function mediaStreamRenderKey(stream: MediaStream): string {
  return `${stream.id}:${stream.getVideoTracks().map((track) => track.id).join(',')}`;
}

function isBareCallsPath(pathname: string): boolean {
  return (pathname.replace(/\/+$/, '') || '/') === '/calls';
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
