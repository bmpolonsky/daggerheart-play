/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { Copy, Crown, RefreshCw, Trash2 } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { p2pNetworkSettings$ } from '../../domain/p2p/networkSettings';
import { characterService, gameService, gmLobbyService, sceneTableService } from '../../services/serviceRegistry';
import { Button, ConfirmDialog, EmptyState, IconButton, Notice, SectionHeader, SelectControl, Surface, TextControl, Toolbar } from '../components/common';
import type { LobbyInviteContext, MasterAccountState } from './SessionLobby';

interface GmLobbyCardProps {
  inviteContext: LobbyInviteContext;
  account: MasterAccountState;
  onEnterGm: () => void;
}

export function GmLobbyCard({ account, inviteContext, onEnterGm }: GmLobbyCardProps) {
  const { gmName } = useStream(gameService.game$);
  const { entities: characterEntities, order: characterOrder } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  const lobby = useStream(gmLobbyService.lobby$);
  useStream(p2pNetworkSettings$);
  const [restoringSession, setRestoringSession] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [roomRefreshOpen, setRoomRefreshOpen] = useState(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const displayedInviteUrl = restoringSession ? '' : gmLobbyService.previewInviteUrl(inviteContext, lobby);
  const displayedGmRoomId = gmLobbyService.getRoomId(lobby);
  const roomCodeRefresh = gmLobbyService.roomCodeRefreshView(lobby);
  const isRoomCodeRefreshCoolingDown = roomCodeRefresh.remainingSeconds > 0;
  const roomCodeRefreshTitle = isRoomCodeRefreshCoolingDown ? `Обновить код можно через ${roomCodeRefresh.remainingSeconds} с` : 'Обновить код комнаты';

  useEffect(() => {
    if (account.status === 'loading') return;
    let active = true;
    setRestoreError(false);
    void gmLobbyService.restoreSession(gmName)
      .catch(() => {
        if (active) setRestoreError(true);
      })
      .finally(() => {
        if (active) setRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, [account.status]);

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

  const enterGm = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const created = await createSession();
      if (created) onEnterGm();
    } finally {
      setOpening(false);
    }
  };

  const masterReady = account.status !== 'loading';

  return (
    <Surface className="role-entry__card role-entry__gm-card" aria-label="Создать сессию мастера">
      <SectionHeader title="Подготовка сессии" actions={<Crown size={20} aria-hidden="true" />} />
      {restoreError && <Notice tone="warning">Не удалось восстановить предыдущую комнату. Можно открыть новую.</Notice>}
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
              disabled={!masterReady || restoringSession || isRoomCodeRefreshCoolingDown}
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
            <IconButton type="button" size="sm" title="Копировать ссылку игрока" aria-label="Копировать ссылку игрока" disabled={!masterReady || restoringSession || !displayedInviteUrl} onClick={() => void copyInvite()}>
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
        <Button variant="primary" type="button" disabled={!masterReady || opening} onClick={() => void enterGm()}>
          {opening ? 'Открываем...' : 'Открыть игру'}
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
