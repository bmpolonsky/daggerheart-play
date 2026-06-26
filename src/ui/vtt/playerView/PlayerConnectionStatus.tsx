/** @jsxImportSource preact */
import { useStream } from '../../../core/hooks/useStream';
import { p2pSessionService } from '../../../services/serviceRegistry';
import type { TableViewRole } from './types';

export function PlayerConnectionStatus({ hasCharacter, hasSessionRoom, role }: { hasCharacter: boolean; hasSessionRoom: boolean; role: TableViewRole }) {
  const p2pSession = useStream(p2pSessionService.session$);
  const waitingForInitialSnapshot = role === 'player' && hasSessionRoom && !p2pSession.lastSnapshotAt;
  const showConnectionOverlay = role === 'player' && hasSessionRoom && (
    waitingForInitialSnapshot ||
    hasCharacter && (
    !p2pSession.connected ||
    p2pSession.status === 'connecting' ||
    p2pSession.status === 'degraded' ||
    p2pSession.status === 'error'
    )
  );
  const title = p2pSession.status === 'error'
    ? 'Связь с сервером мастера потеряна'
    : waitingForInitialSnapshot
      ? 'Ждем данные от мастера'
      : 'Подключаемся к серверу мастера';
  const message = waitingForInitialSnapshot
    ? 'Сцена и персонаж появятся после синхронизации.'
    : p2pSession.message;

  return (
    <>
      {showConnectionOverlay && (
        <section className="player-connection-overlay" role="status" aria-live="polite">
          <div className="player-connection-overlay__spinner" aria-hidden="true" />
          <strong>{title}</strong>
          <span>{message}</span>
        </section>
      )}
    </>
  );
}
