/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Mic, MicOff, MonitorPlay, Video, VideoOff } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { readStoredPlayerSeatId, writeStoredPlayerSeatId } from '../../domain/p2p/sessionLinks';
import type { Character } from '../../domain/rules/types';
import type { TableParticipant } from '../../domain/tabletop/types';
import { audioService, characterService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';
import { Button } from '../components/common/Button';
import { ChoiceCard } from '../components/common/ChoiceCard';
import { Surface } from '../components/common/Surface';

interface PlayerJoinLobbyProps {
  password?: string;
  roomId: string;
  onBackToLobby: () => void;
  onEnterPlayerRoom: (roomId: string, seatId: string) => void;
}

export function PlayerJoinLobby({ onBackToLobby, onEnterPlayerRoom, password = '', roomId }: PlayerJoinLobbyProps) {
  const { entities: characterEntities } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  const session = useStream(p2pSessionService.session$);
  const audioState = useStream(audioService.audio$);
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
          <Surface className="role-entry__card player-join-lobby__seats" aria-label="Игроки комнаты">
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
                  <ChoiceCard
                    selected={selectedSeatId === seat.id}
                    key={seat.id}
                    type="button"
                    onClick={() => setSelectedSeatId(seat.id)}
                  >
                    <strong>{seat.name}</strong>
                    <span>{character ? `${character.name} / ${character.className} ${character.level}` : 'Персонаж не назначен'}</span>
                  </ChoiceCard>
                );
              })}
              {playerSeats.length === 0 && <p>{joining || connectedToRoom ? 'Ждем список игроков от мастера.' : session.message}</p>}
            </div>
            <div className="role-entry__inline-actions">
              <Button type="button" onClick={onBackToLobby}>
                Сменить комнату
              </Button>
              <Button variant="primary" type="button" disabled={!selectedSeat} onClick={enterPlayerTable}>
                Войти за игрока
              </Button>
            </div>
          </Surface>
          <Surface className="role-entry__card player-join-lobby__media" aria-label="Аудио и видео">
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
              <Button type="button" disabled={!connectedToRoom && !joining} iconBefore={audioState.voiceStatus === 'live' ? <Mic size={15} aria-hidden="true" /> : <MicOff size={15} aria-hidden="true" />} onClick={() => void audioService.toggleVoiceChat(selectedSeat?.name.trim() || undefined)}>
                {audioState.voiceStatus === 'live' ? 'Микрофон включен' : 'Проверить микрофон'}
              </Button>
              <Button type="button" iconBefore={videoStream ? <Video size={15} aria-hidden="true" /> : <VideoOff size={15} aria-hidden="true" />} onClick={() => void toggleCamera()}>
                {videoStream ? 'Камера включена' : 'Проверить камеру'}
              </Button>
            </div>
          </Surface>
        </div>
        <p className="role-entry__message">{session.message}</p>
      </div>
    </section>
  );
}

function characterForSeat(seat: TableParticipant, characterEntities: Record<string, Character>): Character | null {
  return seat.actorIds[0] ? characterEntities[seat.actorIds[0]] ?? null : null;
}
