/** @jsxImportSource preact */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Hand, MessageCircle, Mic, MicOff, MonitorPlay, Send, Swords, UserRound, Video, VideoOff } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { buildCallInviteUrl, parseCallSessionLocation, readStoredCallName, readStoredCallSession, writeStoredCallName } from '../../domain/p2p/sessionLinks';
import { defaultSceneImageUrl } from '../../domain/tabletop/defaultArt';
import { feedService, mediaCallService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';
import { toastService } from '../../services/ToastService';
import type { CallParticipant, MediaCallState } from '../../services/MediaCallService';
import { cssImageUrl } from '../vtt/playerView/helpers';
import { Avatar, Badge, Button, ChoiceCard, EmptyState, Field, IconButton, ListItem, Notice, SectionHeader, Surface, TextControl, Toolbar } from '../components/common';
import { MediaStreamVideo } from './MediaStreamVideo';
import './call-room.css';

interface CallRoomAppProps {
  basePath: string;
}

export function CallRoomApp({ basePath }: CallRoomAppProps) {
  const sessionParams = typeof window === 'undefined'
    ? null
    : parseCallSessionLocation(window.location.pathname, basePath);
  const roomId = sessionParams?.roomId ?? '';
  const session = useStream(p2pSessionService.session$);
  const call = useStream(mediaCallService.call$);
  const feed = useStream(feedService.feed$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const [nameDraft, setNameDraft] = useState(() => roomId ? readStoredCallName(roomId) : '');
  const [chatDraft, setChatDraft] = useState('');
  const autoJoinKey = useRef<string | null>(null);
  const storedSession = useMemo(() => roomId ? readStoredCallSession(roomId) : null, [roomId]);
  const connectedToRoom = session.connected && session.roomId === roomId;
  const connectingToRoom = session.status === 'connecting' && session.roomId === roomId;
  const liveScene = sceneTable.scenes[sceneTable.liveSceneId] ?? sceneTable.scenes[sceneTable.activeSceneId] ?? sceneTable.scenes[sceneTable.sceneOrder[0]];
  const sceneBackgroundImage = liveScene
    ? `linear-gradient(180deg, rgba(7, 9, 12, 0.08), rgba(7, 9, 12, 0.38)), url("${cssImageUrl(liveScene.backgroundUrl || defaultSceneImageUrl(liveScene))}")`
    : '';
  const playerSeats = useMemo(() => Object.values(sceneTable.participants).filter((participant) => participant.role === 'player'), [sceneTable.participants]);
  const feedMessages = feed.filter((entry) => entry.type === 'message').slice(-8);

  useEffect(() => {
    if (!roomId || typeof window === 'undefined' || !isBareCallsPath(window.location.pathname, basePath)) return;
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

  const joinCall = async (displayName = nameDraft): Promise<void> => {
    const name = displayName.trim();
    if (!roomId || !name) {
      toastService.show('Введите имя для звонка.', 'warning');
      return;
    }
    writeStoredCallName(roomId, name);
    mediaCallService.setDisplayName(name);
    if (connectedToRoom) {
      mediaCallService.setRoom({ roomId, displayName: name, role: session.role === 'gm' ? 'gm' : 'player', active: true });
      return;
    }
    const role = storedSession?.role ?? 'player';
    if (role === 'gm') {
      await p2pSessionService.startGmRoom({
        roomId,
        participantName: name
      });
    } else {
      await p2pSessionService.startPlayerRoom({
        roomId,
        participantName: name
      });
    }
    mediaCallService.setRoom({ roomId, displayName: name, role, active: true });
  };

  const selectSeatName = (name: string) => {
    setNameDraft(name);
    void joinCall(name);
  };

  const openGame = () => {
    const route = session.role === 'gm' ? 'gm' : 'join';
    window.dispatchEvent(new CustomEvent('daggerheart-play:navigate-route', {
      detail: { route, roomId }
    }));
  };

  const sendChat = () => {
    const body = chatDraft.trim();
    const authorName = call.displayName.trim() || nameDraft.trim() || 'Гость';
    if (!body) return;
    setChatDraft('');
    void p2pSessionService.sendChatMessage(authorName, body);
  };

  if (!roomId) {
    return (
      <section className="call-room call-room--empty">
        <EmptyState tone="panel" title="Комната звонка не найдена" />
      </section>
    );
  }

  const participantsList = [
    localParticipantFromCall(call),
    ...Object.values(call.remoteParticipants).filter((participant) => participant.connected)
  ];

  return (
    <main className="call-room">
      <div className="call-room__scene-image" aria-hidden="true" style={{ backgroundImage: sceneBackgroundImage }} />
      <div className="call-room__backdrop" aria-hidden="true" />
      <section className="call-room__stage" aria-label="Видео звонок">
        <header className="call-room__topbar">
          <div>
            <span>Комната {roomId}</span>
            <h1>Видеозвонок</h1>
          </div>
          <div className="call-room__top-actions">
            <Button type="button" iconBefore={<Swords size={16} aria-hidden="true" />} onClick={openGame}>
              В игру
            </Button>
          </div>
        </header>

        {!connectedToRoom && !connectingToRoom && (
          <Surface className="call-room__join" aria-label="Вход в звонок">
            <SectionHeader
              title="Представьтесь"
              subtitle="Можно выбрать созданного игрока или войти с произвольным именем."
              actions={<UserRound size={20} aria-hidden="true" />}
            />
            <Field label="Имя">
              <TextControl value={nameDraft} onInput={(event) => setNameDraft(event.currentTarget.value)} placeholder="Как вас показать в звонке" />
            </Field>
            {playerSeats.length > 0 && (
              <div className="call-room__seat-picks">
                {playerSeats.map((seat) => (
                  <ChoiceCard key={seat.id} onClick={() => selectSeatName(seat.name)}>
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

        <div className={`call-room__grid call-room__grid--${Math.min(6, Math.max(1, participantsList.length))}`}>
          {participantsList.map((participant) => (
            <CallVideoTile key={participant.participantId} participant={participant} local={participant.participantId === call.localParticipantId} />
          ))}
        </div>

        <Toolbar className="call-room__controls" aria-label="Управление звонком">
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
        <Notice className="call-room__status" tone={call.status === 'error' || call.status === 'permission-denied' ? 'error' : 'info'}>
          {connectingToRoom ? 'Подключаемся к комнате...' : call.message || session.message}
        </Notice>
      </section>

      <aside className="call-room__side" aria-label="Участники и чат">
        <Surface className="call-room__panel call-room__participants">
          <SectionHeader
            title="Участники"
            actions={<Badge tone="gold">{participantsList.length}</Badge>}
          />
          {participantsList.map((participant) => (
            <ListItem
              key={participant.participantId}
              title={participant.displayName || 'Гость'}
              density="compact"
              leftAccessory={<Avatar fallback={initials(participant.displayName)} size="sm" />}
              rightAccessory={
                <Toolbar className="call-room__participant-status">
                  {participant.handRaised && <Hand size={15} aria-label="Рука поднята" />}
                  {participant.micMuted ? <MicOff size={15} aria-label="Микрофон выключен" /> : <Mic size={15} aria-label="Микрофон включен" />}
                  {participant.cameraOff ? <VideoOff size={15} aria-label="Камера выключена" /> : <Video size={15} aria-label="Камера включена" />}
                </Toolbar>
              }
            />
          ))}
        </Surface>
        <Surface className="call-room__panel call-room__chat">
          <SectionHeader
            title="Чат"
            subtitle="Сообщения общей ленты"
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
    </main>
  );
}

function CallVideoTile({ local, participant }: { local?: boolean; participant: CallParticipant }) {
  return (
    <article className={`call-video-tile ${participant.cameraOff || !participant.stream ? 'dh-camera-off' : ''}`}>
      {participant.stream && !participant.cameraOff ? (
        <MediaStreamVideo key={mediaStreamRenderKey(participant.stream)} muted={local} stream={participant.stream} />
      ) : (
        <div className="call-video-tile__avatar" aria-hidden="true">{initials(participant.displayName)}</div>
      )}
      <footer>
        <span>{participant.displayName || 'Гость'}{local ? ' · вы' : ''}</span>
        <div>
          {participant.handRaised && <Hand size={14} aria-label="Рука поднята" />}
          {participant.micMuted ? <MicOff size={14} aria-label="Микрофон выключен" /> : <Mic size={14} aria-label="Микрофон включен" />}
        </div>
      </footer>
    </article>
  );
}

function mediaStreamRenderKey(stream: MediaStream): string {
  return `${stream.id}:${stream.getVideoTracks().map((track) => track.id).join(',')}`;
}

function localParticipantFromCall(call: MediaCallState): CallParticipant {
  return {
    type: 'callPresence',
    participantId: call.localParticipantId,
    displayName: call.displayName || 'Вы',
    role: call.role,
    connected: Boolean(call.roomId),
    micMuted: call.micMuted,
    cameraOff: call.cameraOff,
    handRaised: call.handRaised,
    updatedAt: '',
    stream: call.localStream
  };
}

function isBareCallsPath(pathname: string, basePath: string): boolean {
  const normalizedBase = basePath.replace(/\/+$/, '');
  const strippedPath = normalizedBase && pathname.startsWith(normalizedBase)
    ? pathname.slice(normalizedBase.length) || '/'
    : pathname;
  return (strippedPath.replace(/\/+$/, '') || '/') === '/calls';
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
