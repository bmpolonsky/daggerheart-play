/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Copy, Crown, RefreshCw, Trash2 } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { p2pNetworkSettings$ } from '../../domain/p2p/networkSettings';
import { characterService, gameService, gmLobbyService, sceneTableService } from '../../services/serviceRegistry';
import { Button, EmptyState, IconButton, SectionHeader, SelectControl, Surface, TextControl, Toolbar } from '../components/common';
import type { LobbyInviteContext } from './SessionLobby';

interface GmLobbyCardProps {
  inviteContext: LobbyInviteContext;
  onEnterGm: () => void;
}

export function GmLobbyCard({ inviteContext, onEnterGm }: GmLobbyCardProps) {
  const { gmName } = useStream(gameService.game$);
  const { entities: characterEntities, order: characterOrder } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  const lobby = useStream(gmLobbyService.lobby$);
  useStream(p2pNetworkSettings$);
  const restoreAttempted = useRef(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const displayedInviteUrl = gmLobbyService.previewInviteUrl(inviteContext, lobby);
  const displayedGmRoomId = gmLobbyService.getRoomId(lobby);
  const roomCodeRefresh = gmLobbyService.roomCodeRefreshView(lobby);
  const isRoomCodeRefreshCoolingDown = roomCodeRefresh.remainingSeconds > 0;
  const roomCodeRefreshTitle = isRoomCodeRefreshCoolingDown ? `Обновить код можно через ${roomCodeRefresh.remainingSeconds} с` : 'Обновить код комнаты';

  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    void gmLobbyService.restoreSession(gmName);
  }, [gmName]);

  const createSession = async (): Promise<boolean> => {
    return Boolean(await gmLobbyService.createSession({
      participantName: gmName,
      ...inviteContext
    }));
  };

  const copyInvite = async () => {
    await gmLobbyService.copyInvite(displayedInviteUrl, {
      copied: 'Ссылка скопирована.',
      manual: 'Скопируйте ссылку вручную.'
    });
  };

  const refreshRoomCode = async () => {
    if (
      gmLobbyService.hasConnectedPlayers()
      && !window.confirm('Игроки будут отключены от старой комнаты. Создать новый код и новую ссылку?')
    ) {
      return;
    }
    await gmLobbyService.refreshRoomCode();
  };

  const enterGm = () => {
    void createSession().then((created) => {
      if (created) onEnterGm();
    });
  };

  return (
    <Surface className="role-entry__card role-entry__gm-card" aria-label="Создать сессию мастера">
      <SectionHeader title="Мастер" subtitle="Управление комнатой и местами игроков." actions={<Crown size={20} aria-hidden="true" />} />
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
              disabled={isRoomCodeRefreshCoolingDown}
              onClick={() => void refreshRoomCode()}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </IconButton>
          </div>
        </label>
        <label>
          <span>Ссылка для игроков</span>
          <div className="role-entry__inline-control">
            <TextControl readOnly aria-label="Ссылка приглашения" value={displayedInviteUrl} placeholder="Появится после ввода кода комнаты" />
            <IconButton type="button" size="sm" title="Копировать ссылку игрока" aria-label="Копировать ссылку игрока" disabled={!displayedInviteUrl} onClick={() => void copyInvite()}>
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
        {playerSeats.length === 0 && <EmptyState size="sm" title="Добавьте игроков" body="После этого они смогут выбирать свои места при входе." />}
      </div>
      <Toolbar className="role-entry__inline-actions">
        <Button variant="primary" type="button" onClick={enterGm}>
          Открыть игру
        </Button>
      </Toolbar>
    </Surface>
  );
}
