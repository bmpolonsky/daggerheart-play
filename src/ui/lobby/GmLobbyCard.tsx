/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Crown, RefreshCw, Trash2, Video } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { p2pNetworkSettings$ } from '../../domain/p2p/networkSettings';
import { characterService, gameService, gmLobbyService, sceneTableService } from '../../services/serviceRegistry';
import { Button, ConfirmDialog, EmptyState, IconButton, SectionHeader, SelectControl, Surface, TextControl, Toolbar } from '../components/common';
import type { LobbyInviteContext } from './SessionLobby';

interface GmLobbyCardProps {
  inviteContext: LobbyInviteContext;
  onEnterGm: () => void;
  onOpenCall: (roomId: string) => void;
}

export function GmLobbyCard({ inviteContext, onEnterGm, onOpenCall }: GmLobbyCardProps) {
  const { gmName } = useStream(gameService.game$);
  const { entities: characterEntities, order: characterOrder } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  const lobby = useStream(gmLobbyService.lobby$);
  useStream(p2pNetworkSettings$);
  const [restoringSession, setRestoringSession] = useState(true);
  const [roomRefreshOpen, setRoomRefreshOpen] = useState(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const displayedInviteUrl = restoringSession ? '' : gmLobbyService.previewInviteUrl(inviteContext, lobby);
  const displayedGmRoomId = gmLobbyService.getRoomId(lobby);
  const roomCodeRefresh = gmLobbyService.roomCodeRefreshView(lobby);
  const isRoomCodeRefreshCoolingDown = roomCodeRefresh.remainingSeconds > 0;
  const roomCodeRefreshTitle = isRoomCodeRefreshCoolingDown ? `Обновить код можно через ${roomCodeRefresh.remainingSeconds} с` : 'Обновить код комнаты';

  useEffect(() => {
    let active = true;
    void gmLobbyService.restoreSession(gmName).finally(() => {
      if (active) setRestoringSession(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const createSession = async () => {
    return await gmLobbyService.createSession({
      participantName: gmName,
      ...inviteContext
    });
  };

  const copyInvite = async () => {
    await gmLobbyService.copyInvite(displayedInviteUrl, {
      copied: 'Ссылка скопирована.',
      manual: 'Скопируйте ссылку вручную.'
    });
  };

  const requestRoomCodeRefresh = () => {
    if (gmLobbyService.hasConnectedPlayers()) {
      setRoomRefreshOpen(true);
      return;
    }
    void gmLobbyService.refreshRoomCode();
  };

  const enterGm = () => {
    void createSession().then((created) => {
      if (created) onEnterGm();
    });
  };

  const enterCall = () => {
    void createSession().then((created) => {
      if (created) onOpenCall(created.roomId);
    });
  };

  return (
    <Surface className="role-entry__card role-entry__gm-card" aria-label="Создать сессию мастера">
      <SectionHeader title="Мастер" actions={<Crown size={20} aria-hidden="true" />} />
      <div className="role-entry__invite-grid">
        <label>
          <span>Код комнаты</span>
          <div className="role-entry__inline-control">
            <TextControl value={displayedGmRoomId} readOnly />
            <IconButton
              variant="ghost"
              size="sm"
              type="button"
              title={roomCodeRefreshTitle}
              aria-label="Обновить код комнаты"
              disabled={restoringSession || isRoomCodeRefreshCoolingDown}
              onClick={requestRoomCodeRefresh}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </IconButton>
          </div>
        </label>
        <label>
          <span>Ссылка для игроков</span>
          <div className="role-entry__inline-control">
            <TextControl readOnly aria-label="Ссылка приглашения" value={displayedInviteUrl} placeholder={restoringSession ? 'Восстанавливаем комнату...' : 'Появится после ввода кода комнаты'} />
            <IconButton type="button" size="sm" title="Копировать ссылку игрока" aria-label="Копировать ссылку игрока" disabled={restoringSession || !displayedInviteUrl} onClick={() => void copyInvite()}>
              <Copy size={15} aria-hidden="true" />
            </IconButton>
          </div>
        </label>
      </div>
      <div className="role-entry__players">
        <SectionHeader
          title="Игроки"
          actions={
          <Button size="sm" type="button" onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
            Добавить
          </Button>
          }
        />
        {playerSeats.map((seat) => (
          <article className="role-entry__player-row" key={seat.id}>
            <TextControl
              aria-label="Имя игрока"
              value={seat.name}
              onInput={(event) => sceneTableService.updatePlayerSeat(seat.id, { name: event.currentTarget.value })}
            />
            <SelectControl
              aria-label="Персонаж игрока"
              value={seat.actorIds[0] ?? ''}
              onChange={(event) => sceneTableService.updatePlayerSeat(seat.id, { characterId: event.currentTarget.value || null })}
            >
              <option value="">Не назначен</option>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>{character.name}</option>
              ))}
            </SelectControl>
            <IconButton variant="ghost" size="sm" type="button" title="Удалить игрока" aria-label={`Удалить игрока ${seat.name}`} onClick={() => sceneTableService.removePlayerSeat(seat.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </article>
        ))}
        {playerSeats.length === 0 && <EmptyState size="sm" title="Добавьте игроков" />}
      </div>
      <Toolbar className="role-entry__inline-actions">
        <Button variant="primary" type="button" disabled={restoringSession} onClick={enterGm}>
          {restoringSession ? 'Восстанавливаем...' : 'Открыть игру'}
        </Button>
        <Button
          className="role-entry__call-link"
          variant="ghost"
          size="xs"
          type="button"
          iconBefore={<Video size={13} aria-hidden="true" />}
          title="Открыть экспериментальный созвон"
          disabled={restoringSession}
          onClick={enterCall}
        >
          Созвон
        </Button>
      </Toolbar>
      {roomRefreshOpen && (
        <ConfirmDialog
          title="Создать новый код комнаты?"
          body="Подключённые игроки будут отключены от старой комнаты. Им понадобится новая ссылка."
          confirmLabel="Обновить код"
          destructive={false}
          onCancel={() => setRoomRefreshOpen(false)}
          onConfirm={() => {
            setRoomRefreshOpen(false);
            void gmLobbyService.refreshRoomCode();
          }}
        />
      )}
    </Surface>
  );
}
