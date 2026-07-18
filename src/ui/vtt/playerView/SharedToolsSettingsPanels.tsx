/** @jsxImportSource preact */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'preact/hooks';
import { useStream } from '../../../core/hooks/useStream';
import { inferBasePathFromWorkspacePath, parsePlayerSessionLocation } from '../../../domain/p2p/sessionLinks';
import { P2P_NETWORK_STRATEGY_LABELS, p2pNetworkSettings$ } from '../../../domain/p2p/networkSettings';
import type { P2PTransportPeerDiagnostic, P2PTransportPeerRouteDiagnostic, P2PTransportRouteDiagnostic, P2PTransportStrategy } from '../../../services/p2p/P2PTransportAdapter';
import type { P2PSessionState } from '../../../services/P2PSessionService';
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
import { Badge, type BadgeTone } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { Checkbox } from '../../components/common/Checkbox';
import { SelectControl, SelectField, TextControl, TextField } from '../../components/common/Field';
import { IconButton } from '../../components/common/IconButton';
import type { TableViewRole } from './types';

export function SharedToolsGameSettingsPanel({ game }: { game: GameState }) {
  const sceneTable = useStream(sceneTableService.sceneTable$);
  return (
    <section className="player-tools-settings-panel">
      <TextField
        className="player-tools-field player-tools-game-name"
        label="Название игры"
        value={game.name}
        onInput={(event) => gameService.updateGame({ name: event.currentTarget.value })}
        placeholder="Без названия"
      />
      <div className="player-tools-setting-choices">
        <Checkbox
          layout="row"
          checked={game.autoApplyRollConsequences}
          label={<SettingChoiceLabel title="Применять последствия бросков автоматически" body="Страх и другие результаты сразу меняют состояние игры." />}
          onChange={(event) => gameService.updateSettings({ autoApplyRollConsequences: event.currentTarget.checked })}
        />
        <Checkbox
          layout="row"
          checked={game.showCoins}
          label={<SettingChoiceLabel title="Использовать монеты" body="Показывать кошелёк и учитывать монеты в листах героев." />}
          onChange={(event) => gameService.updateSettings({ showCoins: event.currentTarget.checked })}
        />
      </div>
      <SelectField
        label="Передача музыки сцены"
        value={sceneTable.musicDeliveryMode}
        onChange={(event) => sceneTableService.setSceneMusicDeliveryMode(event.currentTarget.value as 'download' | 'broadcast')}
      >
        <option value="download">Сначала загрузить файл</option>
        <option value="broadcast">Передавать во время воспроизведения</option>
      </SelectField>
    </section>
  );
}

function SettingChoiceLabel({ title, body }: { title: string; body: string }) {
  return (
    <span className="player-tools-setting-copy" title={body}>
      <strong>{title}</strong>
    </span>
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
      <div className="player-tools-section-actions">
        <Button size="sm" type="button" iconBefore={<Plus size={15} aria-hidden="true" />} onClick={() => sceneTableService.createPlayerSeat({ name: `Игрок ${playerSeats.length + 1}`, characterId: characterOptions[playerSeats.length]?.id })}>
          Добавить игрока
        </Button>
      </div>
      <div className="player-tools-player-list">
        {playerSeats.map((seat) => (
          <article className="player-tools-player-row" key={seat.id}>
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
  const [playerRoomId, setPlayerRoomId] = useState(() => initialPlayerRoomId());
  const settingsInviteContext = currentSettingsInviteContext();
  const displayedInviteLink = role === 'gm' ? p2pSessionService.previewInviteUrl(settingsInviteContext) : '';
  const syncRoomId = role === 'gm' ? p2pSessionService.getGmRoomId() : playerRoomId;
  const canDisconnectP2P = p2pConnected && role !== 'gm';
  const hasConnectedPlayers = role !== 'gm' || p2pPeers.length > 0;
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
      {p2pMessage && <p className="player-tools-status" role="status">{p2pMessage}</p>}
      {role === 'gm' && (
        <div className="player-tools-invite">
          <strong>Ссылка-приглашение</strong>
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
      <div className="player-tools-auto-network">
        <span>Сигналинг</span>
        <strong>Auto</strong>
        <small>Supabase / Nostr / MQTT / BT tracker</small>
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

export function SharedToolsDiagnosticsSettingsPanel({ compact = false, role }: { compact?: boolean; role: TableViewRole }) {
  const liveSession = useStream(p2pSessionService.session$);
  const session = e2eP2PDiagnosticsFixture() ?? liveSession;
  const {
    connected: p2pConnected,
    lastSnapshotAt: p2pLastSnapshotAt,
    peerId: p2pPeerId,
    peers: p2pPeers,
    role: p2pRole,
    routes: p2pRoutes,
    routePeers: p2pRoutePeers,
    roomId: p2pActiveRoomId,
    status: p2pStatus
  } = session;
  const networkSettings = useStream(p2pNetworkSettings$);
  const sceneTable = useStream(sceneTableService.sceneTable$);
  const hasConnectedPlayers = role !== 'gm' || p2pSessionService.hasConnectedPlayers();
  const displayedP2PStatus = role === 'gm' && p2pConnected && !hasConnectedPlayers ? 'Ожидает игроков' : p2pStatusLabel(p2pStatus);
  const visibleRoutePeers = p2pPeers.length > 0
    ? p2pPeers.map((peerId) => p2pRoutePeers.find((peer) => peer.peerId === peerId) ?? createEmptyPeerDiagnostic(peerId))
    : p2pRoutePeers.filter((peer) => peer.activeStrategy);
  const peerNames = participantPeerNames(sceneTable.participants);

  return (
    <section className={`player-tools-settings-panel player-tools-diagnostics ${compact ? 'player-tools-diagnostics--compact' : ''}`}>
      <dl className="player-tools-sync__meta">
        {role === 'gm' && <div><dt>Активная комната</dt><dd aria-label="Активная комната">{p2pActiveRoomId || 'нет'}</dd></div>}
        <div><dt>Статус</dt><dd aria-label="Статус">{displayedP2PStatus}</dd></div>
        <div><dt>Режим</dt><dd aria-label="Режим">{P2P_NETWORK_STRATEGY_LABELS[networkSettings.strategy]}</dd></div>
        <div><dt>Роль</dt><dd aria-label="Роль">{p2pRole ?? 'нет'}</dd></div>
        <div><dt>ID подключения</dt><dd aria-label="ID подключения">{p2pPeerId ?? 'нет'}</dd></div>
        <div><dt>Логических peer</dt><dd aria-label="Логических peer">{p2pPeers.length}</dd></div>
        <div><dt>Последнее обновление</dt><dd aria-label="Последнее обновление">{p2pLastSnapshotAt ? new Date(p2pLastSnapshotAt).toLocaleTimeString() : 'нет'}</dd></div>
      </dl>
      <div className="player-tools-peer-list" aria-label="Маршруты соединений">
        {visibleRoutePeers.map((peer) => (
          <Card
            className="player-tools-peer-card"
            key={peer.peerId}
            title={peerNames.get(peer.peerId) ?? fallbackPeerName(peer.peerId, role)}
            subtitle={<span title={peer.peerId}>{shortPeerId(peer.peerId)}</span>}
            actions={<Badge tone={peer.activeStrategy ? 'gold' : 'neutral'}>{peer.activeStrategy ? P2P_ROUTE_LABELS[peer.activeStrategy] : 'Нет активного'}</Badge>}
          >
            <div className="player-tools-peer-routes">
              {P2P_ROUTE_COLUMNS.map((strategy) => (
                <PeerRouteStatus key={strategy} route={peer.routes.find((item) => item.strategy === strategy)} strategy={strategy} />
              ))}
            </div>
          </Card>
        ))}
        {visibleRoutePeers.length === 0 && (
          <Card className="player-tools-peer-card player-tools-peer-card--empty" title="Нет подключений" subtitle="Транспорты готовы к новому peer">
            <div className="player-tools-peer-routes">
              {P2P_ROUTE_COLUMNS.map((strategy) => (
                <TransportRouteStatus key={strategy} route={p2pRoutes.find((item) => item.strategy === strategy)} strategy={strategy} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

function e2eP2PDiagnosticsFixture(): P2PSessionState | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.webdriver) return null;
  return (window as typeof window & { __DAGGERHEART_E2E_P2P_DIAGNOSTICS__?: P2PSessionState }).__DAGGERHEART_E2E_P2P_DIAGNOSTICS__ ?? null;
}

const P2P_ROUTE_COLUMNS: P2PTransportStrategy[] = ['supabase', 'nostr', 'mqtt', 'torrent'];
const P2P_ROUTE_LABELS: Record<P2PTransportStrategy, string> = {
  supabase: 'Supabase',
  nostr: 'Nostr',
  mqtt: 'MQTT',
  torrent: 'Torrent'
};

function createEmptyPeerDiagnostic(peerId: string): P2PTransportPeerDiagnostic {
  return {
    peerId,
    activeStrategy: null,
    routes: P2P_ROUTE_COLUMNS.map((strategy) => ({
      strategy,
      status: 'unknown' as const,
      lastSeenAt: null,
      rttMs: null
    }))
  };
}

function participantPeerNames(participants: Record<string, TableParticipant>): Map<string, string> {
  const names = new Map<string, string>();
  Object.values(participants).forEach((participant) => {
    if (!participant.peerId || !participant.name.trim()) return;
    names.set(participant.peerId, participant.connected ? participant.name.trim() : `${participant.name.trim()} (offline)`);
  });
  return names;
}

function fallbackPeerName(peerId: string, localRole: TableViewRole): string {
  if (localRole === 'player') {
    return 'Мастер';
  }
  return `Игрок ${shortPeerId(peerId)}`;
}

function PeerRouteStatus({ route, strategy }: { route?: P2PTransportPeerRouteDiagnostic; strategy: P2PTransportStrategy }) {
  const detail = route ? peerRouteDetail(route) : '';
  const label = P2P_ROUTE_LABELS[strategy];
  const status = route ? formatPeerRouteStatus(route.status) : 'нет';
  return (
    <details className="player-tools-peer-route">
      <summary aria-label={`${label}: ${status}`}>
        <span>{label}</span>
        <Badge tone={peerRouteTone(route)}>{status}</Badge>
        {detail && <small>{detail}</small>}
      </summary>
      <small className="player-tools-peer-route__details">{formatPeerRouteTitle(route)}</small>
    </details>
  );
}

function TransportRouteStatus({ route, strategy }: { route?: P2PTransportRouteDiagnostic; strategy: P2PTransportStrategy }) {
  const detail = route ? transportRouteDetail(route) : '';
  const label = P2P_ROUTE_LABELS[strategy];
  const status = route ? formatRouteStatus(route.status) : 'нет';
  return (
    <details className="player-tools-peer-route">
      <summary aria-label={`${label}: ${status}`}>
        <span>{label}</span>
        <Badge tone={transportRouteTone(route)}>{status}</Badge>
        {detail && <small>{detail}</small>}
      </summary>
      <small className="player-tools-peer-route__details">{formatRouteDiagnosticTitle(route)}</small>
    </details>
  );
}

function peerRouteDetail(route: P2PTransportPeerRouteDiagnostic): string {
  if (route.error) return route.error;
  const parts: string[] = [];
  if (route.rttMs !== null) parts.push(`${Math.round(route.rttMs)} ms`);
  if (route.physicalPeerId) parts.push(shortPeerId(route.physicalPeerId));
  return parts.join(' — ');
}

function transportRouteDetail(route: P2PTransportRouteDiagnostic): string {
  if (route.error) return route.error;
  const parts: string[] = [];
  if (route.activePeers.length > 0) parts.push(`${route.activePeers.length} peer`);
  if (route.rttMs !== null) parts.push(`${Math.round(route.rttMs)} ms`);
  return parts.join(' — ');
}

function peerRouteTone(route?: P2PTransportPeerRouteDiagnostic): BadgeTone {
  if (!route || route.status === 'unknown') return 'neutral';
  if (route.status === 'active') return 'gold';
  if (route.status === 'available') return 'success';
  if (route.status === 'failed') return 'danger';
  if (route.status === 'lost') return 'gold';
  return 'neutral';
}

function transportRouteTone(route?: P2PTransportRouteDiagnostic): BadgeTone {
  if (!route) return 'neutral';
  if (route.status === 'ready') return 'success';
  if (route.status === 'probing') return 'blue';
  if (route.status === 'failed') return 'danger';
  return 'gold';
}

function formatRouteDiagnosticTitle(route?: P2PTransportRouteDiagnostic): string {
  if (!route) return 'Маршрут не найден';
  const parts = [
    `Статус: ${formatRouteStatus(route.status)}`,
    `Активных peer: ${route.activePeers.length}`,
    route.rttMs !== null ? `Пинг: ${Math.round(route.rttMs)} ms` : 'Пинг: нет',
    route.lastSeenAt ? `Последний сигнал: ${new Date(route.lastSeenAt).toLocaleTimeString()}` : 'Последний сигнал: нет'
  ];
  if (route.error) parts.push(`Ошибка: ${route.error}`);
  return parts.join('\n');
}

function formatPeerRouteTitle(route?: P2PTransportPeerRouteDiagnostic): string {
  if (!route) return 'Маршрут не найден';
  const parts = [
    `Статус: ${formatPeerRouteStatus(route.status)}`,
    route.physicalPeerId ? `Физический peer: ${route.physicalPeerId}` : 'Физический peer: нет',
    route.rttMs !== null ? `Пинг: ${Math.round(route.rttMs)} ms` : 'Пинг: нет',
    route.lastSeenAt ? `Последний сигнал: ${new Date(route.lastSeenAt).toLocaleTimeString()}` : 'Последний сигнал: нет'
  ];
  if (route.error) parts.push(`Ошибка: ${route.error}`);
  return parts.join('\n');
}

function formatRouteStatus(status: P2PTransportRouteDiagnostic['status']): string {
  switch (status) {
    case 'ready':
      return 'готов';
    case 'probing':
      return 'проверка';
    case 'failed':
      return 'ошибка';
    case 'degraded':
      return 'нестабильно';
  }
}

function formatPeerRouteStatus(status: P2PTransportPeerRouteDiagnostic['status']): string {
  switch (status) {
    case 'active':
      return 'активен';
    case 'available':
      return 'доступен';
    case 'failed':
      return 'ошибка';
    case 'lost':
      return 'потерян';
    case 'unknown':
      return 'нет сигнала';
  }
}

function shortPeerId(peerId: string): string {
  if (peerId.length <= 16) return peerId;
  return `${peerId.slice(0, 10)}...${peerId.slice(-4)}`;
}

function initialPlayerRoomId(): string {
  if (typeof window === 'undefined') return '';
  return parsePlayerSessionLocation(window.location.pathname, inferBasePathFromWorkspacePath(window.location.pathname))?.roomId ?? '';
}
