/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { MonitorPlay } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { readStoredPlayerSeatId, writeStoredPlayerSeatId } from '../../domain/p2p/sessionLinks';
import type { Character } from '../../domain/rules/types';
import type { TableParticipant } from '../../domain/tabletop/types';
import { characterService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';
import { Button, ChoiceCard, EmptyState, Notice, SectionHeader, Surface, Toolbar } from '../components/common';

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
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const [selectedSeatId, setSelectedSeatId] = useState(() => readStoredPlayerSeatId(roomId));
  const [snapshotWaitExpired, setSnapshotWaitExpired] = useState(false);
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

  const enterPlayerTable = () => {
    if (!selectedSeat) return;
    writeStoredPlayerSeatId(roomId, selectedSeat.id);
    onEnterPlayerRoom(roomId, selectedSeat.id);
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
            <SectionHeader title="Игроки" subtitle={joinStatus} actions={<MonitorPlay size={20} aria-hidden="true" />} />
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
              {playerSeats.length === 0 && (
                <EmptyState size="sm" title={joining || connectedToRoom ? 'Ждем список игроков от мастера' : session.message} />
              )}
            </div>
            <Toolbar className="role-entry__inline-actions">
              <Button type="button" onClick={onBackToLobby}>
                Сменить комнату
              </Button>
              <Button variant="primary" type="button" disabled={!selectedSeat} onClick={enterPlayerTable}>
                Войти за игрока
              </Button>
            </Toolbar>
          </Surface>
        </div>
        <Notice className="role-entry__message">{session.message}</Notice>
      </div>
    </section>
  );
}

function characterForSeat(seat: TableParticipant, characterEntities: Record<string, Character>): Character | null {
  return seat.actorIds[0] ? characterEntities[seat.actorIds[0]] ?? null : null;
}
