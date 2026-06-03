/** @jsxImportSource preact */
import { useEffect, useRef } from 'preact/hooks';
import { Crown, Link2, Trash2 } from 'lucide-react';
import { useStream } from '../../core/hooks/useStream';
import { characterService, gameService, p2pSessionService, sceneTableService } from '../../services/serviceRegistry';
import type { LobbyInviteContext } from './SessionLobby';

interface GmLobbyCardProps {
  inviteContext: LobbyInviteContext;
  onEnterGm: () => void;
}

export function GmLobbyCard({ inviteContext, onEnterGm }: GmLobbyCardProps) {
  const { gmName } = useStream(gameService.game$);
  const { entities: characterEntities, order: characterOrder } = useStream(characterService.characters$);
  const { participants } = useStream(sceneTableService.sceneTable$);
  useStream(p2pSessionService.session$);
  const restoreAttempted = useRef(false);
  const characterOptions = characterOrder.map((id) => characterEntities[id]).filter(Boolean);
  const playerSeats = Object.values(participants).filter((participant) => participant.role === 'player');
  const displayedInviteUrl = p2pSessionService.previewInviteUrl(inviteContext);
  const displayedGmRoomId = p2pSessionService.getGmRoomId();

  useEffect(() => {
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;
    void p2pSessionService.restoreActiveSession('gm', gmName);
  }, [gmName]);

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

  return (
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
        <input value={displayedGmRoomId} readOnly />
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
  );
}
