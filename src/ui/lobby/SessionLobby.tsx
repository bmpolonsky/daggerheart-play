/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Crown, Download, Link2, Mic, MicOff, MonitorPlay, Trash2, Upload, Video, VideoOff } from 'lucide-react';
import { useStore } from '../../core/hooks/useStore';
import { formatDateTime } from '../../core/utils/date';
import { normalizeSessionRoomId, readStoredPlayerSeatId, writeStoredPlayerSeatId } from '../../domain/p2p/sessionLinks';
import type { Character } from '../../domain/rules/types';
import type { TableParticipant } from '../../domain/tabletop/types';
import { audioService, gameService, characterService, importExportService, persistenceService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';

export interface LobbyInviteContext {
  origin: string;
  basePath?: string;
}

interface SessionLobbyProps {
  inviteContext: LobbyInviteContext;
  onEnterGm: () => void;
  onJoinRoom: (roomId: string) => void;
}

interface PlayerJoinLobbyProps {
  password?: string;
  roomId: string;
  onBackToLobby: () => void;
  onEnterPlayerRoom: (roomId: string, seatId: string) => void;
}

interface StoredGameView {
  id: string;
  name: string;
  updatedAt: string | null;
  active: boolean;
}

export function SessionLobby({ inviteContext, onEnterGm, onJoinRoom }: SessionLobbyProps) {
  const { gmName } = useStore(gameService.gameStore);
  const { entities: characterEntities, order: characterOrder } = useStore(characterService.charactersStore);
  const { participants } = useStore(sceneTableService.sceneTableStore);
  useStore(p2pSessionService.sessionStore);
  const { message: inviteMessage } = useStore(p2pSessionService.inviteStore);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [fileMessage, setFileMessage] = useState('');
  const [storedGames, setStoredGames] = useState<StoredGameView[]>([]);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const restoreAttempted = useRef(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const displayedInviteUrl = p2pSessionService.previewInviteUrl(inviteContext);
  const displayedGmRoomId = p2pSessionService.getGmRoomId();
  const activeStoredGame = storedGames.find((game) => game.active) ?? null;

  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    void p2pSessionService.restoreActiveSession('gm', gmName);
  }, [gmName]);

  useEffect(() => {
    let cancelled = false;
    void persistenceService.listStoredGames().then((games) => {
      if (!cancelled) setStoredGames(games);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStoredGames = async () => {
    setStoredGames(await persistenceService.listStoredGames());
  };

  const createSession = async (): Promise<boolean> => {
    try {
      await p2pSessionService.createGmInviteFromDraft({
        participantName: gmName,
        ...inviteContext
      });
      return true;
    } catch {
      return false;
    }
  };

  const copyInvite = async () => {
    if (!displayedInviteUrl) return;
    try {
      await navigator.clipboard?.writeText(displayedInviteUrl);
      p2pSessionService.setInviteMessage('Ссылка скопирована.');
    } catch {
      p2pSessionService.setInviteMessage('Скопируйте ссылку вручную.');
    }
  };

  const enterGm = () => {
    void createSession().then((created) => {
      if (created) onEnterGm();
    });
  };

  const joinPlayer = () => {
    const normalized = normalizeSessionRoomId(joinRoomId, '');
    if (!normalized) {
      p2pSessionService.setInviteMessage('Введите код комнаты.');
      return;
    }
    onJoinRoom(normalized);
  };

  const importGameFile = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importExportService.importFile(file);
      setFileMessage(result.ok ? `Импортировано: ${file.name}` : result.message);
      if (result.ok) {
        await refreshStoredGames();
      }
    } catch {
      setFileMessage('Не удалось прочитать файл.');
    } finally {
      input.value = '';
    }
  };

  const createStoredGame = async () => {
    const id = await persistenceService.createStoredGame();
    if (!id) {
      setFileMessage('Локальное хранилище недоступно.');
      return;
    }
    await refreshStoredGames();
    setFileMessage('Создана новая игра.');
  };

  const switchStoredGame = async (id: string) => {
    const ok = await persistenceService.switchStoredGame(id);
    setFileMessage(ok ? 'Игра открыта.' : 'Не удалось открыть игру.');
    await refreshStoredGames();
  };

  const removeStoredGame = async (game: StoredGameView) => {
    const name = game.name || 'Без названия';
    const confirmed = window.confirm(`Удалить игру "${name}" из локального хранилища?`);
    if (!confirmed) return;
    const ok = await persistenceService.removeStoredGame(game.id);
    setFileMessage(ok ? 'Игра удалена.' : 'Не удалось удалить игру.');
    await refreshStoredGames();
  };

  return (
    <section className="role-entry" aria-label="Выбор роли">
      <div className="role-entry__scene" aria-hidden="true" />
      <div className="role-entry__content">
        <div className="role-entry__title">
          <div>
            <h1>Лобби игры</h1>
          </div>
        </div>
        <div className="role-entry__lobby-shell">
          <div className="role-entry__actions role-entry__actions--lobby">
            <section className="role-entry__card role-entry__gm-card" aria-label="Создать сессию мастера">
              <header>
                <Crown size={20} />
                <div>
                  <strong>Мастер</strong>
                  <span>Управление комнатой и местами игроков.</span>
                </div>
              </header>
              <label>
                <span>Код комнаты</span>
                <input
                  value={displayedGmRoomId}
                  readOnly
                />
              </label>
              <div className="role-entry__players">
                <header>
                  <strong>Игроки</strong>
                  <button className="dh-button" type="button" onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
                    Добавить
                  </button>
                </header>
                {playerSeats.map((seat) => (
                  <article className="role-entry__player-row" key={seat.id}>
                    <input
                      aria-label="Имя игрока"
                      value={seat.name}
                      onInput={(event) => sceneTableService.updatePlayerSeat(seat.id, { name: event.currentTarget.value })}
                    />
                    <select
                      aria-label="Персонаж игрока"
                      value={seat.actorIds[0] ?? ''}
                      onChange={(event) => sceneTableService.updatePlayerSeat(seat.id, { characterId: event.currentTarget.value || null })}
                    >
                      <option value="">Не назначен</option>
                      {characterOptions.map((character) => (
                        <option key={character.id} value={character.id}>{character.name}</option>
                      ))}
                    </select>
                    <button className="role-entry__icon-action" type="button" title="Удалить игрока" aria-label={`Удалить игрока ${seat.name}`} onClick={() => sceneTableService.removePlayerSeat(seat.id)}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </article>
                ))}
                {playerSeats.length === 0 && <p>Добавьте игроков, чтобы они выбирали свои места при входе.</p>}
              </div>
              <div className="role-entry__inline-actions">
                <button className="dh-button dh-variant-primary" type="button" onClick={enterGm}>
                  Открыть игру
                </button>
              </div>
              <div className="role-entry__invite-line">
                <label>
                  <span>Ссылка игрока</span>
                  <input readOnly aria-label="Ссылка приглашения" value={displayedInviteUrl} placeholder="Появится после ввода кода комнаты" />
                </label>
                <button className="dh-button" type="button" disabled={!displayedInviteUrl} onClick={() => void copyInvite()}>
                  <Link2 size={15} />
                  Копировать
                </button>
              </div>
            </section>
            <section className="role-entry__card role-entry__join-card" aria-label="Присоединиться игроком">
              <header>
                <MonitorPlay size={20} />
                <div>
                  <strong>Игрок</strong>
                  <span>Быстрый вход в комнату.</span>
                </div>
              </header>
              <label>
                <span>Код комнаты</span>
                <input value={joinRoomId} onInput={(event) => setJoinRoomId(event.currentTarget.value)} placeholder="Например 7K2Q" />
              </label>
              <button className="dh-button dh-variant-primary" type="button" onClick={joinPlayer}>
                Присоединиться
              </button>
            </section>
          </div>
          <section className="role-entry__card role-entry__games-card" aria-label="Управление сохранениями">
            <header>
              <Download size={20} />
              <div>
                <strong>Сохранения</strong>
              </div>
              <div className="role-entry__storage-tools">
                <button className="dh-button" type="button" onClick={() => void createStoredGame()}>
                  Новая
                </button>
                <button className="dh-button" type="button" title={activeStoredGame ? 'Импорт заменит текущую открытую игру' : 'Импортировать игру'} onClick={() => importFileRef.current?.click()}>
                  <Upload size={15} />
                  Импорт
                </button>
                {activeStoredGame && (
                  <button className="dh-button" type="button" onClick={() => void importExportService.downloadArchive()}>
                    <Download size={15} />
                    Экспорт
                  </button>
                )}
              </div>
            </header>
            <div className="role-entry__game-list">
              {storedGames.map((game) => (
                <article className={game.active ? 'dh-is-active' : ''} key={game.id}>
                  <div>
                    <strong>{game.name || 'Без названия'}</strong>
                    <span>{game.updatedAt ? formatDateTime(game.updatedAt) : 'Без сохранения'}</span>
                  </div>
                  <div className="role-entry__game-actions">
                    {!game.active && (
                      <button type="button" onClick={() => void switchStoredGame(game.id)}>
                        Открыть
                      </button>
                    )}
                    <button className="role-entry__icon-action" type="button" title="Удалить игру" aria-label={`Удалить игру ${game.name || 'Без названия'}`} onClick={() => void removeStoredGame(game)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
              {storedGames.length === 0 && <p>Сохранения появятся здесь после первого изменения игры.</p>}
            </div>
            <input
              ref={importFileRef}
              className="visually-hidden"
              type="file"
              accept="application/json,application/zip,.json,.zip,.dhgame"
              onChange={importGameFile}
            />
          </section>
        </div>
        {(fileMessage || inviteMessage) && <p className="role-entry__message">{fileMessage || inviteMessage}</p>}
      </div>
    </section>
  );
}

export function PlayerJoinLobby({ onBackToLobby, onEnterPlayerRoom, password = '', roomId }: PlayerJoinLobbyProps) {
  const { entities: characterEntities } = useStore(characterService.charactersStore);
  const { participants } = useStore(sceneTableService.sceneTableStore);
  const session = useStore(p2pSessionService.sessionStore);
  const audioState = useStore(audioService.audioStore);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const [selectedSeatId, setSelectedSeatId] = useState(() => readStoredPlayerSeatId(roomId));
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoMessage, setVideoMessage] = useState('Камера выключена.');
  const [snapshotWaitExpired, setSnapshotWaitExpired] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connectKey = useRef<string | null>(null);
  const selectedSeat = playerSeats.find((seat) => seat.id === selectedSeatId) ?? null;
  const connectedToRoom = session.connected && session.role === 'player' && session.roomId === roomId;
  const joining = session.status === 'connecting' && session.role === 'player' && session.roomId === roomId;
  const waitingForSnapshot = connectedToRoom && !session.lastSnapshotAt;
  const joinStatus = session.lastSnapshotAt
    ? 'Список получен от мастера.'
    : snapshotWaitExpired
      ? 'Мастера в комнате пока не видно. Откройте игру мастера с этим кодом или смените комнату.'
      : session.message;

  useEffect(() => {
    const key = `${roomId}:${password}`;
    if (connectedToRoom || joining || connectKey.current === key) return;
    connectKey.current = key;
    void p2pSessionService.startPlayerRoom({
      roomId,
      password,
      participantName: selectedSeat?.name.trim() || undefined
    }).catch(() => {
      connectKey.current = null;
    });
  }, [connectedToRoom, joining, password, roomId, selectedSeat?.name]);

  useEffect(() => {
    if (selectedSeatId && playerSeats.some((seat) => seat.id === selectedSeatId)) return;
    setSelectedSeatId(playerSeats[0]?.id ?? null);
  }, [playerSeats, selectedSeatId]);

  useEffect(() => {
    setSnapshotWaitExpired(false);
    if (!waitingForSnapshot) return;
    const timeoutId = window.setTimeout(() => setSnapshotWaitExpired(true), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [roomId, waitingForSnapshot]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  useEffect(() => () => {
    videoStream?.getTracks().forEach((track) => track.stop());
  }, [videoStream]);

  const enterPlayerTable = () => {
    if (!selectedSeat) return;
    writeStoredPlayerSeatId(roomId, selectedSeat.id);
    onEnterPlayerRoom(roomId, selectedSeat.id);
  };

  const toggleCamera = async () => {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
      setVideoMessage('Камера выключена.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setVideoMessage('Камера недоступна в этом браузере.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setVideoStream(stream);
      setVideoMessage('Камера включена.');
    } catch {
      setVideoMessage('Не удалось включить камеру.');
    }
  };

  return (
    <section className="role-entry" aria-label="Лобби игрока">
      <div className="role-entry__scene" aria-hidden="true" />
      <div className="role-entry__content role-entry__content--join">
        <div className="role-entry__title">
          <span>Комната {roomId}</span>
          <h1>Выберите игрока</h1>
        </div>
        <div className="player-join-lobby">
          <section className="role-entry__card player-join-lobby__seats" aria-label="Игроки комнаты">
            <header>
              <MonitorPlay size={20} />
              <div>
                <strong>Игроки</strong>
                <span>{joinStatus}</span>
              </div>
            </header>
            <div className="player-join-lobby__seat-list">
              {playerSeats.map((seat) => {
                const character = characterForSeat(seat, characterEntities);
                return (
                  <button
                    className={selectedSeatId === seat.id ? 'dh-is-active' : ''}
                    key={seat.id}
                    type="button"
                    onClick={() => setSelectedSeatId(seat.id)}
                  >
                    <strong>{seat.name}</strong>
                    <span>{character ? `${character.name} / ${character.className} ${character.level}` : 'Персонаж не назначен'}</span>
                  </button>
                );
              })}
              {playerSeats.length === 0 && <p>{joining || connectedToRoom ? 'Ждем список игроков от мастера.' : session.message}</p>}
            </div>
            <div className="role-entry__inline-actions">
              <button className="dh-button" type="button" onClick={onBackToLobby}>
                Сменить комнату
              </button>
              <button className="dh-button dh-variant-primary" type="button" disabled={!selectedSeat} onClick={enterPlayerTable}>
                Войти за игрока
              </button>
            </div>
          </section>
          <section className="role-entry__card player-join-lobby__media" aria-label="Аудио и видео">
            <header>
              <Mic size={20} />
              <div>
                <strong>Аудио и видео</strong>
                <span>{audioState.voiceMessage}</span>
              </div>
            </header>
            <div className="player-join-lobby__media-preview">
              {videoStream ? <video ref={videoRef} autoPlay muted playsInline /> : <VideoOff size={32} />}
            </div>
            <span className="player-join-lobby__media-status">{videoMessage}</span>
            <div className="role-entry__inline-actions">
              <button className="dh-button" type="button" disabled={!connectedToRoom && !joining} onClick={() => void audioService.toggleVoiceChat(selectedSeat?.name.trim() || undefined)}>
                {audioState.voiceStatus === 'live' ? <Mic size={15} /> : <MicOff size={15} />}
                {audioState.voiceStatus === 'live' ? 'Микрофон включен' : 'Проверить микрофон'}
              </button>
              <button className="dh-button" type="button" onClick={() => void toggleCamera()}>
                {videoStream ? <Video size={15} /> : <VideoOff size={15} />}
                {videoStream ? 'Камера включена' : 'Проверить камеру'}
              </button>
            </div>
          </section>
        </div>
        <p className="role-entry__message">{session.message}</p>
      </div>
    </section>
  );
}

function characterForSeat(seat: TableParticipant, characterEntities: Record<string, Character>): Character | null {
  return seat.actorIds[0] ? characterEntities[seat.actorIds[0]] ?? null : null;
}
