import { sanitizeTechnicalJournalEntry, type TechnicalJournalEntry } from '../../core/observability/technicalJournal';
import type { P2PSessionState } from '../../services/P2PSessionService';
import type { P2PMediaConnectionDiagnostic } from '../../services/p2p/P2PTransportAdapter';
import type { ConnectionStageDiagnostic } from './connectionDiagnostics';

export const CONNECTION_STAGE_LABELS: Record<ConnectionStageDiagnostic['id'], string> = {
  'auth-session': 'Проверка входа в Supabase',
  'auth-sign-in': 'Гостевой вход в Supabase',
  'auth-bind': 'Авторизация облачного соединения',
  'room-open': 'Открытие облачной комнаты',
  'room-join': 'Вход в облачную комнату',
  realtime: 'Подписка на обновления (WebSocket)',
  state: 'Загрузка состояния игры',
  events: 'Загрузка событий',
  roster: 'Загрузка списка участников',
  'p2p-supabase': 'Запуск P2P через Supabase',
  'p2p-nostr': 'Запуск P2P через Nostr',
  'p2p-torrent': 'Запуск P2P через Torrent',
  handshake: 'Обмен приветствиями'
};
export const CONNECTION_STAGE_STATUS_LABELS: Record<ConnectionStageDiagnostic['status'], string> = {
  pending: 'не начат', running: 'выполняется', succeeded: 'готово', failed: 'ошибка',
  'timed-out': 'время ожидания истекло', cancelled: 'отменён'
};
export function orderedConnectionStages(stages: ConnectionStageDiagnostic[]): ConnectionStageDiagnostic[] {
  const order = Object.keys(CONNECTION_STAGE_LABELS);
  return [...stages].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
export function connectionStageErrorLabel(code: unknown): string | null {
  const labels: Record<string, string> = {
    timeout: 'Нет ответа в отведённое время', cancelled: 'Операция отменена', network_error: 'Сетевая ошибка',
    auth_required: 'Требуется вход', auth_failed: 'Ошибка авторизации', room_not_found: 'Комната не найдена',
    master_offline: 'Мастер не в сети', room_in_use: 'Комната уже открыта', participant_in_use: 'Участник уже подключён',
    rate_limited: 'Слишком много запросов', server_error: 'Ошибка сервера', realtime_error: 'Ошибка WebSocket', realtime_closed: 'WebSocket закрыт'
  };
  return typeof code === 'string' && Object.hasOwn(labels, code) ? labels[code] : null;
}
const SAFE_CODES = new Set(['timeout', 'cancelled', 'network_error', 'auth_failed', 'auth_required', 'room_not_found', 'master_offline', 'room_in_use', 'participant_in_use', 'rate_limited', 'server_error', 'realtime_error', 'realtime_closed', 'unknown_error', 'operation_failed']);
const safeCode = (value: unknown) => typeof value === 'string' && SAFE_CODES.has(value) ? value : value ? 'unknown_error' : undefined;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
const enumValue = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value) ? value : 'unknown';

export function stageElapsedMs(stage: ConnectionStageDiagnostic, now: number): number | null {
  return stage.startedAt === null ? null : Math.max(0, (stage.finishedAt ?? now) - stage.startedAt);
}

export function connectionDiagnosticHint(session: Pick<P2PSessionState, 'connectionDiagnostics' | 'connected' | 'lastSnapshotAt' | 'role' | 'peers' | 'transportMode'> & Partial<Pick<P2PSessionState, 'status'>>): string {
  if (session.status === 'disconnected') return 'Нет активного подключения к игре.';
  if (session.status === 'degraded') return 'Связь с игрой нестабильна. Последнее полученное состояние не подтверждает доставку новых обновлений.';
  const stages = session.connectionDiagnostics ?? [];
  const fallbackSucceeded = session.connected && session.transportMode === 'p2p' && stages.some(stage => stage.errorCode === 'room_not_found' || stage.errorCode === 'master_offline');
  const mainStages = stages.filter(stage => !stage.id.startsWith('p2p-') && (!fallbackSucceeded || stage.id === 'handshake'));
  const directStages = session.connected ? [] : stages.filter(stage => stage.id.startsWith('p2p-'));
  const failed = (stage: ConnectionStageDiagnostic) => stage.status === 'failed' || stage.status === 'timed-out';
  const active = mainStages.find(failed) ?? mainStages.find(stage => stage.status === 'running')
    ?? directStages.find(stage => stage.status === 'running') ?? directStages.find(failed);
  const failure = active && failed(active);
  if (active && (!session.connected || session.status === 'connecting' || session.status === 'error')) {
    const label = CONNECTION_STAGE_LABELS[active.id] ?? 'Подключение';
    const prefix = failure ? `Остановилось: ${label}.` : `Сейчас: ${label}.`;
    if (!failure) return prefix;
    if (active.errorCode === 'room_not_found' || active.errorCode === 'master_offline') return `${prefix} Попросите мастера проверить, что сетевая игра запущена и ссылка актуальна.`;
    if (active.errorCode === 'auth_required') return `${prefix} Для мастера требуется вход в аккаунт.`;
    if (active.id.startsWith('p2p-')) return `${prefix} Это запуск одного прямого маршрута, а не проверка связи с участником. Другие маршруты показаны отдельно; в облачном режиме игра может продолжать работать через сервер.`;
    if (active.id === 'realtime') return `${prefix} Проверьте, разрешён ли WebSocket в этой сети. Сравните с другой сетью или VPN на том же устройстве.`;
    if (active.id.startsWith('auth') && active.status === 'timed-out') return `${prefix} Supabase не ответил вовремя. Это не доказывает блокировку. Проверка входа может завершиться позже; автоматический повтор не выполняется. Сравните с другой сетью или VPN на этом устройстве.`;
    if (active.id.startsWith('auth') || active.id.startsWith('room')) return `${prefix} Возможны недоступность Supabase, ошибка входа или ответ сервера. Таймаут сам по себе не доказывает блокировку. Сравните с другой сетью или VPN на том же устройстве.`;
    return `${prefix} Соединение не завершило этот этап. Сохраните отчёт и повторите подключение после проверки сети.`;
  }
  if (session.status === 'error') return 'Ошибка подключения к игре. Сохраните отчёт и повторите подключение.';
  if (session.status === 'connecting') return 'Подключаемся к игре. Ожидаем завершения соединения.';
  if (fallbackSucceeded) return session.lastSnapshotAt || session.role === 'gm'
    ? 'Облачная комната недоступна; подключение продолжено по P2P. Связь с участниками и данные проверяются отдельно.'
    : 'Облачная комната недоступна; подключение продолжено по P2P, ожидаем состояние игры.';
  if (session.connected && session.role === 'gm' && session.peers.length === 0) return `${session.transportMode === 'hybrid' ? 'Облачное подключение готово.' : 'Сетевая игра запущена.'} Мастер ожидает игроков.`;
  if (session.connected && session.role === 'player' && !session.lastSnapshotAt) return 'Подключение готово, но состояние игры ещё не получено.';
  if (session.connected) return session.transportMode === 'hybrid' ? 'Облачное подключение готово.' : 'Сетевая игра запущена.';
  return 'Нет активного подключения к игре.';
}

/** Explicit allowlist: never copy a URL, identity, token, raw error, game state or arbitrary session field. */
export function createSafeDiagnosticReport(session: P2PSessionState, media: P2PMediaConnectionDiagnostic[], now: number, release: string, online: boolean, journal: TechnicalJournalEntry[] = []) {
  return {
    schemaVersion: 2,
    journal: journal.map(sanitizeTechnicalJournalEntry).filter((entry): entry is TechnicalJournalEntry => entry !== null),
    generatedAt: new Date(now).toISOString(),
    release: /^(?:daggerheart-play@)?[a-f0-9]{7,40}$/.test(release) ? release : 'unknown',
    online,
    session: {
      connected: session.connected === true,
      status: enumValue(session.status, ['disconnected', 'connecting', 'connected', 'degraded', 'error']),
      role: enumValue(session.role, ['gm', 'player']),
      transportMode: enumValue(session.transportMode, ['p2p', 'hybrid']),
      peers: session.peers.length,
      directPeers: session.directPeers?.length ?? 0,
      snapshotReceived: Boolean(session.lastSnapshotAt),
      connectionDiagnostics: orderedConnectionStages(session.connectionDiagnostics ?? []).filter(stage => Object.hasOwn(CONNECTION_STAGE_LABELS, stage.id)).map(stage => ({
        id: stage.id,
        attempt: Number.isSafeInteger(stage.attempt) && stage.attempt! > 0 ? stage.attempt : undefined,
        status: enumValue(stage.status, Object.keys(CONNECTION_STAGE_STATUS_LABELS)),
        elapsedMs: finite(stageElapsedMs(stage, now)),
        timeoutMs: finite(stage.timeoutMs),
        httpStatus: Number.isInteger(stage.httpStatus) && stage.httpStatus! >= 100 && stage.httpStatus! <= 599 ? stage.httpStatus : undefined,
        errorCode: safeCode(stage.errorCode)
      })),
      routes: session.routes.map(route => ({
        strategy: enumValue(route.strategy, ['supabase', 'nostr', 'torrent']),
        status: enumValue(route.status, ['waiting', 'probing', 'ready', 'degraded', 'failed']),
        activePeers: route.activePeers.length,
        rttMs: finite(route.rttMs),
        hasError: Boolean(route.error)
      }))
    },
    media: media.map(connection => ({
      strategy: enumValue(connection.strategy, ['supabase', 'nostr', 'torrent']),
      connectionState: enumValue(connection.connectionState, ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']),
      iceConnectionState: enumValue(connection.iceConnectionState, ['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']),
      localCandidateType: enumValue(connection.localCandidateType, ['host', 'srflx', 'prflx', 'relay']),
      remoteCandidateType: enumValue(connection.remoteCandidateType, ['host', 'srflx', 'prflx', 'relay']),
      protocol: enumValue(connection.protocol, ['udp', 'tcp']),
      rtp: connection.rtp.map(stat => ({
        direction: enumValue(stat.direction, ['inbound', 'outbound']), kind: enumValue(stat.kind, ['audio', 'video']),
        bytes: finite(stat.bytes), packets: finite(stat.packets), packetsLost: finite(stat.packetsLost), jitterMs: finite(stat.jitterMs)
      }))
    }))
  };
}


/** Human-readable labels are fixed strings, never values copied from user content. */
export function technicalJournalOperationLabel(event: TechnicalJournalEntry): string {
  switch (event.area) {
    case 'network': return CONNECTION_STAGE_LABELS[event.operation];
    case 'startup': return 'Запуск приложения';
    case 'persistence': return event.operation === 'read' ? 'Чтение локальных данных' : 'Сохранение локальных данных';
    case 'import': return event.operation === 'validate' ? 'Проверка импорта' : 'Применение импорта';
    case 'media': return event.operation === 'acquire' ? 'Запрос камеры и микрофона' : 'Передача медиапотока';
  }
}

export function technicalJournalErrorLabel(code: TechnicalJournalEntry['errorCode']): string | null {
  const labels: Record<string, string> = {
    operation_failed: 'Операция не выполнена', storage_unavailable: 'Хранилище недоступно',
    quota_exceeded: 'Недостаточно места в хранилище', invalid_data: 'Некорректные данные',
    media_denied: 'Доступ к устройствам не разрешён', media_unavailable: 'Устройство недоступно'
  };
  return code && Object.hasOwn(labels, code) ? labels[code] : connectionStageErrorLabel(code);
}
