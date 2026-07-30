export type TableSessionRole = 'gm' | 'player';
export type TableConnectionPhase = 'hidden' | 'restoring' | 'reconnecting';

export interface SessionIdentity {
  role: TableSessionRole;
  roomId: string;
  participantId?: string;
}

export interface LiveSessionSummary {
  connected: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'degraded' | 'error';
  role: TableSessionRole | null;
  roomId: string;
  lastSnapshotAt: string | null;
  message: string;
}

export interface TableSessionContext {
  role: TableSessionRole;
  playerRoomId: string;
}

export interface TableConnectionPresentation {
  phase: TableConnectionPhase;
  title: string;
  message: string;
}

export function resolveTableSessionContext(input: {
  explicitRole?: TableSessionRole;
  liveSession: Pick<LiveSessionSummary, 'role' | 'roomId'>;
  storedSession: SessionIdentity | null;
}): TableSessionContext {
  const role = input.explicitRole
    ?? input.liveSession.role
    ?? input.storedSession?.role
    ?? 'gm';
  if (role === 'gm') {
    return { role, playerRoomId: '' };
  }
  const playerRoomId = input.liveSession.role === 'player' && input.liveSession.roomId
    ? input.liveSession.roomId
    : input.storedSession?.role === 'player'
      ? input.storedSession.roomId
      : '';
  return { role, playerRoomId };
}

export function tableConnectionPresentation(input: {
  context: TableSessionContext;
  liveSession: LiveSessionSummary;
  storedSession: SessionIdentity | null;
  selectedParticipantId: string | null;
  hasCharacter: boolean;
  initialWaitDelayed: boolean;
}): TableConnectionPresentation {
  const { context, liveSession, storedSession } = input;
  if (context.role !== 'player' || !context.playerRoomId) {
    return hiddenPresentation();
  }

  const liveSessionMatches = liveSession.role === 'player'
    && liveSession.roomId === context.playerRoomId;
  const storedIdentityMatches = storedSession?.role === 'player'
    && storedSession.roomId === context.playerRoomId
    && Boolean(storedSession.participantId || input.selectedParticipantId);
  const hasCurrentSnapshot = liveSessionMatches && Boolean(liveSession.lastSnapshotAt);

  if (storedIdentityMatches && !hasCurrentSnapshot) {
    if (liveSessionMatches && liveSession.status === 'error') {
      return {
        phase: 'restoring',
        title: 'Не удалось восстановить связь',
        message: liveSession.message
      };
    }
    if (input.initialWaitDelayed) {
      return {
        phase: 'restoring',
        title: 'Мастер пока не ответил',
        message: 'Продолжаем восстанавливать сохраненную сессию.'
      };
    }
    return {
      phase: 'restoring',
      title: liveSessionMatches ? 'Ждем данные от мастера' : 'Восстанавливаем подключение',
      message: 'Сцена и персонаж появятся после синхронизации.'
    };
  }

  const connectionInterrupted = liveSessionMatches && hasCurrentSnapshot && (
    !liveSession.connected
    || liveSession.status === 'connecting'
    || liveSession.status === 'degraded'
    || liveSession.status === 'error'
  );
  if (input.hasCharacter && connectionInterrupted) {
    return {
      phase: 'reconnecting',
      title: liveSession.status === 'error'
        ? 'Связь с сервером мастера потеряна'
        : 'Подключаемся к серверу мастера',
      message: liveSession.message
    };
  }

  return hiddenPresentation();
}

function hiddenPresentation(): TableConnectionPresentation {
  return {
    phase: 'hidden',
    title: '',
    message: ''
  };
}
