/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, Copy, Hand, LoaderCircle, MessageCircle, Mic, MicOff, Send, UserRound, Video, VideoOff, Volume2, X } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { buildCallInviteUrl, parseCallSessionLocation, readStoredCallName, writeStoredCallName } from '../../domain/p2p/sessionLinks';
import { currentRoutePathname } from '../../app/routing';
import { defaultSceneImageUrl } from '../../domain/tabletop/defaultArt';
import type { TableParticipant } from '../../domain/tabletop/types';
import { feedService, mediaCallService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';
import { toastService } from '../../services/ToastService';
import type { CallParticipant } from '../../services/MediaCallService';
import { P2PHealthIndicator } from '../p2p/P2PHealthIndicator';
import { cssImageUrl } from '../vtt/playerView/helpers';
import { Avatar, Badge, Button, ChoiceCard, EmptyState, Field, IconButton, ListItem, SectionHeader, Surface, TextControl, Toolbar } from '../components/common';
import { MediaStreamVideo } from './MediaStreamVideo';
import { buildCallParticipants, findLocalTableParticipant } from './callParticipants';
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
  const mediaTransport = useStream(p2pSessionService.mediaTransport$);
  const invite = useStream(p2pSessionService.invite$);
  const call = useStream(mediaCallService.call$);
  const feed = useStream(feedService.feed$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const bareCallsPath = typeof window !== 'undefined' && isBareCallsPath(currentRoutePathname());
  const roomId = resolveCallRoomId({
    bareCallsPath,
    inviteRoomId: invite.roomId,
    sessionRoomId: session.roomId,
    sessionParamsRoomId: sessionParams?.roomId ?? ''
  });
  const [nameDraft, setNameDraft] = useState(() => roomId ? readStoredCallName(roomId) : '');
  const [chatDraft, setChatDraft] = useState('');
  const [sideOpen, setSideOpen] = useState(defaultCallSideOpen);
  const [layoutMode, setLayoutMode] = useState<CallLayoutMode>(defaultCallLayoutMode);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const autoJoinKey = useRef<string | null>(null);
  const storedSession = useMemo(() => roomId ? p2pSessionService.storedSessionForRoom(roomId) : null, [roomId]);
  const healthRole = session.role ?? storedSession?.role ?? 'player';
  const connectedToRoom = session.connected && session.roomId === roomId;
  const connectingToRoom = session.status === 'connecting' && session.roomId === roomId;
  const callDirectPeers = session.transportMode === 'hybrid' ? mediaTransport.peers : session.directPeers;
  const liveScene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const sceneBackgroundUrl = liveScene?.backgroundUrl || (liveScene?.backgroundAssetId ? '' : liveScene ? defaultSceneImageUrl(liveScene) : '');
  const sceneBackgroundImage = sceneBackgroundUrl
    ? `url("${cssImageUrl(sceneBackgroundUrl)}")`
    : 'none';
  const playerSeats = useMemo(() => Object.values(sceneTable.participants).filter((participant) => participant.role === 'player'), [sceneTable.participants]);
  const feedMessages = feed.filter((entry) => entry.type === 'message').slice(-8);
  const participantsList = buildCallParticipants({
    call,
    connectedToRoom,
    feedEntries: feedMessages,
    sessionPeerId: session.peerId,
    tableParticipants: sceneTable.participants
  });
  const focusedParticipant = layoutMode === 'focus'
    ? pickFocusedParticipant(participantsList, focusedParticipantId, call.localParticipantId)
    : null;
  const thumbnailParticipants = focusedParticipant
    ? participantsList.filter((participant) => participant.participantId !== focusedParticipant.participantId)
    : [];

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
    if (!roomId || !connectedToRoom || call.roomId !== roomId || call.active) return;
    const localParticipant = findLocalTableParticipant(sceneTable.participants, call.localParticipantId, session.peerId);
    const displayName = call.displayName.trim() || localParticipant?.name || storedSession?.participantName || (session.role === 'gm' ? 'Мастер' : 'Игрок');
    mediaCallService.setRoom({
      roomId,
      participantId: localParticipant?.id,
      displayName,
      role: session.role === 'gm' ? 'gm' : 'player',
      active: true
    });
    p2pSessionService.renameLocalParticipant(displayName);
  }, [call.active, call.displayName, call.localParticipantId, call.roomId, connectedToRoom, roomId, sceneTable.participants, session.peerId, session.role, storedSession?.participantName]);

  useEffect(() => {
    if (!focusedParticipantId) return;
    if (participantsList.some((participant) => participant.participantId === focusedParticipantId)) return;
    setFocusedParticipantId(null);
  }, [focusedParticipantId, participantsList]);

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

  if (!roomId) {
    return (
      <section className="call-room call-room--empty">
        <EmptyState tone="panel" title="Комната звонка не найдена" />
      </section>
    );
  }

  return (
    <main className={`call-room ${sideOpen ? '' : 'dh-side-collapsed'}`.trim()}>
      <div className="call-room__scene-image" aria-hidden="true" style={{ backgroundImage: sceneBackgroundImage }} />
      <div className="call-room__backdrop" aria-hidden="true" />
      <section className="call-room__stage" aria-label="Видео звонок">
        <header className="call-room__topbar">
          <div>
            <span>Видеозвонок</span>
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
          </div>
          {!sideOpen && (
            <div className="call-room__top-actions">
              <IconButton type="button" size="lg" title="Открыть участников и чат" aria-label="Открыть участников и чат" onClick={() => setSideOpen(true)}>
                <UserRound size={18} aria-hidden="true" />
              </IconButton>
            </div>
          )}
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
                onSelect={() => {
                  setFocusedParticipantId(participant.participantId);
                  setLayoutMode('focus');
                }}
              />
            ))}
          </div>
        )}

        <Toolbar className="call-room__controls" aria-label="Управление звонком">
          {call.audioPlaybackBlocked && (
            <Button
              minWidth="sm"
              size="sm"
              type="button"
              iconBefore={<Volume2 size={15} aria-hidden="true" />}
              variant="primary"
              onClick={() => void mediaCallService.unlockRemoteAudio()}
            >
              Включить звук
            </Button>
          )}
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
          <Button
            minWidth="sm"
            size="sm"
            type="button"
            iconBefore={<Hand size={15} aria-hidden="true" />}
            title={call.handRaised ? 'Опустить руку' : 'Поднять руку'}
            aria-label={call.handRaised ? 'Опустить руку' : 'Поднять руку'}
            variant={call.handRaised ? 'primary' : 'secondary'}
            onClick={() => void mediaCallService.toggleHand()}
          >
            Рука
          </Button>
        </Toolbar>
      </section>

      {sideOpen && (
      <aside className="call-room__side" aria-label="Участники и чат">
        <Toolbar className="call-room__side-actions" aria-label="Панель участников и чата">
          <IconButton type="button" size="sm" variant="ghost" title="Скрыть участников и чат" aria-label="Скрыть участников и чат" onClick={() => setSideOpen(false)}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </Toolbar>
        <Surface className="call-room__panel call-room__participants" tone="subtle" padding="none">
          <SectionHeader
            title="Участники"
            actions={<Badge tone="gold">{participantsList.length}</Badge>}
          />
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
                  {participant.handRaised && <Hand size={15} aria-label="Рука поднята" />}
                  {participant.micMuted ? <MicOff size={15} aria-label="Микрофон выключен" /> : <Mic size={15} aria-label="Микрофон включен" />}
                  {participant.cameraOff ? <VideoOff size={15} aria-label="Камера выключена" /> : <Video size={15} aria-label="Камера включена" />}
                </Toolbar>
              }
            />
          ))}
        </Surface>
        <Surface className="call-room__panel call-room__chat" tone="subtle" padding="none">
          <SectionHeader
            title="Чат"
            actions={<MessageCircle size={18} aria-hidden="true" />}
          />
          <div className="call-room__messages">
            {feedMessages.map((entry) => (
              <article key={entry.id}>
                <strong>{entry.authorName || 'Участник'}</strong>
                <span>{entry.body}</span>
              </article>
            ))}
            {feedMessages.length === 0 && <EmptyState size="sm" title="Сообщений пока нет" />}
          </div>
          <form className="call-room__chat-form" onSubmit={(event) => {
            event.preventDefault();
            sendChat();
          }}>
            <TextControl value={chatDraft} onInput={(event) => setChatDraft(event.currentTarget.value)} placeholder="Сообщение" />
            <IconButton type="submit" title="Отправить" aria-label="Отправить" tone="gold">
              <Send size={16} aria-hidden="true" />
            </IconButton>
          </form>
        </Surface>
      </aside>
      )}
      <P2PHealthIndicator role={healthRole} />
    </main>
  );
}

function CallVideoTile({ connecting = false, focused = false, local = false, onSelect, participant }: { connecting?: boolean; focused?: boolean; local?: boolean; participant: CallParticipant; onSelect: () => void }) {
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
        {participant.handRaised && <Hand size={14} aria-label="Рука поднята" />}
        {participant.micMuted ? <MicOff size={14} aria-label="Микрофон выключен" /> : <Mic size={14} aria-label="Микрофон включен" />}
      </footer>
    </article>
  );
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

function defaultCallSideOpen(): boolean {
  if (typeof window === 'undefined') return true;
  return !window.matchMedia('(max-width: 900px)').matches;
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
