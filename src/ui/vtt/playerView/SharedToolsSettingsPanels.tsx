/** @jsxImportSource preact */
import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../../../domain/p2p/sessionLinks';
import { P2P_NETWORK_STRATEGY_LABELS, p2pNetworkSettings$, writeP2PNetworkSettings, type P2PNetworkStrategy } from '../../../domain/p2p/networkSettings';
import type { Character, GameState } from '../../../domain/rules/types';
import type { TableParticipant } from '../../../domain/tabletop/types';
import {
  gameService,
  p2pSessionService,
  sceneTableService
} from '../../../services/serviceRegistry';
import { toastService } from '../../../services/ToastService';
import {
  currentSettingsInviteContext,
  p2pStatusLabel
} from './helpers';
import { Button } from '../../components/common/Button';
import { SelectControl, SelectField, TextControl, TextField } from '../../components/common/Field';
import { IconButton } from '../../components/common/IconButton';
import { Surface } from '../../components/common/Surface';
import type { TableViewRole } from './types';

export function SharedToolsGameSettingsPanel({ game }: { game: GameState }) {
  return (
    <section className="player-tools-settings-panel">
      <header><strong>Игра</strong></header>
      <TextField
        className="player-tools-field player-tools-game-name"
        label="Название игры"
        value={game.name}
        onInput={(event) => gameService.updateGame({ name: event.currentTarget.value })}
        placeholder="Без названия"
      />
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
        <Button size="sm" type="button" onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
          Добавить игрока
        </Button>
      </header>
      <div className="player-tools-player-list">
        {playerSeats.map((seat) => (
          <Surface as="article" tone="subtle" className="player-tools-player-row" key={seat.id}>
            <TextField label="Имя" value={seat.name} onInput={(event) => sceneTableService.updatePlayerSeat(seat.id, { name: event.currentTarget.value })} />
            <label className="dh-label">
              <span>Персонаж</span>
              <SelectControl value={seat.actorIds[0] ?? ''} onChange={(event) => sceneTableService.updatePlayerSeat(seat.id, { characterId: event.currentTarget.value || null })}>
                <option value="">Не назначен</option>
                {characterOptions.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </SelectControl>
            </label>
            <IconButton variant="danger" size="sm" type="button" title="Удалить игрока" aria-label={`Удалить игрока ${seat.name}`} onClick={() => sceneTableService.removePlayerSeat(seat.id)}>
              <Trash2 size={15} aria-hidden="true" />
            </IconButton>
          </Surface>
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
  const [playerRoomId, setPlayerRoomId] = useState(() => initialPlayerRoomId());
  const networkSettings = useStream(p2pNetworkSettings$);
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
      toastService.show('Ссылка скопирована.', 'success');
    } catch {
      toastService.show('Скопируйте ссылку вручную.', 'warning');
    }
  };

  const reconnect = async () => {
    if (!syncRoomId) return;
    await p2pSessionService.stop({ forgetSession: false });
    if (role === 'gm') {
      await p2pSessionService.startGmRoom({ roomId: syncRoomId, participantName: game.gmName });
      return;
    }
    await p2pSessionService.startPlayerRoom({ roomId: playerRoomId || syncRoomId });
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
            <span>Ссылка открывает игру игрока и подключает его к комнате.</span>
          </header>
          <div className="player-tools-actions">
            <Button variant="primary" size="sm" type="button" onClick={() => void createInvite()}>
              Создать ссылку
            </Button>
            <Button size="sm" type="button" disabled={!displayedInviteLink} onClick={() => void copyInvite()}>
              Скопировать
            </Button>
          </div>
          <TextControl readOnly aria-label="Ссылка приглашения" value={displayedInviteLink} placeholder="Ссылка появится после открытия комнаты" />
        </div>
      )}
      {role === 'player' && (
        <div className="player-tools-edit-grid">
          <TextField
            label="Комната"
            value={syncRoomId}
            onInput={(event) => setPlayerRoomId(event.currentTarget.value)}
          />
        </div>
      )}
      <div className="player-tools-edit-grid">
        <SelectField
          label="Сигналинг"
          value={networkSettings.strategy}
          hint={p2pConnected ? 'Применится после переподключения.' : undefined}
          onChange={(event) => writeP2PNetworkSettings({ strategy: event.currentTarget.value as P2PNetworkStrategy })}
        >
          {Object.entries(P2P_NETWORK_STRATEGY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </SelectField>
      </div>
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
          <Button variant="primary" type="button" disabled={p2pConnected} onClick={() => void p2pSessionService.startPlayerRoom({ roomId: playerRoomId })}>
            Подключиться
          </Button>
        )}
        {p2pConnected && (
          <Button type="button" onClick={() => void reconnect()}>
            Переподключиться
          </Button>
        )}
        {role === 'gm' && (
          <Button type="button" disabled={!canPublishSnapshot} title={!hasConnectedPlayers ? 'Сначала должен подключиться игрок.' : undefined} onClick={() => void p2pSessionService.publishSnapshot({ requirePeers: true })}>
            Обновить игроков
          </Button>
        )}
        {role === 'player' && (
          <Button
            type="button"
            disabled={!canDisconnectP2P}
            onClick={() => void p2pSessionService.stop()}
          >
            Отключиться
          </Button>
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
  const networkSettings = useStream(p2pNetworkSettings$);
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
        <div><dt>Сигналинг</dt><dd>{P2P_NETWORK_STRATEGY_LABELS[networkSettings.strategy]}</dd></div>
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
