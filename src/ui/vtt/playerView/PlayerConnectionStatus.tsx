/** @jsxImportSource preact */
import { useStore } from '../../../core/hooks/useStore';
import { p2pSessionService } from '../../../services/serviceRegistry';
import type { P2PSessionState } from '../../../services/P2PSessionService';
import type { TableViewRole } from './types';

export function PlayerConnectionStatus({ hasCharacter, hasSessionRoom, role }: { hasCharacter: boolean; hasSessionRoom: boolean; role: TableViewRole }) {
  const p2pSession = useStore(p2pSessionService.sessionStore);
  const showConnectionOverlay = role === 'player' && hasSessionRoom && hasCharacter && (
    !p2pSession.connected ||
    p2pSession.status === 'connecting' ||
    p2pSession.status === 'degraded' ||
    p2pSession.status === 'error' ||
    !p2pSession.lastSnapshotAt
  );
  const connectionDiagnostic = p2pConnectionDiagnosticText(p2pSession);

  return (
    <>
      {showConnectionOverlay && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{p2pSession.status === 'error' ? 'Связь с сервером мастера потеряна' : 'Подключаемся к серверу мастера'}</strong>
          <span>{p2pSession.message}</span>
        </section>
      )}
      {connectionDiagnostic && (
        <div className="player-connection-diagnostic" role="status" aria-live="polite">
          {connectionDiagnostic}
        </div>
      )}
    </>
  );
}

function p2pConnectionDiagnosticText(session: P2PSessionState): string {
  if (!session.role || session.status === 'disconnected') {
    return '';
  }
  if (session.status === 'error') {
    return `P2P: ошибка - ${session.message}`;
  }
  if (session.status === 'connecting') {
    return `P2P: подключаемся - комната ${session.roomId || '...'}`;
  }
  if (session.role === 'player') {
    if (!session.lastSnapshotAt) {
      return 'P2P: запрашиваем данные игры - повтор каждые 5 с';
    }
    if (session.status === 'degraded' || session.peers.length === 0) {
      return 'P2P: переподключаемся к мастеру - повтор каждые 5 с';
    }
    return '';
  }
  if (session.status === 'degraded') {
    return 'P2P: игроки отключились - ждем повторное подключение';
  }
  if (session.peers.length === 0) {
    return `P2P: ждем игроков - комната ${session.roomId}`;
  }
  return '';
}
