/** @jsxImportSource preact */
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../../../domain/p2p/sessionLinks';
import type { Character, GameState } from '../../../domain/rules/types';
import type { TableParticipant } from '../../../domain/tabletop/types';
import {
  gameService,
  p2pSessionService,
  sceneTableService
} from '../../../services/serviceRegistry';
import {
  currentSettingsInviteContext,
  p2pStatusLabel
} from './helpers';
import type { TableViewRole } from './types';

export function SharedToolsGameSettingsPanel({ game }: { game: GameState }) {
  return (
    <section className="player-tools-settings-panel">
      <header><strong>Игра</strong></header>
      <label className="player-tools-field player-tools-game-name">
        <span>Название игры</span>
        <input
          value={game.name}
          onInput={(event) => gameService.updateGame({ name: event.currentTarget.value })}
          placeholder="Без названия"
        />
      </label>
      <label className="player-tools-toggle">
        <input
          type="checkbox"
          checked={game.autoApplyRollConsequences}
          onChange={(event) => gameService.updateSettings({ autoApplyRollConsequences: event.currentTarget.checked })}
        />
        <span>Автоматически применять последствия бросков</span>
      </label>
      <label className="player-tools-toggle">
        <input
          type="checkbox"
          checked={game.showCoins}
          onChange={(event) => gameService.updateSettings({ showCoins: event.currentTarget.checked })}
        />
        <span>Использовать монеты</span>
      </label>
    </section>
  );
}

export function SharedToolsPlayersSettingsPanel({
  characterOptions,
  playerSeats
}: {
  characterOptions: Character[];
  playerSeats: TableParticipant[];
}) {
  return (
    <section className="player-tools-settings-panel">
      <header>
        <strong>Игроки</strong>
        <button className="dh-button" type="button" onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
          Добавить игрока
        </button>
      </header>
      <div className="player-tools-player-list">
        {playerSeats.map((seat) => (
          <article className="player-tools-player-row" key={seat.id}>
            <label>
              <span>Имя</span>
              <input value={seat.name} onInput={(event) => sceneTableService.updatePlayerSeat(seat.id, { name: event.currentTarget.value })} />
            </label>
            <label>
              <span>Персонаж</span>
              <select value={seat.actorIds[0] ?? ''} onChange={(event) => sceneTableService.updatePlayerSeat(seat.id, { characterId: event.currentTarget.value || null })}>
                <option value="">Не назначен</option>
                {characterOptions.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => sceneTableService.removePlayerSeat(seat.id)}>Удалить</button>
          </article>
        ))}
        {playerSeats.length === 0 && <p className="player-tools-empty">Игроки еще не созданы.</p>}
      </div>
    </section>
  );
}

export function SharedToolsConnectionSettingsPanel({
  game,
  role
}: {
  game: GameState;
  role: TableViewRole;
}) {
  const {
    connected: p2pConnected,
    lastSnapshotAt: p2pLastSnapshotAt,
    message: p2pMessage,
    peers: p2pPeers,
    roomId: p2pActiveRoomId,
    status: p2pStatus
  } = useStream(p2pSessionService.session$);
  const { message: inviteMessage } = useStream(p2pSessionService.invite$);
  const [playerRoomId, setPlayerRoomId] = useState(() => initialPlayerRoomId());
  const [playerPassword, setPlayerPassword] = useState(() => initialPlayerPassword());
  const settingsInviteContext = currentSettingsInviteContext();
  const displayedInviteLink = role === 'gm' ? p2pSessionService.previewInviteUrl(settingsInviteContext) : '';
  const syncRoomId = role === 'gm' ? p2pSessionService.getGmRoomId() : playerRoomId;
  const canDisconnectP2P = p2pConnected && role !== 'gm';
  const hasConnectedPlayers = role !== 'gm' || p2pSessionService.hasConnectedPlayers();
  const canPublishSnapshot = role === 'gm' && p2pSessionService.canPublishSnapshotToPlayers();
  const displayedP2PStatus = role === 'gm' && p2pConnected && !hasConnectedPlayers ? 'Ожидает игроков' : p2pStatusLabel(p2pStatus);

  useEffect(() => {
    if (role !== 'player' || !p2pActiveRoomId) return;
    setPlayerRoomId(p2pActiveRoomId);
  }, [p2pActiveRoomId, role]);

  const createInvite = async () => {
    try {
      await p2pSessionService.createGmInviteFromDraft({
        participantName: game.gmName,
        ...currentSettingsInviteContext()
      });
    } catch {
      // Error message is stored in the invite store by P2PSessionService.
    }
  };

  const copyInvite = async () => {
    if (!displayedInviteLink) return;
    try {
      await navigator.clipboard?.writeText(displayedInviteLink);
      p2pSessionService.setInviteMessage('Ссылка скопирована.');
    } catch {
      p2pSessionService.setInviteMessage('Скопируйте ссылку вручную.');
    }
  };

  return (
    <section className="player-tools-settings-panel">
      <header>
        <strong>{role === 'gm' ? 'Подключение игроков' : 'Подключение к мастеру'}</strong>
        <span>{p2pMessage}</span>
      </header>
      {role === 'gm' && (
        <div className="player-tools-invite">
          <header>
            <strong>Приглашение</strong>
            <span>{inviteMessage || 'Ссылка открывает игру игрока и подключает его к комнате.'}</span>
          </header>
          <div className="player-tools-actions">
            <button className="dh-button dh-variant-primary" type="button" onClick={() => void createInvite()}>
              Создать ссылку
            </button>
            <button className="dh-button" type="button" disabled={!displayedInviteLink} onClick={() => void copyInvite()}>
              Скопировать
            </button>
          </div>
          <input readOnly aria-label="Ссылка приглашения" value={displayedInviteLink} placeholder="Ссылка появится после открытия комнаты" />
        </div>
      )}
      {role === 'player' && (
        <div className="player-tools-edit-grid">
          <label>
            <span>Комната</span>
            <input
              value={syncRoomId}
              onInput={(event) => setPlayerRoomId(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              value={playerPassword}
              onInput={(event) => setPlayerPassword(event.currentTarget.value)}
              placeholder="Опционально"
            />
          </label>
        </div>
      )}
      <div className="player-tools-sync__summary">
        <div>
          <span>Статус</span>
          <strong>{displayedP2PStatus}</strong>
        </div>
        <div>
          <span>{role === 'gm' ? 'Игроки онлайн' : 'Подключения'}</span>
          <strong>{p2pPeers.length}</strong>
        </div>
        <div>
          <span>Обновлено</span>
          <strong>{p2pLastSnapshotAt ? new Date(p2pLastSnapshotAt).toLocaleTimeString() : 'нет'}</strong>
        </div>
      </div>
      <div className="player-tools-actions">
        {role === 'player' && (
          <button className="dh-button dh-variant-primary" type="button" onClick={() => void p2pSessionService.startPlayerRoom({ roomId: playerRoomId, password: playerPassword })}>
            Подключиться
          </button>
        )}
        {role === 'gm' && (
          <button className="dh-button" type="button" disabled={!canPublishSnapshot} title={!hasConnectedPlayers ? 'Сначала должен подключиться игрок.' : undefined} onClick={() => void p2pSessionService.publishSnapshot({ requirePeers: true })}>
            Обновить игроков
          </button>
        )}
        {role === 'player' && (
          <button
            className="dh-button"
            type="button"
            disabled={!canDisconnectP2P}
            onClick={() => void p2pSessionService.stop()}
          >
            Отключиться
          </button>
        )}
      </div>
    </section>
  );
}

export function SharedToolsDiagnosticsSettingsPanel({ role }: { role: TableViewRole }) {
  const {
    connected: p2pConnected,
    lastSnapshotAt: p2pLastSnapshotAt,
    message: p2pMessage,
    peerId: p2pPeerId,
    peers: p2pPeers,
    role: p2pRole,
    roomId: p2pActiveRoomId,
    status: p2pStatus
  } = useStream(p2pSessionService.session$);
  const hasConnectedPlayers = role !== 'gm' || p2pSessionService.hasConnectedPlayers();
  const displayedP2PStatus = role === 'gm' && p2pConnected && !hasConnectedPlayers ? 'Ожидает игроков' : p2pStatusLabel(p2pStatus);

  return (
    <section className="player-tools-settings-panel">
      <header>
        <strong>Диагностика</strong>
        <span>{p2pMessage}</span>
      </header>
      <dl className="player-tools-sync__meta">
        {role === 'gm' && <div><dt>Активная комната</dt><dd>{p2pActiveRoomId || 'нет'}</dd></div>}
        <div><dt>Статус</dt><dd>{displayedP2PStatus}</dd></div>
        <div><dt>Роль</dt><dd>{p2pRole ?? 'нет'}</dd></div>
        <div><dt>ID подключения</dt><dd>{p2pPeerId ?? 'нет'}</dd></div>
        <div><dt>Подключений</dt><dd>{p2pPeers.length}</dd></div>
        <div><dt>Последнее обновление</dt><dd>{p2pLastSnapshotAt ?? 'нет'}</dd></div>
      </dl>
    </section>
  );
}

function initialPlayerRoomId(): string {
  if (typeof window === 'undefined') return '';
  return parsePlayerSessionLocation(window.location.pathname, inferBasePathFromWorkspacePath(window.location.pathname))?.roomId ?? '';
}

function initialPlayerPassword(): string {
  return '';
}
